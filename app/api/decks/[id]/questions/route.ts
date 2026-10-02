import { NextResponse } from "next/server";
import { z } from "zod";

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
import { generateInvestorQuestions } from "@/lib/ai/investor-questions";
import { prisma } from "@/lib/db";
import { QUESTION_CATEGORIES } from "@/lib/schemas/investor-questions";

/**
 * Investor questions — collection endpoint.
 *
 *   GET  — list the deck's questions, filterable by `category` and `saved`
 *   POST — generate more questions grounded in this deck
 *
 * "Generate More" is the same POST: the service is given every question the deck
 * already has and drops anything it produces twice, so the practice list grows
 * without the founder meeting the same probe three times.
 *
 * Every read and write is scoped through the authenticated user, so a deck id
 * belonging to another founder resolves to the same 404 as one that never
 * existed.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

type QuestionsParams = { params: Promise<{ id: string }> };

const generateSchema = z.object({
  /** How many new questions to ask for. Clamped by the AI service. */
  count: z.number().int().min(3).max(15).optional(),
});

const listQuerySchema = z.object({
  category: z.enum(QUESTION_CATEGORIES).optional(),
  saved: z.enum(["true", "false"]).optional(),
});

/** The wire shape of one question. */
function toQuestionResponse(row: {
  id: string;
  question: string;
  category: string;
  rationale: string | null;
  slideRef: string | null;
  difficulty: number;
  saved: boolean;
  createdAt: Date;
}) {
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

export const GET = withErrorHandling<[Request, QuestionsParams]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    const deck = await requireDeckRecord(id, user.id);

    const url = new URL(request.url);
    const query = listQuerySchema.safeParse({
      category: url.searchParams.get("category") ?? undefined,
      saved: url.searchParams.get("saved") ?? undefined,
    });

    if (!query.success) {
      throw new HttpError(400, "That filter is not one we recognise.");
    }

    const questions = await prisma.investorQuestion.findMany({
      where: {
        deckId: deck.id,
        category: query.data.category,
        saved: query.data.saved === undefined ? undefined : query.data.saved === "true",
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return NextResponse.json({
      questions: questions.map(toQuestionResponse),
    });
  },
);

export const POST = withErrorHandling<[Request, QuestionsParams]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    const deck = await requireDeck(id, user.id);

    if (deck.slides.length === 0) {
      throw new HttpError(
        400,
        "This deck has no slides yet. Build the deck first, then generate questions.",
      );
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // An empty body is a valid "generate the default number".
      body = {};
    }

    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Ask for between 3 and 15 questions at a time.");
    }

    const existing = await prisma.investorQuestion.findMany({
      where: { deckId: deck.id },
      orderBy: { createdAt: "desc" },
      select: { question: true },
    });

    let generated: Awaited<ReturnType<typeof generateInvestorQuestions>>;
    try {
      generated = await generateInvestorQuestions({
        context: toDeckContext(deck),
        count: parsed.data.count,
        exclude: existing.map((row) => row.question),
      });
    } catch (error) {
      // Only the AiServiceError's user-safe sentence survives — never the
      // provider message underneath it.
      throw new HttpError(
        502,
        error instanceof AiServiceError
          ? error.message
          : "We could not generate investor questions. Please try again.",
        "questions_failed",
      );
    }

    if (generated.length === 0) {
      throw new HttpError(
        400,
        "No new questions came back — the generator had already covered this deck. Try re-running the investor review first.",
      );
    }

    const created = await prisma.investorQuestion.createMany({
      data: generated.map((question) => ({
        deckId: deck.id,
        question: question.question,
        category: question.category,
        rationale: question.rationale,
        slideRef: question.slideRef,
        difficulty: question.difficulty,
      })),
    });

    trackUsage({
      type: "AI_GENERATION",
      userId: user.id,
      workspaceId: user.workspaceId,
      deckId: deck.id,
      quantity: created.count,
      meta: { operation: "investor_questions" },
    });

    const questions = await prisma.investorQuestion.findMany({
      where: { deckId: deck.id },
      orderBy: [{ createdAt: "desc" }],
    });

    return NextResponse.json(
      { questions: questions.map(toQuestionResponse), created: created.count },
      { status: 201 },
    );
  },
);
