import { NextResponse } from "next/server";

import { trackUsage } from "@/lib/analytics/usage";
import {
  HttpError,
  requireDeck,
  requireDeckRecord,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { AiServiceError } from "@/lib/ai/agent";
import { toDeckContext } from "@/lib/ai/deck-context";
import { parseStoredReview, runPitchReview } from "@/lib/ai/investor-review";
import { prisma } from "@/lib/db";

/**
 * Investor review — collection endpoint.
 *
 *   GET  — the deck's latest review plus a short history of earlier runs
 *   POST — run a new review over the COMPLETE deck
 *
 * Ownership is re-checked on every call with `requireDeck` / `requireDeckRecord`,
 * so a deck id belonging to another founder resolves to the same 404 as one that
 * does not exist. The API never confirms that a deck id exists.
 *
 * POST moves one `PitchReview` row through PENDING → RUNNING → COMPLETE | FAILED,
 * so a run that dies halfway still leaves a row the founder can see the outcome
 * of, rather than vanishing.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

type ReviewParams = { params: Promise<{ id: string }> };

/** How many earlier runs the history strip offers. */
const HISTORY_LIMIT = 20;

type ReviewRow = {
  id: string;
  status: string;
  overallScore: number | null;
  payload: unknown;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The wire shape of a review. `review` is null unless the stored payload actually
 * validates against the schema — the client renders an empty state rather than
 * trusting an untyped JSON column.
 */
function toReviewResponse(row: ReviewRow | null) {
  if (!row) return null;

  const payload = parseStoredReview(row.payload);

  return {
    id: row.id,
    status: row.status,
    overallScore: row.overallScore,
    createdAt: row.createdAt.toISOString(),
    errorMessage: row.errorMessage,
    payload,
  };
}

export const GET = withErrorHandling<[Request, ReviewParams]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    const deck = await requireDeckRecord(id, user.id);

    const [latest, history] = await Promise.all([
      prisma.pitchReview.findFirst({
        where: { deckId: deck.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.pitchReview.findMany({
        where: { deckId: deck.id },
        orderBy: { createdAt: "desc" },
        take: HISTORY_LIMIT,
        select: {
          id: true,
          status: true,
          overallScore: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      review: toReviewResponse(latest),
      history: history.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      })),
    });
  },
);

export const POST = withErrorHandling<[Request, ReviewParams]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    const deck = await requireDeck(id, user.id);

    if (deck.slides.length === 0) {
      throw new HttpError(
        400,
        "This deck has no slides yet. Build the deck first, then run the review.",
      );
    }

    const review = await prisma.pitchReview.create({
      data: { deckId: deck.id, status: "PENDING" },
      select: { id: true },
    });

    trackUsage({
      type: "AI_REVIEW",
      userId: user.id,
      workspaceId: user.workspaceId,
      deckId: deck.id,
      meta: { operation: "investor_review", slides: deck.slides.length },
    });

    try {
      await prisma.pitchReview.update({
        where: { id: review.id },
        data: { status: "RUNNING" },
      });

      const analysis = await runPitchReview({ context: toDeckContext(deck) });

      const completed = await prisma.pitchReview.update({
        where: { id: review.id },
        data: {
          status: "COMPLETE",
          overallScore: analysis.overallScore,
          payload: analysis as object,
          errorMessage: null,
        },
      });

      // The deck carries the score so the decks list and dashboard can show it
      // without loading a review payload.
      await prisma.deck.update({
        where: { id: deck.id },
        data: { pitchScore: analysis.overallScore },
      });

      return NextResponse.json({ review: toReviewResponse(completed) }, { status: 201 });
    } catch (error) {
      const message =
        error instanceof AiServiceError
          ? error.message
          : "We could not complete the investor review. Please try again.";

      await prisma.pitchReview
        .update({
          where: { id: review.id },
          data: { status: "FAILED", errorMessage: message },
        })
        .catch((writeError: unknown) => {
          console.error("[review] could not record failure", writeError);
        });

      // The provider message never reaches the client — only the safe sentence.
      throw new HttpError(502, message, "review_failed");
    }
  },
);
