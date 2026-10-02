import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireDeck,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { trackUsage } from "@/lib/analytics/usage";
import { toDeckContext } from "@/lib/ai/deck-context";
import {
  ASSET_TYPE_LABELS,
  generateFundraisingAssetFromDeck,
} from "@/lib/ai/fundraising-assets";
import { prisma } from "@/lib/db";
import { AssetTypeSchema } from "@/lib/schemas/content";

/**
 * Fundraising kit assets for one deck.
 *
 *   GET  → every asset generated from this deck
 *   POST → { type } → generate (or regenerate) that one asset from the deck
 *
 * The deck is loaded through `requireDeck(id, user.id)` before anything is read
 * or written, and the asset is always re-scoped to that deck id on the way in
 * and out — an asset id belonging to another deck is not reachable from here.
 *
 * Generation is deliberately one type per request. The generator UI runs its
 * own per-asset progress, error and Retry off the back of this, which is only
 * possible if a single failure does not take the other five down with it.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const generateSchema = z.object({
  type: AssetTypeSchema,
});

/** The asset shape the client receives. Never a raw Prisma row. */
function toAssetPayload(asset: {
  id: string;
  deckId: string | null;
  workspaceId: string;
  type: string;
  title: string;
  content: string;
  hasGaps: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: asset.id,
    deckId: asset.deckId,
    workspaceId: asset.workspaceId,
    type: asset.type,
    typeLabel: ASSET_TYPE_LABELS[asset.type as keyof typeof ASSET_TYPE_LABELS] ?? asset.type,
    title: asset.title,
    content: asset.content,
    hasGaps: asset.hasGaps,
    source: asset.deckId ? ("deck" as const) : ("workspace" as const),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export const GET = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    await requireDeck(id, user.id);

    const assets = await prisma.fundraisingAsset.findMany({
      where: { deckId: id, workspaceId: user.workspaceId },
      orderBy: { type: "asc" },
    });

    return NextResponse.json({
      assets: assets.map(toAssetPayload),
    });
  },
);

export const POST = withErrorHandling<[Request, Ctx]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    const deck = await requireDeck(id, user.id);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = generateSchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpError(400, "Choose a valid asset type.");
    }

    const { type } = parsed.data;

    // Every fact in the asset comes from the deck the caller just proved they
    // own. The founder is never asked to re-enter any of it.
    const generated = await generateFundraisingAssetFromDeck({
      type,
      context: toDeckContext(deck),
    });

    // One asset per type per deck: regenerating replaces the document in place
    // rather than filling the library with near-duplicates.
    const existing = await prisma.fundraisingAsset.findFirst({
      where: { deckId: id, type },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    const asset = existing
      ? await prisma.fundraisingAsset.update({
          where: { id: existing.id },
          data: {
            title: generated.title,
            content: generated.content,
            hasGaps: generated.hasGaps,
          },
        })
      : await prisma.fundraisingAsset.create({
          data: {
            deckId: id,
            workspaceId: user.workspaceId,
            type,
            title: generated.title,
            content: generated.content,
            hasGaps: generated.hasGaps,
          },
        });

    trackUsage({
      type: "AI_GENERATION",
      userId: user.id,
      workspaceId: user.workspaceId,
      deckId: id,
      meta: { operation: "fundraising_asset", asset_type: type },
    });

    return NextResponse.json(
      { asset: toAssetPayload(asset), gaps: generated.gaps },
      { status: existing ? 200 : 201 },
    );
  },
);
