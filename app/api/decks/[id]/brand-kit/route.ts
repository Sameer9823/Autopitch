import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireDeck,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { resolveSlideTheme } from "@/lib/deck/theme";
import { prisma } from "@/lib/db";

/**
 * The brand a single deck renders with.
 *
 *   GET    → the kit this deck renders with, plus every kit it could use
 *   POST   → { kitId } → make that kit this deck's brand
 *   DELETE → drop the deck's brand and render with the product theme
 *
 * `Deck` has no `brandKitId` column, so a deck's brand is expressed the way
 * the rest of the product already reads it: the workspace's default kit, in the
 * exact order `lib/deck/to-render-model.ts` and the editor page resolve it
 * (`isDefault` first, then oldest). Applying a kit therefore sets it as the
 * workspace default, and the editor, presentation mode, the public share viewer
 * and both exporters all pick it up through `resolveSlideTheme` without any of
 * them needing to change. A `Deck.brandKitId` column would be the cleaner model
 * — recorded as a schema follow-up.
 *
 * Every write is workspace-scoped: a kit from another workspace is a 404, not a
 * 403, so kit ids are never probeable across tenants.
 */

type Ctx = { params: Promise<{ id: string }> };

const applySchema = z.object({
  kitId: z.string().trim().min(1, "Choose a brand kit."),
});

/** The same resolution order the renderer uses, kept in one place. */
const KIT_ORDER = [{ isDefault: "desc" }, { createdAt: "asc" }] as const;

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
  };
}

export const GET = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    await requireDeck(id, user.id);

    const kits = await prisma.brandKit.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [...KIT_ORDER],
    });

    const active = kits[0] ?? null;

    return NextResponse.json({
      kit: active ? toKitPayload(active) : null,
      kits: kits.map(toKitPayload),
      // Exactly what the slide canvas would paint right now, so the preview
      // and the deck can never disagree.
      theme: resolveSlideTheme(active),
    });
  },
);

/** Apply a workspace kit to this deck. */
export const POST = withErrorHandling<[Request, Ctx]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    await requireDeck(id, user.id);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = applySchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpError(400, "Choose a brand kit.");
    }

    const kit = await prisma.brandKit.findFirst({
      where: { id: parsed.data.kitId, workspaceId: user.workspaceId },
      select: { id: true, name: true },
    });

    if (!kit) {
      throw new HttpError(404, "Brand kit not found.");
    }

    // Exactly one default at a time, so "what brand does this deck render
    // with" always resolves to a single kit.
    await prisma.$transaction([
      prisma.brandKit.updateMany({
        where: { workspaceId: user.workspaceId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.brandKit.update({
        where: { id: kit.id },
        data: { isDefault: true },
      }),
    ]);

    return NextResponse.json({ status: "ok" as const, kitId: kit.id });
  },
);

/** Drop the brand: the deck falls back to the product slide theme. */
export const DELETE = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    await requireDeck(id, user.id);

    await prisma.brandKit.updateMany({
      where: { workspaceId: user.workspaceId, isDefault: true },
      data: { isDefault: false },
    });

    return NextResponse.json({ status: "ok" as const });
  },
);
