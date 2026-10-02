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
 * A single fundraising kit asset belonging to one deck.
 *
 *   GET    → the asset
 *   PATCH  → { title?, content } → save a founder edit
 *   DELETE → remove the asset
 *   POST   → regenerate it from the deck
 *
 * Every handler re-authorizes the deck AND re-scopes the asset to that deck
 * id, so an asset id from a different deck, or from a different workspace,
 * resolves to the same 404 as one that does not exist. The asset id in the URL
 * is never trusted on its own.
 *
 * Regeneration reads the deck, never the previous document, as its source of
 * truth — so a stale claim that was pasted in by hand cannot be preserved by
 * asking for a second draft.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; assetId: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(1, "Give the document a title.").max(160).optional(),
  content: z
    .string()
    .trim()
    .min(1, "A document cannot be empty.")
    .max(20000, "That document is too long to save.")
    .optional(),
});

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

/** Load the asset only if it truly belongs to the authorized deck. */
async function requireAsset(deckId: string, assetId: string, workspaceId: string) {
  const asset = await prisma.fundraisingAsset.findFirst({
    where: { id: assetId, deckId, workspaceId },
  });

  if (!asset) {
    throw new HttpError(404, "Asset not found.");
  }

  return asset;
}

export const GET = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id, assetId } = await params;

    await requireDeck(id, user.id);
    const asset = await requireAsset(id, assetId, user.workspaceId);

    return NextResponse.json({ asset: toAssetPayload(asset) });
  },
);

export const PATCH = withErrorHandling<[Request, Ctx]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id, assetId } = await params;

    await requireDeck(id, user.id);
    await requireAsset(id, assetId, user.workspaceId);

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
        parsed.error.issues[0]?.message ?? "Invalid document",
      );
    }

    if (!parsed.data.title && parsed.data.content === undefined) {
      throw new HttpError(400, "Nothing to save.");
    }

    const asset = await prisma.fundraisingAsset.update({
      where: { id: assetId },
      data: {
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
        ...(parsed.data.content !== undefined
          ? { content: parsed.data.content }
          : {}),
      },
    });

    return NextResponse.json({ asset: toAssetPayload(asset) });
  },
);

export const DELETE = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id, assetId } = await params;

    await requireDeck(id, user.id);
    await requireAsset(id, assetId, user.workspaceId);

    await prisma.fundraisingAsset.delete({ where: { id: assetId } });

    return NextResponse.json({ status: "ok" as const });
  },
);

/** Regenerate one asset from the deck it was built from. */
export const POST = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id, assetId } = await params;

    const deck = await requireDeck(id, user.id);
    const asset = await requireAsset(id, assetId, user.workspaceId);

    const type = AssetTypeSchema.catch("EXECUTIVE_SUMMARY").parse(asset.type);

    const generated = await generateFundraisingAssetFromDeck({
      type,
      context: toDeckContext(deck),
    });

    const updated = await prisma.fundraisingAsset.update({
      where: { id: asset.id },
      data: {
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
      meta: { operation: "fundraising_asset_regenerate", asset_type: type },
    });

    return NextResponse.json({
      asset: toAssetPayload(updated),
      gaps: generated.gaps,
    });
  },
);
