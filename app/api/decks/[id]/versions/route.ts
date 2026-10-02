import { NextResponse } from "next/server";

import {
  HttpError,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * List versions for a deck, newest first.
 *
 * History is append-only: every entry is a snapshot taken at a point in time.
 * `isRestoredFrom` is set when the version was produced by restoring an older
 * version — restoring never rewrites history, it appends a new version.
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

    const versions = await prisma.deckVersion.findMany({
      where: { deckId: deck.id },
      orderBy: { number: "desc" },
      select: {
        id: true,
        number: true,
        summary: true,
        isRestoredFrom: true,
        createdAt: true,
        createdById: true,
      },
    });

    return NextResponse.json(
      versions.map((version) => ({
        id: version.id,
        number: version.number,
        summary: version.summary,
        isRestoredFrom: version.isRestoredFrom,
        createdAt: version.createdAt.toISOString(),
        createdById: version.createdById,
      })),
    );
  },
);