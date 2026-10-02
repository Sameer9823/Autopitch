"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Chat01Icon, ChatAdd01Icon, SparklesIcon, StarIcon } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { QUESTION_CATEGORIES } from "@/lib/schemas/investor-questions";
import { cn } from "@/lib/utils";

/**
 * The deck's investor question bank.
 *
 * Three actions per question — Practice, Save, Generate More — because those are
 * the three things a founder actually decides: work on it, keep it, or find more
 * like it. Generate More posts to the same endpoint as the first generation; the
 * service is given every existing question and drops anything it produces twice.
 *
 * Difficulty is shown as filled pips AND the word, never colour alone, and the
 * save toggle is a real checkbox button so it is reachable from the keyboard and
 * announced as a toggle rather than as an unlabelled icon.
 */

export type PracticeQuestion = {
  id: string;
  question: string;
  category: string;
  rationale: string | null;
  slideRef: string | null;
  difficulty: number;
  saved: boolean;
  createdAt: string;
};

export const QUESTION_CATEGORY_LABELS: Record<string, string> = {
  MARKET: "Market",
  PRODUCT: "Product",
  COMPETITION: "Competition",
  TRACTION: "Traction",
  BUSINESS_MODEL: "Business Model",
  REVENUE: "Revenue",
  GTM: "Go-to-market",
  FINANCIALS: "Financials",
  TEAM: "Team",
  FUNDRAISING: "Fundraising",
  RISKS: "Risks",
};

const DIFFICULTY_WORDS: Record<number, string> = {
  1: "Easy",
  2: "Light",
  3: "Standard",
  4: "Hard",
  5: "Brutal",
};

/** Pips plus a word — the shape stays readable without colour. */
function Difficulty({ value }: { value: number }) {
  const clamped = Math.max(1, Math.min(5, value));

  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cn(
              "h-2.5 w-1 rounded-[1px]",
              step <= clamped ? "bg-brand" : "bg-surface-4",
            )}
          />
        ))}
      </span>
      <span className="text-xs text-subtle-foreground">
        {DIFFICULTY_WORDS[clamped] ?? `Level ${clamped}`}
      </span>
      <span className="sr-only">
        Difficulty {clamped} of 5
      </span>
    </span>
  );
}

