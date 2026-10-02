import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { diffSnapshots, parseSnapshot } from "@/lib/versions/snapshot";

type Ctx = { params: Promise<{ id: string }> };

const compareSchema = z.object({
  before: z.number().int().positive(),
  after: z.number().int().positive(),
});

/**
 * Compare two versions of a deck.
 *
 * Returns the structured diff produced by `diffSnapshots` — added/removed/
 * changed slides, per-field text changes, deck-level meta changes — plus the
 * human-readable summaries and timestamps of both versions so the UI can
 * label the comparison without a second round-trip.
 */
export const POST = withErrorHandling<[Request, Ctx]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    const deck = await prisma.deck.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
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

    const parsed = compareSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid request",
      );
    }

    const [before, after] = await prisma.deckVersion.findMany({
      where: {
        deckId: id,
        number: { in: [parsed.data.before, parsed.data.after] },
      },
    });

    if (!before || !after) {
      throw new HttpError(404, "One or both versions not found.");
    }

    const beforeSnapshot = parseSnapshot(before.snapshot);
    const afterSnapshot = parseSnapshot(after.snapshot);
    const diff = diffSnapshots(beforeSnapshot, afterSnapshot);

    return NextResponse.json({
      before: {
        number: before.number,
        summary: before.summary,
        createdAt: before.createdAt.toISOString(),
      },
      after: {
        number: after.number,
        summary: after.summary,
        createdAt: after.createdAt.toISOString(),
      },
      diff,
    });
  },
);