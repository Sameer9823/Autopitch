"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { format, formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteAttemptAction, resetPracticeAction } from "@/app/actions/practice";
import { AnswerFeedback } from "@/components/practice/answer-feedback";
import { QUESTION_CATEGORY_LABELS } from "@/components/practice/question-list";
import { Clock01Icon, TrashIcon } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AnswerEvaluation } from "@/lib/schemas/investor-questions";
import { cn } from "@/lib/utils";

/**
 * Practice history.
 *
 * A chronological record of every answer the founder has given, because the only
 * way to see improvement in a pitch is to read two attempts of the same question
 * side by side. Each row is a disclosure: collapsed it is a question, a score and
 * a date; expanded it is the full feedback, including the suggested answer — which
 * is appropriate here because the founder is reading the past, not being handed a
 * model answer before they have thought.
 *
 * Removal runs through Server Functions rather than an HTTP round trip: deleting
 * one attempt and clearing the history need no AI, and the actions re-verify the
 * session and the deck's ownership themselves.
 */

export type PracticeAttempt = {
  id: string;
  questionId: string;
  answer: string;
  clarity: number | null;
  specificity: number | null;
  evidence: number | null;
  relevance: number | null;
  conciseness: number | null;
  overallScore: number | null;
  createdAt: string;
  question: {
    question: string;
    category: string;
    rationale: string | null;
    slideRef: string | null;
    difficulty: number;
  };
  evaluation: AnswerEvaluation | null;
};

export function PracticeHistory({
  deckId,
  attempts,
}: {
  deckId: string;
  attempts: PracticeAttempt[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function removeAttempt(attemptId: string) {
    setPendingId(attemptId);
    setError(null);

    try {
      const result = await deleteAttemptAction(deckId, attemptId);

      if (result.status === "error") {
        setError(result.message);
        return;
      }

      if (openId === attemptId) setOpenId(null);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  function clearHistory() {
    setError(null);

    startTransition(async () => {
      const result = await resetPracticeAction(deckId);

      if (result.status === "error") {
        setError(result.message);
        return;
      }

      setConfirmingReset(false);
      setOpenId(null);
      router.refresh();
    });
  }

  if (attempts.length === 0) {
    return (
      <section
        aria-labelledby="practice-history"
        className="rv-surface flex flex-col items-center gap-2 border-dashed px-4 py-10 text-center"
      >
        <HugeiconsIcon
          icon={Clock01Icon}
          className="size-6 text-subtle-foreground"
          aria-hidden
        />
        <h2
          id="practice-history"
          className="font-heading text-sm font-semibold tracking-tight"
        >
          No attempts yet
        </h2>
        <p className="max-w-sm text-xs text-muted-foreground">
          Answer a question above and the feedback lands here, so you can read this
          round against the last one.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="practice-history" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="practice-history"
            className="font-heading text-sm font-semibold tracking-tight"
          >
            Practice history
          </h2>
          <p className="mt-1 text-xs text-subtle-foreground">
            {attempts.length} attempt{attempts.length === 1 ? "" : "s"} — newest
            first. Open one to re-read the feedback.
          </p>
        </div>

        {confirmingReset ? (
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={clearHistory}
              disabled={isPending}
            >
              {isPending ? <Spinner className="size-4" /> : null}
              Clear all {attempts.length}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingReset(false)}
              disabled={isPending}
            >
              Keep them
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmingReset(true)}
          >
            <HugeiconsIcon icon={TrashIcon} aria-hidden />
            Clear history
          </Button>
        )}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>That change did not save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ul className="flex flex-col gap-2">
        {attempts.map((attempt) => {
          const open = openId === attempt.id;

          return (
            <li key={attempt.id} className="rv-surface overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : attempt.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {QUESTION_CATEGORY_LABELS[attempt.question.category] ??
                        attempt.question.category}
                    </Badge>
                    <span
                      className={cn(
                        "font-heading text-sm font-semibold tabular-nums",
                        attempt.overallScore === null
                          ? "text-subtle-foreground"
                          : "text-brand",
                      )}
                    >
                      {attempt.overallScore === null
                        ? "Not scored"
                        : `${attempt.overallScore}/100`}
                    </span>
                    <span className="text-xs text-subtle-foreground">
                      {formatDistanceToNow(new Date(attempt.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </span>

                  <span className="text-sm leading-relaxed text-foreground">
                    {attempt.question.question}
                  </span>
                </button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete attempt from ${format(new Date(attempt.createdAt), "d MMM yyyy")}`}
                  onClick={() => void removeAttempt(attempt.id)}
                  disabled={pendingId === attempt.id || isPending}
                >
                  {pendingId === attempt.id ? (
                    <Spinner className="size-4" />
                  ) : (
                    <HugeiconsIcon icon={TrashIcon} aria-hidden />
                  )}
                </Button>
              </div>

              {open ? (
                <div className="border-t border-border p-4">
                  <AnswerFeedback
                    evaluation={attempt.evaluation}
                    answer={attempt.answer}
                    showSuggested
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