export function QuestionList({
  deckId,
  initialQuestions,
  practisedIds,
  practisedById,
}: {
  deckId: string;
  initialQuestions: PracticeQuestion[];
  /** Question ids the founder has answered at least once. */
  practisedIds: string[];
  /** Attempts per question, used for the per-question counter. */
  practisedById: Record<string, number>;
}) {
  const router = useRouter();
  const [savedOverrides, setSavedOverrides] = useState<Record<string, boolean>>({});
  const [category, setCategory] = useState<string>("ALL");
  const [savedOnly, setSavedOnly] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The server owns the list; this component owns only the optimistic `saved`
   * flag, applied on top of the props. Generating more and finishing an attempt
   * both call `router.refresh()`, so the list can never drift out of sync and no
   * effect is needed to copy props into state.
   */
  const questions = useMemo(
    () =>
      initialQuestions.map((question) =>
        question.id in savedOverrides
          ? { ...question, saved: savedOverrides[question.id] as boolean }
          : question,
      ),
    [initialQuestions, savedOverrides],
  );

  const visible = useMemo(
    () =>
      questions.filter((question) => {
        if (category !== "ALL" && question.category !== category) return false;
        if (savedOnly && !question.saved) return false;
        return true;
      }),
    [questions, category, savedOnly],
  );

  const practisedCount = questions.filter((question) =>
    practisedIds.includes(question.id),
  ).length;

  async function generateMore() {
    setGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/decks/${deckId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 8 }),
      });

      const body = (await response
        .json()
        .catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(
          body?.error ?? "We could not generate more questions. Please try again.",
        );
      }

      setSavedOverrides({});
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We could not generate more questions.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function toggleSaved(questionId: string, next: boolean) {
    setSavingId(questionId);
    setError(null);

    try {
      const response = await fetch(
        `/api/decks/${deckId}/questions/${questionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ saved: next }),
        },
      );

      const body = (await response
        .json()
        .catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "That change could not be saved.");
      }

      setSavedOverrides((current) => ({ ...current, [questionId]: next }));
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That change could not be saved.",
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section
      aria-labelledby="question-bank"
      className="rv-surface flex flex-col gap-4 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="question-bank"
            className="font-heading text-sm font-semibold tracking-tight"
          >
            Investor questions
          </h2>
          <p className="mt-1 text-xs text-subtle-foreground">
            Generated from this deck. {questions.length} in the bank.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void generateMore()}
          disabled={generating}
        >
          {generating ? (
            <Spinner className="size-4" />
          ) : (
            <HugeiconsIcon icon={ChatAdd01Icon} aria-hidden />
          )}
          {generating ? "Generating…" : "Generate more"}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Practised{" "}
          <span className="font-medium text-foreground tabular-nums">
            {practisedCount}
          </span>{" "}
          of{" "}
          <span className="font-medium text-foreground tabular-nums">
            {questions.length}
          </span>{" "}
          questions
        </p>
        <Progress
          value={questions.length === 0 ? 0 : (practisedCount / questions.length) * 100}
          className="w-full sm:max-w-[16rem]"
          aria-label="Questions practised"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label htmlFor="question-category" className="text-xs text-muted-foreground">
          Category
        </label>
        <NativeSelect
          id="question-category"
          size="sm"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <NativeSelectOption value="ALL">All categories</NativeSelectOption>
          {QUESTION_CATEGORIES.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {QUESTION_CATEGORY_LABELS[value] ?? value}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <button
          type="button"
          role="switch"
          aria-checked={savedOnly}
          onClick={() => setSavedOnly((value) => !value)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 text-xs transition-colors duration-150 hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
        >
          <HugeiconsIcon icon={StarIcon} className="size-3.5" aria-hidden />
          Saved only
        </button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>That did not work</AlertTitle>
          <AlertDescription>
            <span className="block">{error}</span>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void generateMore()}
              disabled={generating}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {questions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <HugeiconsIcon
            icon={SparklesIcon}
            className="mx-auto size-6 text-subtle-foreground"
            aria-hidden
          />
          <p className="mt-2 text-sm font-medium">No questions yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Generate a set grounded in this deck and you can start practising the
            answers out loud.
          </p>
          <Button
            className="mt-3"
            onClick={() => void generateMore()}
            disabled={generating}
          >
            {generating ? <Spinner className="size-4" /> : null}
            {generating ? "Generating…" : "Generate questions"}
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">
          No questions match this filter.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((question) => {
            const attempts = practisedById[question.id] ?? 0;

            return (
              <li
                key={question.id}
                className="rv-surface flex flex-col gap-3 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {QUESTION_CATEGORY_LABELS[question.category] ?? question.category}
                  </Badge>
                  <Difficulty value={question.difficulty} />
                  {question.slideRef ? (
                    <span className="text-xs text-subtle-foreground">
                      {question.slideRef}
                    </span>
                  ) : null}
                  {attempts > 0 ? (
                    <Badge variant="outline">
                      {attempts} attempt{attempts === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>

                <p className="text-sm leading-relaxed text-foreground">
                  {question.question}
                </p>

                {question.rationale ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="text-subtle-foreground">Why they ask: </span>
                    {question.rationale}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    render={
                      <Link
                        href={`/decks/${deckId}/practice?question=${question.id}`}
                      />
                    }
                  >
                    <HugeiconsIcon icon={Chat01Icon} aria-hidden />
                    Practice
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void toggleSaved(question.id, !question.saved)}
                    disabled={savingId === question.id}
                  >
                    {savingId === question.id ? (
                      <Spinner className="size-4" />
                    ) : (
                      <HugeiconsIcon icon={StarIcon} aria-hidden />
                    )}
                    {question.saved ? "Saved" : "Save"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      </section>
  );
}
