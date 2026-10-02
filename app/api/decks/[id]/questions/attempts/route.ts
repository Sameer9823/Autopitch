import { NextResponse } from "next/server";
import { z } from "zod";

import { trackUsage } from "@/lib/analytics/usage";
import { HttpError, requireDeck, requireDeckRecord, requireUser, withErrorHandling } from "@/lib/api/guards";
import { AiServiceError } from "@/lib/ai/agent";
import { toDeckContext } from "@/lib/ai/deck-context";
import { evaluatePracticeAnswer, parseStoredEvaluation } from "@/lib/ai/answer-evaluation";
import { prisma } from "@/lib/db";
import { EVALUATION_DIMENSIONS } from "@/lib/schemas/investor-questions";

/**
 * Practice attempts — the history and the write path.
 *
 *   GET  — the deck's attempt history, newest first, with the evaluation re-read
 *          through `AnswerEvaluationSchema` so the client never renders an
 *          untrusted JSON column.
 *   POST — { questionId, answer }: evaluate one spoken answer and persist it.
 *
 * The dimension scores are written both as columns (so the deck can be aggregated
 * without parsing JSON) and inside the payload (so the full feedback survives).
 * Every write is scoped to the authenticated user's deck.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

type AttemptsParams = { params: Promise<{ id: string }> };

const HISTORY_LIMIT = 100;
const MIN_ANSWER_LENGTH = 20;

const submitSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().trim().min(MIN_ANSWER_LENGTH, "Give the evaluator something to read."),
});

type AttemptRow = {
  id: string;
  questionId: string;
  answer: string;
  clarity: number | null;
  specificity: number | null;
  evidence: number | null;
  relevance: number | null;
  conciseness: number | null;
  overallScore: number | null;
  payload: unknown;
  createdAt: Date;
  question: {
    question: string;
    category: string;
    rationale: string | null;
    slideRef: string | null;
    difficulty: number;
  };
};

function toAttemptResponse(row: AttemptRow) {
  return {
    id: row.id,
    questionId: row.questionId,
    answer: row.answer,
    clarity: row.clarity,
    specificity: row.specificity,
    evidence: row.evidence,
    relevance: row.relevance,
    conciseness: row.conciseness,
    overallScore: row.overallScore,
    createdAt: row.createdAt.toISOString(),
    question: row.question,
    evaluation: parseStoredEvaluation(row.payload),
  };
}

export const GET = withErrorHandling<[Request, AttemptsParams]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    const deck = await requireDeckRecord(id, user.id);

    const attempts = await prisma.questionAttempt.findMany({
      where: { deckId: deck.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      include: {
        question: {
          select: {
            question: true,
            category: true,
            rationale: true,
            slideRef: true,
            difficulty: true,
          },
        },
      },
    });

    return NextResponse.json({
      attempts: attempts.map(toAttemptResponse),
    });
  },
);

export const POST = withErrorHandling<[Request, AttemptsParams]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    const deck = await requireDeck(id, user.id);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Write a fuller answer before submitting.",
      );
    }

    const { questionId, answer } = parsed.data;

    const question = await prisma.investorQuestion.findFirst({
      where: { id: questionId, deckId: deck.id },
      select: {
        id: true,
        question: true,
        category: true,
        rationale: true,
        slideRef: true,
      },
    });

    if (!question) {
      throw new HttpError(404, "Question not found.");
    }

    let evaluation;
    try {
      evaluation = await evaluatePracticeAnswer({
        context: toDeckContext(deck),
        question: question.question,
        rationale: question.rationale,
        slideRef: question.slideRef,
        answer,
      });
    } catch (error) {
      throw new HttpError(
        502,
        error instanceof AiServiceError
          ? error.message
          : "We could not evaluate that answer. Please try again.",
        "evaluation_failed",
      );
    }

    const dimensions = new Map(
      evaluation.dimensionScores.map((entry) => [entry.dimension, entry.score]),
    );

    const attempt = await prisma.questionAttempt.create({
      data: {
        deckId: deck.id,
        questionId: question.id,
        answer,
        clarity: dimensions.get("clarity") ?? null,
        specificity: dimensions.get("specificity") ?? null,
        evidence: dimensions.get("evidence") ?? null,
        relevance: dimensions.get("relevance") ?? null,
        conciseness: dimensions.get("conciseness") ?? null,
        overallScore: evaluation.overallScore,
        payload: evaluation as object,
      },
      include: {
        question: {
          select: {
            question: true,
            category: true,
            rationale: true,
            slideRef: true,
            difficulty: true,
          },
        },
      },
    });

    trackUsage({
      type: "AI_GENERATION",
      userId: user.id,
      workspaceId: user.workspaceId,
      deckId: deck.id,
      meta: {
        operation: "answer_evaluation",
        category: question.category,
        dimensions: EVALUATION_DIMENSIONS.length,
      },
    });

    return NextResponse.json({ attempt: toAttemptResponse(attempt) }, { status: 201 });
  },
);
