"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { HttpError, requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { generateShareToken } from "@/lib/share/token";
import { trackUsage } from "@/lib/analytics/usage";

export type ShareActionResult =
  | { status: "ok"; message?: string; share?: ShareView }
  | { status: "error"; message: string };

export type ShareView = {
  id: string;
  token: string;
  permission: "VIEW" | "VIEW_DOWNLOAD";
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
};

function fail(error: unknown): ShareActionResult {
  if (error instanceof HttpError) {
    return { status: "error", message: error.message };
  }
  console.error("[shares] unexpected error", error);
  return {
    status: "error",
    message: "Something went wrong. Please try again.",
  };
}

function serialize(share: {
  id: string;
  token: string;
  permission: "VIEW" | "VIEW_DOWNLOAD";
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  createdAt: Date;
}): ShareView {
  return {
    id: share.id,
    token: share.token,
    permission: share.permission,
    expiresAt: share.expiresAt?.toISOString() ?? null,
    revokedAt: share.revokedAt?.toISOString() ?? null,
    viewCount: share.viewCount,
    createdAt: share.createdAt.toISOString(),
  };
}

const createSchema = z.object({
  permission: z.enum(["VIEW", "VIEW_DOWNLOAD"]).default("VIEW"),
  expiresAt: z.string().datetime().optional().nullable(),
});

/**
 * Create a new share link for a deck.
 */
export async function createShareAction(
  deckId: string,
  input: { permission?: "VIEW" | "VIEW_DOWNLOAD"; expiresAt?: string | null },
): Promise<ShareActionResult> {
  try {
    const user = await requireUser();
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0].message };
    }

    const deck = await prisma.deck.findFirst({
      where: { id: deckId, userId: user.id },
      select: { id: true, title: true },
    });
    if (!deck) {
      throw new HttpError(404, "Deck not found.");
    }

    let expiresAt: Date | null = null;
    if (parsed.data.expiresAt) {
      const date = new Date(parsed.data.expiresAt);
      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        return {
          status: "error",
          message: "Expiry must be a future date.",
        };
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

    revalidatePath(`/decks/${deckId}/share`);
    return { status: "ok", share: serialize(share) };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Revoke (disable) a share link. The token is never deleted — its analytics
 * history is preserved, only future opens are blocked.
 */
export async function revokeShareAction(
  deckId: string,
  shareId: string,
): Promise<ShareActionResult> {
  try {
    const user = await requireUser();
    const share = await prisma.deckShare.findFirst({
      where: { id: shareId, deckId, deck: { userId: user.id } },
    });
    if (!share) {
      throw new HttpError(404, "Share link not found.");
    }

    if (share.revokedAt) {
      return { status: "ok", message: "Link already disabled." };
    }

    const updated = await prisma.deckShare.update({
      where: { id: shareId },
      data: { revokedAt: new Date() },
    });

    revalidatePath(`/decks/${deckId}/share`);
    return { status: "ok", share: serialize(updated) };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Re-enable a previously revoked share link.
 */
export async function enableShareAction(
  deckId: string,
  shareId: string,
): Promise<ShareActionResult> {
  try {
    const user = await requireUser();
    const share = await prisma.deckShare.findFirst({
      where: { id: shareId, deckId, deck: { userId: user.id } },
    });
    if (!share) {
      throw new HttpError(404, "Share link not found.");
    }

    const updated = await prisma.deckShare.update({
      where: { id: shareId },
      data: { revokedAt: null },
    });

    revalidatePath(`/decks/${deckId}/share`);
    return { status: "ok", share: serialize(updated) };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Change a share link's permission between VIEW and VIEW_DOWNLOAD.
 */
export async function updateSharePermissionAction(
  deckId: string,
  shareId: string,
  permission: "VIEW" | "VIEW_DOWNLOAD",
): Promise<ShareActionResult> {
  try {
    const user = await requireUser();
    const share = await prisma.deckShare.findFirst({
      where: { id: shareId, deckId, deck: { userId: user.id } },
    });
    if (!share) {
      throw new HttpError(404, "Share link not found.");
    }

    const updated = await prisma.deckShare.update({
      where: { id: shareId },
      data: { permission },
    });

    revalidatePath(`/decks/${deckId}/share`);
    return { status: "ok", share: serialize(updated) };
  } catch (error) {
    return fail(error);
  }
}