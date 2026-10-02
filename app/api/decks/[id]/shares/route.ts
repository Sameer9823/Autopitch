import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { generateShareToken } from "@/lib/share/token";
import { trackUsage } from "@/lib/analytics/usage";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  permission: z.enum(["VIEW", "VIEW_DOWNLOAD"]).default("VIEW"),
  expiresAt: z.string().datetime().optional().nullable(),
});

/**
 * Create a share link for a deck.
 *
 * The token is generated server-side (never client-supplied) and stored
 * verbatim. Revocation is a soft `revokedAt` — history is preserved.
 */
export const POST = withErrorHandling<[Request, Ctx]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    // Ownership: 404 (not 403) so we never confirm another user's deck id.
    const deck = await prisma.deck.findFirst({
      where: { id, userId: user.id },
      select: { id: true, title: true },
    });
    if (!deck) {
      throw new HttpError(404, "Deck not found.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid request",
      );
    }

    let expiresAt: Date | null = null;
    if (parsed.data.expiresAt) {
      const date = new Date(parsed.data.expiresAt);
      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        throw new HttpError(400, "Expiry must be a future date.");
      }
      expiresAt = date;
    }

    const token = generateShareToken();
    const share = await prisma.deckShare.create({
      data: {
        deckId: deck.id,
        token,
        permission: parsed.data.permission,
        expiresAt,
      },
    });

    trackUsage({
      type: "SHARE_VIEW",
      userId: user.id,
      deckId: deck.id,
      meta: { action: "create", permission: parsed.data.permission },
    });

    return NextResponse.json(
      {
        id: share.id,
        token: share.token,
        permission: share.permission,
        expiresAt: share.expiresAt?.toISOString() ?? null,
        revokedAt: null,
        viewCount: share.viewCount,
        createdAt: share.createdAt.toISOString(),
      },
      { status: 201 },
    );
  },
);

/**
 * List share links for a deck.
 */
export const GET = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    const deck = await prisma.deck.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!deck) {
      throw new HttpError(404, "Deck not found.");
    }

    const shares = await prisma.deckShare.findMany({
      where: { deckId: deck.id },
      include: {
        _count: { select: { views: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      shares.map((share) => ({
        id: share.id,
        token: share.token,
        permission: share.permission,
        expiresAt: share.expiresAt?.toISOString() ?? null,
        revokedAt: share.revokedAt?.toISOString() ?? null,
        viewCount: share.viewCount,
        totalViews: share._count.views,
        createdAt: share.createdAt.toISOString(),
      })),
    );
  },
);