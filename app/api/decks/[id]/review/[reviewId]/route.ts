import { NextResponse } from "next/server";

import { HttpError, requireDeckRecord, requireUser, withErrorHandling } from "@/lib/api/guards";
import { parseStoredReview } from "@/lib/ai/investor-review";
import { prisma } from "@/lib/db";

/**
 * A single investor review.
 *
 *   GET /api/decks/[id]/review/[reviewId]
 *
 * Used to re-open an earlier run from the history strip. The review is looked up
 * scoped to BOTH the deck id and the requesting user, so a review id belonging to
 * someone else resolves to the same 404 as one that never existed — the response
 * never confirms that either does.
 *
 * The stored payload is re-validated against `PitchReviewSchema` before it leaves
 * the server; an unparseable payload comes back as `payload: null` with the run's
 * real status, which the UI renders as an unreadable result rather than a crash.
 */

export const runtime = "nodejs";

type ReviewParams = { params: Promise<{ id: string; reviewId: string }> };

export const GET = withErrorHandling<[Request, ReviewParams]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id, reviewId } = await params;
    const deck = await requireDeckRecord(id, user.id);

    const review = await prisma.pitchReview.findFirst({
      where: { id: reviewId, deckId: deck.id },
    });

    if (!review) {
      throw new HttpError(404, "Review not found.");
    }

    const payload = parseStoredReview(review.payload);

    return NextResponse.json({
      review: {
        id: review.id,
        status: review.status,
        overallScore: review.overallScore,
        createdAt: review.createdAt.toISOString(),
        errorMessage: review.errorMessage,
        payload,
      },
    });
  },
);
