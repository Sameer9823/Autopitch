import { NextResponse } from "next/server";
import { z } from "zod";

import { HttpError, requireDeckRecord, requireUser, withErrorHandling } from "@/lib/api/guards";
import { prisma } from "@/lib/db";

/**
 * A single investor question.
 *
 *   PATCH /api/decks/[id]/questions/[questionId]  { saved: boolean }
 *
 * Today the only thing a founder decides about a question is whether to keep it
 * on their list. The write is scoped to the deck AND the authenticated user, so a
 * question id from another founder's deck resolves to the same 404 as one that
 * does not exist.
 */

export const runtime = "nodejs";

type QuestionParams = { params: Promise<{ id: string; questionId: string }> };

const updateSchema = z.object({
  saved: z.boolean(),
});

export const PATCH = withErrorHandling<[Request, QuestionParams]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id, questionId } = await params;
    const deck = await requireDeckRecord(id, user.id);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Send { saved: true } or { saved: false }.");
    }

    const updated = await prisma.investorQuestion.updateMany({
      where: { id: questionId, deckId: deck.id },
      data: { saved: parsed.data.saved },
    });

    if (updated.count === 0) {
      throw new HttpError(404, "Question not found.");
    }

    const question = await prisma.investorQuestion.findUnique({
      where: { id: questionId },
    });

    return NextResponse.json({
      question: question
        ? {
            id: question.id,
            question: question.question,
            category: question.category,
            rationale: question.rationale,
            slideRef: question.slideRef,
            difficulty: question.difficulty,
            saved: question.saved,
            createdAt: question.createdAt.toISOString(),
          }
        : null,
    });
  },
);
