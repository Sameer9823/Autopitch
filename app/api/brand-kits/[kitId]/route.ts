import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";

/**
 * A single brand kit.
 *
 *   GET    → the kit
 *   PATCH  → update its fields
 *   DELETE → remove it
 *
 * Ownership is workspace-scoped and checked on every call: a kit id from a
 * different workspace resolves to the same 404 as one that does not exist, so
 * kit ids are never probeable across workspaces.
 *
 * Deleting a kit cannot break a deck. Decks do not hold a foreign key to a kit
 * — they resolve the workspace's active kit at render time and fall back to
 * `DEFAULT_SLIDE_THEME` when there is none — so a removed kit simply stops
 * being applied. The editor, presentation mode, the public share viewer and
 * both exporters all go through `resolveSlideTheme`, which is what makes that
 * fallback true everywhere at once.
 */

type Ctx = { params: Promise<{ kitId: string }> };

const HEX = /^#[0-9a-fA-F]{6}$/;

const BRAND_FONTS = [
  "Inter",
  "Geist",
  "IBM Plex Sans",
  "Manrope",
  "Sora",
] as const;

/** A colour field may be set, or explicitly cleared back to the product default. */
const colorField = z
  .union([
    z.string().trim().regex(HEX, "Use a 6-digit hex colour, for example #1c1917."),
    z.literal(""),
  ])
  .nullable()
  .optional();

const patchSchema = z.object({
  name: z.string().trim().min(1, "Give the kit a name.").max(80).optional(),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || /^https?:\/\//i.test(value), {
      message: "Logo must be an uploaded image.",
    })
    .nullable()
    .optional(),
  primaryColor: colorField,
  secondaryColor: colorField,
  accentColor: colorField,
  headingFont: z.union([z.enum(BRAND_FONTS), z.literal("")]).nullable().optional(),
  bodyFont: z.union([z.enum(BRAND_FONTS), z.literal("")]).nullable().optional(),
  /**
   * Switching the active kit is a move, not an edit: only one kit can be the
   * default for a workspace, so promoting one demotes whichever held it. Kept
   * here rather than only on create, because otherwise a workspace that already
   * has a default could never change its mind.
   */
  isDefault: z.boolean().optional(),
});

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

async function requireKit(kitId: string, workspaceId: string) {
  const kit = await prisma.brandKit.findFirst({
    where: { id: kitId, workspaceId },
  });

  if (!kit) {
    throw new HttpError(404, "Brand kit not found.");
  }

  return kit;
}

export const GET = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { kitId } = await params;

    const kit = await requireKit(kitId, user.workspaceId);

    return NextResponse.json({ kit: toKitPayload(kit) });
  },
);

export const PATCH = withErrorHandling<[Request, Ctx]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { kitId } = await params;

    await requireKit(kitId, user.workspaceId);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid brand kit",
      );
    }

    // Authorization only: the loaded row is not read again below, the update is
    // keyed by the id that was just proven to be in this workspace.
    await requireKit(kitId, user.workspaceId);

    // Empty strings and explicit nulls both mean "fall back to the product
    // default", which is how Reset is expressed through the same endpoint.
    const data = parsed.data;
    const clear = (value: string | null | undefined) =>
      value === undefined ? undefined : value === "" ? null : value;

    if (data.isDefault === true) {
      await prisma.brandKit.updateMany({
        where: { workspaceId: user.workspaceId, isDefault: true, id: { not: kitId } },
        data: { isDefault: false },
      });
    }

    const kit = await prisma.brandKit.update({
      where: { id: kitId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: clear(data.logoUrl) } : {}),
        ...(data.primaryColor !== undefined
          ? { primaryColor: clear(data.primaryColor) }
          : {}),
        ...(data.secondaryColor !== undefined
          ? { secondaryColor: clear(data.secondaryColor) }
          : {}),
        ...(data.accentColor !== undefined
          ? { accentColor: clear(data.accentColor) }
          : {}),
        ...(data.headingFont !== undefined
          ? { headingFont: clear(data.headingFont) }
          : {}),
        ...(data.bodyFont !== undefined
          ? { bodyFont: clear(data.bodyFont) }
          : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
      },
    });

    return NextResponse.json({ kit: toKitPayload(kit) });
  },
);

export const DELETE = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { kitId } = await params;

    await requireKit(kitId, user.workspaceId);
    await prisma.brandKit.delete({ where: { id: kitId } });

    // Decks that were rendering with this kit fall back to the product theme on
    // their next render, which is a valid state rather than a broken one.
    return NextResponse.json({ status: "ok" as const });
  },
);
