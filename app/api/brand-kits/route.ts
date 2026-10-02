import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { trackUsage } from "@/lib/analytics/usage";
import { toDeckContext } from "@/lib/ai/deck-context";
import { suggestBrandKit } from "@/lib/ai/brand-kit";
import { prisma } from "@/lib/db";
import { uploadSlideImage } from "@/lib/imagekit";

/**
 * Brand kits.
 *
 *   GET  → the caller's kits and which one is currently active
 *   POST → three modes, chosen by content type:
 *           multipart/form-data  → upload a logo, returns its URL
 *           JSON { mode:"create",  ...fields } → create a kit
 *           JSON { mode:"suggest" }           → AI palette + font suggestion
 *
 * `workspaceId` is NEVER read from the request. It is always the authenticated
 * user's own workspace, so a client cannot create a kit inside somebody else's
 * workspace by posting their id.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

/** Logos are marks, not images: anything larger than this is a mistake. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const LOGO_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

const BRAND_FONTS = [
  "Inter",
  "Geist",
  "IBM Plex Sans",
  "Manrope",
  "Sora",
] as const;

const createSchema = z.object({
  mode: z.literal("create"),
  name: z.string().trim().min(1, "Give the kit a name.").max(80),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || /^https?:\/\//i.test(value), {
      message: "Logo must be an uploaded image.",
    })
    .optional()
    .nullable(),
  primaryColor: z
    .string()
    .trim()
    .regex(HEX, "Use a 6-digit hex colour, for example #1c1917.")
    .optional()
    .nullable(),
  secondaryColor: z
    .string()
    .trim()
    .regex(HEX, "Use a 6-digit hex colour, for example #0b0b0c.")
    .optional()
    .nullable(),
  accentColor: z
    .string()
    .trim()
    .regex(HEX, "Use a 6-digit hex colour, for example #ff7a18.")
    .optional()
    .nullable(),
  headingFont: z.enum(BRAND_FONTS).optional().nullable(),
  bodyFont: z.enum(BRAND_FONTS).optional().nullable(),
  isDefault: z.boolean().optional(),
});

const suggestSchema = z.object({ mode: z.literal("suggest") });

function toKitPayload(kit: {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  isDefault: boolean;
  workspaceId: string;
  updatedAt: Date;
}) {
  return {
    id: kit.id,
    name: kit.name,
    logoUrl: kit.logoUrl,
    primaryColor: kit.primaryColor,
    secondaryColor: kit.secondaryColor,
    accentColor: kit.accentColor,
    headingFont: kit.headingFont,
    bodyFont: kit.bodyFont,
    isDefault: kit.isDefault,
    workspaceId: kit.workspaceId,
    updatedAt: kit.updatedAt.toISOString(),
  };
}

/** The kit order used everywhere a deck resolves its brand. */
const KIT_ORDER = [{ isDefault: "desc" }, { createdAt: "asc" }] as const;

export const GET = withErrorHandling<[Request]>(async () => {
  const user = await requireUser();

  const kits = await prisma.brandKit.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [...KIT_ORDER],
  });

  return NextResponse.json({
    kits: kits.map(toKitPayload),
    activeKitId: kits.find((kit) => kit.isDefault)?.id ?? null,
  });
});

/** Validate the logo server-side before a single byte is sent to storage. */
async function handleLogoUpload(
  request: Request,
  user: { id: string; workspaceId: string },
) {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    throw new HttpError(400, "Choose a logo image to upload.");
  }

  if (file.size > MAX_LOGO_BYTES) {
    throw new HttpError(400, "Logo must be smaller than 2 MB.");
  }

  if (
    !(LOGO_CONTENT_TYPES as readonly string[]).includes(file.type)
  ) {
    throw new HttpError(400, "Logo must be a PNG, JPEG, WebP or SVG file.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // ImageKit re-encodes; the cap is enforced here so an oversized original
  // never reaches the provider.
  if (buffer.byteLength > MAX_LOGO_BYTES) {
    throw new HttpError(400, "Logo must be smaller than 2 MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);
  const logoUrl = await uploadSlideImage(buffer, `brand-logo-${safeName || "logo.png"}`);

  trackUsage({
    type: "STORAGE",
    userId: user.id,
    workspaceId: user.workspaceId,
    bytes: buffer.byteLength,
    meta: { operation: "brand_logo_upload" },
  });

  return NextResponse.json({ logoUrl });
}

export const POST = withErrorHandling<[Request]>(async (request) => {
  const user = await requireUser();

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return handleLogoUpload(request, user);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }

  const suggest = suggestSchema.safeParse(body);

  if (suggest.success) {
    // Grounded on the founder's own most recent deck, so the palette reflects
    // what the company actually does. No deck simply means no material.
    const deck = await prisma.deck.findFirst({
      where: { userId: user.id, workspaceId: user.workspaceId },
      orderBy: { updatedAt: "desc" },
      include: { slides: { orderBy: { order: "asc" } } },
    });

    const suggestion = await suggestBrandKit({
      context: deck ? toDeckContext(deck) : null,
      startupName: deck?.startupName ?? null,
    });

    trackUsage({
      type: "AI_GENERATION",
      userId: user.id,
      workspaceId: user.workspaceId,
      deckId: deck?.id ?? null,
      meta: { operation: "brand_kit_suggestion" },
    });

    return NextResponse.json({ suggestion });
  }

  const created = createSchema.safeParse(body);

  if (!created.success) {
    throw new HttpError(
      400,
      created.error.issues[0]?.message ?? "Invalid brand kit",
    );
  }

  const data = created.data;

  // A new default kit demotes the previous one, so "which kit is active"
  // always has exactly one answer.
  if (data.isDefault) {
    await prisma.brandKit.updateMany({
      where: { workspaceId: user.workspaceId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const kit = await prisma.brandKit.create({
    data: {
      name: data.name,
      logoUrl: data.logoUrl || null,
      primaryColor: data.primaryColor || null,
      secondaryColor: data.secondaryColor || null,
      accentColor: data.accentColor || null,
      headingFont: data.headingFont || null,
      bodyFont: data.bodyFont || null,
      isDefault: data.isDefault ?? false,
      // Forced, never client-supplied.
      userId: user.id,
      workspaceId: user.workspaceId,
    },
  });

  return NextResponse.json({ kit: toKitPayload(kit) }, { status: 201 });
});
