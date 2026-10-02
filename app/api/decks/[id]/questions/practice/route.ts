import { NextResponse } from "next/server";
import { z } from "zod";

import { trackUsage } from "@/lib/analytics/usage";
import { HttpError, requireDeckRecord, requireUser, withErrorHandling } from "@/lib/api/guards";
import { prisma } from "@/lib/db";

/**
 * Practice session control.
 *
 *   POST /api/decks/[id]/questions/practice
 *     { questionId?: string }
 *
 * Starts a session or advances one. With no `questionId` the service picks the
 * question the founder has practised least — the unpractised ones first, then the
 * ones whose last attempt is oldest, then simply the oldest. That ordering is what
 * makes "Next Question" feel like a session rather than a random walk.
 *
 * Session state is deliberately not stored: a practice session is a sequence of
 * requests from the practice surface, and a stale row would only ever mislead the
 * founder about where they got to.
 */

export const runtime = "nodejs";

type PracticeParams = { params: Promise<{ id: string }> };

const sessionSchema = z.object({
  questionId: z.string().min(1).optional(),
});

type QuestionRow = {
  id: string;
  question: string;
  category: string;
  rationale: string | null;
  slideRef: string | null;
  difficulty: number;
  saved: boolean;
  createdAt: Date;
};

function toQuestionResponse(row: QuestionRow) {
  return {
    id: row.id,
    question: row.question,
    category: row.category,
    rationale: row.rationale,
    slideRef: row.slideRef,
    difficulty: row.difficulty,
    saved: row.saved,
    createdAt: row.createdAt.toISOString(),
  };
}

export const POST = withErrorHandling<[Request, PracticeParams]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    const deck = await requireDeckRecord(id, user.id);

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = sessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "That session request was not understood.");
    }

    const { questionId } = parsed.data;

    if (questionId) {
      const requested = await prisma.investorQuestion.findFirst({
        where: { id: questionId, deckId: deck.id },
      });

      if (!requested) {
        throw new HttpError(404, "Question not found.");
      }

      return NextResponse.json({ question: toQuestionResponse(requested) });
    }

    const [questions, lastAttempts] = await Promise.all([
      prisma.investorQuestion.findMany({
        where: { deckId: deck.id },
        orderBy: [{ createdAt: "asc" }],
      }),
      prisma.questionAttempt.findMany({
        where: { deckId: deck.id },
        orderBy: { createdAt: "desc" },
        select: { questionId: true, createdAt: true },
      }),
    ]);

    if (questions.length === 0) {
      throw new HttpError(
        400,
        "There are no investor questions for this deck yet. Generate them from the practice page first.",
      );
    }

    const mostRecent = new Map<string, number>();
    for (const attempt of lastAttempts) {
      if (!mostRecent.has(attempt.questionId)) {
        mostRecent.set(attempt.questionId, attempt.createdAt.getTime());
      }
    }

    const next = [...questions].sort((a, b) => {
      const aSeen = mostRecent.get(a.id);
      const bSeen = mostRecent.get(b.id);
      // Unpractised questions sort ahead of practised ones.
      if ((aSeen === undefined) !== (bSeen === undefined)) {
        return aSeen === undefined ? -1 : 1;
      }
      return (aSeen ?? 0) - (bSeen ?? 0);
    })[0];

    trackUsage({
      type: "QA_SESSION",
      userId: user.id,
      workspaceId: user.workspaceId,
      deckId: deck.id,
      meta: { operation: "practice_session_start" },
    });

    return NextResponse.json({ question: toQuestionResponse(next) });
  },
);
