import { notFound } from "next/navigation";

import { HugeiconsIcon } from "@hugeicons/react";

import { PracticeHistory, type PracticeAttempt } from "@/components/practice/practice-history";
import { PracticeSession } from "@/components/practice/practice-session";
import {
  QUESTION_CATEGORY_LABELS,
  QuestionList,
  type PracticeQuestion,
} from "@/components/practice/question-list";
import { Alert02Icon, Chat01Icon, CheckIcon } from "@/components/icons";
import { requireDeckRecord, requireUser } from "@/lib/api/guards";
import { parseStoredEvaluation } from "@/lib/ai/answer-evaluation";
import { prisma } from "@/lib/db";

/**
 * Q&A Practice.
 *
 * A server component: it verifies the session and proves the deck belongs to the
 * caller before reading anything. Everything it loads is scoped to that deck, so
 * a deck id belonging to another founder resolves to the same 404 as one that
 * never existed.
 *
 * The page reads the same question and attempt rows the API serves and passes
 * them down as plain props, so the session and the list share one source of
 * truth and `router.refresh()` after an attempt keeps the progress readout and
 * the weak-category panel honest.
 *
 * Attempt payloads are re-validated through `AnswerEvaluationSchema` before they
 * reach the client: the column is untyped JSON, and history is exactly the screen
 * a founder re-reads when planning a meeting.
 */

export const metadata = { title: "Q&A Practice" };

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 100;

/**
 * The columns an attempt carries, mirrored here so the aggregation below reads
 * from one declared shape instead of reaching into Prisma rows by name.
 */
const DIMENSIONS = [
  { key: "clarity", label: "Clarity", column: "clarity" },
  { key: "specificity", label: "Specificity", column: "specificity" },
  { key: "evidence", label: "Evidence", column: "evidence" },
  { key: "relevance", label: "Relevance", column: "relevance" },
  { key: "conciseness", label: "Conciseness", column: "conciseness" },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  column: "clarity" | "specificity" | "evidence" | "relevance" | "conciseness";
}>;

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const deck = await requireDeckRecord(id, user.id).catch(() => null);

  if (!deck) {
    notFound();
  }

  const [questionRows, attemptRows] = await Promise.all([
    prisma.investorQuestion.findMany({
      where: { deckId: deck.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.questionAttempt.findMany({
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
    }),
  ]);

  const questions: PracticeQuestion[] = questionRows.map((row) => ({
    id: row.id,
    question: row.question,
    category: row.category,
    rationale: row.rationale,
    slideRef: row.slideRef,
    difficulty: row.difficulty,
    saved: row.saved,
    createdAt: row.createdAt.toISOString(),
  }));

  const attempts: PracticeAttempt[] = attemptRows.map((row) => ({
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
  }));

  const practisedIds = [...new Set(attempts.map((attempt) => attempt.questionId))];

  const practisedById: Record<string, number> = {};
  for (const attempt of attempts) {
    practisedById[attempt.questionId] =
      (practisedById[attempt.questionId] ?? 0) + 1;
  }

  const completed = attempts.filter(
    (attempt) => attempt.overallScore !== null,
  ).length;

  // Weak categories: the lowest average score per question category, across the
  // categories the founder has actually practised. An un-practised category is not
  // a weakness, so it is never listed.
  const categoryTotals = new Map<string, { total: number; count: number }>();
  for (const attempt of attempts) {
    if (attempt.overallScore === null) continue;
    const entry = categoryTotals.get(attempt.question.category) ?? {
      total: 0,
      count: 0,
    };
    entry.total += attempt.overallScore;
    entry.count += 1;
    categoryTotals.set(attempt.question.category, entry);
  }

  const weakCategories = [...categoryTotals.entries()]
    .map(([category, entry]) => ({
      category,
      label: QUESTION_CATEGORY_LABELS[category] ?? category,
      average: Math.round(entry.total / entry.count),
      attempts: entry.count,
    }))
    .sort((a, b) => a.average - b.average)
    .slice(0, 3);

  // Weak dimensions: the same idea across the five scored axes.
  const weakDimensions = DIMENSIONS.flatMap((dimension) => {
    const values = attempts
      .map((attempt) => attempt[dimension.column])
      .filter((value): value is number => typeof value === "number");

    if (values.length === 0) return [];

    return [
      {
        key: dimension.key,
        label: dimension.label,
        average:
          Math.round(
            (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
          ) / 10,
      },
    ];
  })
    .sort((a, b) => a.average - b.average)
    .slice(0, 2);

  // Only a question this deck owns can be deep-linked into the session.
  const query = await searchParams;
  const requested = query.question;
  const requestedId = typeof requested === "string" ? requested : undefined;
  const initialQuestionId = questions.some(
    (question) => question.id === requestedId,
  )
    ? (requestedId as string)
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-6">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Q&amp;A Practice
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Rehearse the questions this deck invites, in the room, out loud. Every
          suggestion and every flag comes from the deck you have actually built —
          nothing is filled in on your behalf.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <section
          aria-labelledby="practice-stats"
          className="rv-surface flex flex-col gap-4 p-4 sm:p-5"
        >
          <h2
            id="practice-stats"
            className="flex items-center gap-1.5 font-heading text-sm font-semibold tracking-tight"
          >
            <HugeiconsIcon icon={Chat01Icon} className="size-4 text-brand" aria-hidden />
            Where you stand
          </h2>

          <dl className="grid gap-3 sm:grid-cols-3">
            <Stat label="Questions in the bank" value={questions.length} />
            <Stat label="Questions practised" value={practisedIds.length} />
            <Stat label="Answers evaluated" value={completed} />
          </dl>

          {weakCategories.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-brand/30 bg-brand/8 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <HugeiconsIcon icon={Alert02Icon} className="size-3.5 text-brand" aria-hidden />
                  Weakest categories
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {weakCategories.map((entry) => (
                    <li
                      key={entry.category}
                      className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                    >
                      <span className="min-w-0 truncate">{entry.label}</span>
                      <span className="shrink-0 tabular-nums">
                        {entry.average}/100 · {entry.attempts}{" "}
                        {entry.attempts === 1 ? "attempt" : "attempts"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <p className="text-xs font-medium">Weakest dimensions</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {weakDimensions.map((entry) => (
                    <li
                      key={entry.key}
                      className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                    >
                      <span>{entry.label}</span>
                      <span className="tabular-nums">{entry.average}/10</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={CheckIcon} className="size-3.5 text-success" aria-hidden />
              No weak categories yet — answer a few questions and this becomes the
              list of what to work on.
            </p>
          )}
        </section>

        {questions.length > 0 ? (
          <PracticeSession
            deckId={deck.id}
            questions={questions}
            initialQuestionId={initialQuestionId}
          />
        ) : null}

        <QuestionList
          deckId={deck.id}
          initialQuestions={questions}
          practisedIds={practisedIds}
          practisedById={practisedById}
        />

        <PracticeHistory deckId={deck.id} attempts={attempts} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <dt className="text-xs text-subtle-foreground">{label}</dt>
      <dd className="mt-0.5 font-heading text-2xl font-semibold text-brand tabular-nums">
        {value}
      </dd>
    </div>
  );
}
