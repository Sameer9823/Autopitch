import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { applySnapshot, parseSnapshot } from "@/lib/versions/snapshot";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

/**
 * Get one version's full snapshot (read-only).
 */
export const GET = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id, versionId } = await params;

    const version = await prisma.deckVersion.findFirst({
      where: { id: versionId, deckId: id, deck: { userId: user.id } },
    });
    if (!version) {
      throw new HttpError(404, "Version not found.");
    }

    return NextResponse.json({
      id: version.id,
      number: version.number,
      summary: version.summary,
      isRestoredFrom: version.isRestoredFrom,
      createdAt: version.createdAt.toISOString(),
      snapshot: version.snapshot,
    });
  },
);

/**
 * Restore a version.
 *
 * Restoring does NOT rewrite history. It applies the snapshot to the live deck
 * AND appends a NEW version whose `isRestoredFrom` points at the version that
 * was restored. All prior versions remain intact, so the full timeline is
 * always preserved.
 */
export const POST = withErrorHandling<[Request, Ctx]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id, versionId } = await params;

    const deck = await prisma.deck.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!deck) {
      throw new HttpError(404, "Deck not found.");
    }

    const version = await prisma.deckVersion.findFirst({
      where: { id: versionId, deckId: id },
    });
    if (!version) {
      throw new HttpError(404, "Version not found.");
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // Restore with no body is fine.
    }

    const restoreSchema = z
      .object({
        summary: z.string().trim().max(400).optional(),
      })
      .default({});

    const parsed = restoreSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid request",
      );
    }

    const snapshot = parseSnapshot(version.snapshot);

    // 1. Apply the snapshot to the live deck.
    await applySnapshot(deck.id, snapshot);

    // 2. Load the freshly-applied deck so the new version's snapshot matches
    //    exactly what is now live (including any cascade side effects).
    const live = await prisma.deck.findFirst({
      where: { id: deck.id, userId: user.id },
      include: { slides: { orderBy: { order: "asc" } } },
    });
    if (!live) {
      throw new HttpError(500, "Deck disappeared during restore.");
    }

    const { createVersion } = await import("@/lib/versions/snapshot");
    const newVersion = await createVersion({
      deckId: deck.id,
      deck: live,
      summary:
        parsed.data.summary ||
        `Restored from version ${version.number}`,
      createdById: user.id,
      isRestoredFrom: version.number,
    });

    return NextResponse.json({
      id: newVersion.id,
      number: newVersion.number,
      restoredFrom: version.number,
      summary: newVersion.summary,
    });
  },
);