import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string; shareId: string }> };

const updateSchema = z.object({
  permission: z.enum(["VIEW", "VIEW_DOWNLOAD"]).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  revoked: z.boolean().optional(),
});

/**
 * Update a share link: toggle permission, set/clear expiry, or revoke.
 * Revocation is a soft `revokedAt` — the link's analytics history is kept.
 */
export const PATCH = withErrorHandling<[Request, Ctx]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id, shareId } = await params;

    const share = await prisma.deckShare.findFirst({
      where: { id: shareId, deckId: id, deck: { userId: user.id } },
    });
    if (!share) {
      throw new HttpError(404, "Share link not found.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid request",
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.permission !== undefined) {
      data.permission = parsed.data.permission;
    }
    if (parsed.data.expiresAt !== undefined) {
      data.expiresAt = parsed.data.expiresAt
        ? new Date(parsed.data.expiresAt)
        : null;
    }
    if (parsed.data.revoked !== undefined) {
      data.revokedAt = parsed.data.revoked ? new Date() : null;
    }

    const updated = await prisma.deckShare.update({
      where: { id: shareId },
      data,
    });

    return NextResponse.json({
      id: updated.id,
      token: updated.token,
      permission: updated.permission,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      revokedAt: updated.revokedAt?.toISOString() ?? null,
      viewCount: updated.viewCount,
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

/**
 * Revoke a share link (alias for PATCH with revoked=true).
 * History is preserved; the token is never deleted.
 */
export const DELETE = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id, shareId } = await params;

    const share = await prisma.deckShare.findFirst({
      where: { id: shareId, deckId: id, deck: { userId: user.id } },
    });
    if (!share) {
      throw new HttpError(404, "Share link not found.");
    }

    if (share.revokedAt) {
      return NextResponse.json({ ok: true, alreadyRevoked: true });
    }

    await prisma.deckShare.update({
      where: { id: shareId },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  },
);