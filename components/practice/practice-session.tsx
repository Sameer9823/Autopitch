"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnswerFeedback } from "@/components/practice/answer-feedback";
import type { PracticeQuestion } from "@/components/practice/question-list";
import { QUESTION_CATEGORY_LABELS } from "@/components/practice/question-list";
import type { PracticeAttempt } from "@/components/practice/practice-history";
import {
  Chat01Icon,
  Clock01Icon,
  EyeIcon,
  RetryIcon,
  SparklesIcon,
} from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/**
 * One practice round, staged like a meeting rather than a form.
 *
 * The question panel comes first and looks like the room does: the label, then
 * the question in the largest type on the page. The answer box is only reached
 * once the founder has read it.
 *
 * The suggested answer is never handed over. It stays behind an explicit
 * "Show suggested answer" press, because reading someone else's answer before
 * writing your own is the fastest way to not learn the question.
 *
 * Advancing goes through `POST /questions/practice`, which returns the question
 * the founder has practised least — so "Next" rotates through new ground first and
 * revisits old ground last, rather than walking the list in order.
 */

const MIN_ANSWER_LENGTH = 20;

const LOADING_MESSAGE = "Selecting a question you have practised least";

type Phase = "loading" | "answering" | "evaluating" | "done";

export function PracticeSession({
  deckId,
  questions,
  initialQuestionId,
}: {
  deckId: string;
  questions: PracticeQuestion[];
  /** Deep-linked question, when the founder arrived from the question list. */
  initialQuestionId: string | null;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [question, setQuestion] = useState<PracticeQuestion | null>(
    questions.find((entry) => entry.id === initialQuestionId) ?? null,
  );
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>(initialQuestionId ? "answering" : "loading");
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const [revealSuggested, setRevealSuggested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Ask the server which question to put in front of the founder.
   *
   * Only used without an id on a deep link, so `Next question` rotates through
   * the least-practised ground first instead of walking the list in order.
   */
  const requestQuestion = useCallback(
    async (questionId?: string): Promise<PracticeQuestion> => {
      const response = await fetch(`/api/decks/${deckId}/questions/practice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(questionId ? { questionId } : {}),
      });

      const body = (await response
        .json()
        .catch(() => null)) as
        | { question?: PracticeQuestion; error?: string }
        | null;

      if (!response.ok || !body?.question) {
        throw new Error(
          body?.error ?? "We could not load the next question. Please try again.",
        );
      }

      return body.question;
    },
    [deckId],
  );

  /** Clear the round, then move to another question. Used by the button handlers. */
  const loadQuestion = useCallback(
    async (questionId?: string) => {
      setPhase("loading");
      setError(null);
      setAttempt(null);
      setRevealSuggested(false);
      setAnswer("");

      try {
        setQuestion(await requestQuestion(questionId));
        setPhase("answering");
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "We could not load the next question. Please try again.",
        );
        setPhase("answering");
      }
    },
    [requestQuestion],
  );

  // Arriving without a deep-linked question: ask the server for the first one.
  // The state updates happen in the promise callbacks rather than in the effect
  // body, so this does not cause a cascading render.
  useEffect(() => {
    if (initialQuestionId) return;

    let cancelled = false;

    void requestQuestion().then(
      (next) => {
        if (cancelled) return;
        setQuestion(next);
        setPhase("answering");
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "We could not load the next question. Please try again.",
        );
        setPhase("answering");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [initialQuestionId, requestQuestion]);

  async function submitAnswer() {
    if (!question) return;

    setPhase("evaluating");
    setError(null);

    try {
      const response = await fetch(`/api/decks/${deckId}/questions/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, answer }),
      });

      const body = (await response
        .json()
        .catch(() => null)) as { attempt?: PracticeAttempt; error?: string } | null;

      if (!response.ok || !body?.attempt) {
        throw new Error(
          body?.error ?? "We could not evaluate that answer. Please try again.",
        );
      }

      setAttempt(body.attempt);
      setRevealSuggested(false);
      setPhase("done");

      // The deck's practised counts and weak categories come from the server.
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We could not evaluate that answer. Please try again.",
      );
      setPhase("answering");
    }
  }

  function tryAgain() {
    setAttempt(null);
    setRevealSuggested(false);
    setAnswer("");
    setPhase("answering");
    textareaRef.current?.focus();
  }

  const tooShort = answer.trim().length < MIN_ANSWER_LENGTH;

  return (
    <section
      aria-labelledby="practice-question"
      className="rv-surface-raised overflow-hidden"
    >
      <div aria-hidden className="rv-accent-gradient h-0.5 w-full" />

      <div className="flex flex-col gap-5 p-5 sm:p-6">
        {phase === "loading" ? (
          <div
            role="status"
            className="flex flex-col items-center gap-3 py-10 text-center"
          >
            <Spinner className="size-5 text-brand" />
            <p className="text-sm text-muted-foreground">{LOADING_MESSAGE}</p>
          </div>
        ) : null}

        {question && phase !== "loading" ? (
          <header className="flex flex-col gap-2">
            <p className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-medium tracking-[0.16em] text-brand uppercase">
              <HugeiconsIcon icon={Chat01Icon} className="size-3.5" aria-hidden />
              Investor question
            </p>

            <h2
              id="practice-question"
              className="font-heading text-xl leading-snug font-semibold tracking-tight text-foreground sm:text-2xl"
            >
              {question.question}
            </h2>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="secondary">
                {QUESTION_CATEGORY_LABELS[question.category] ?? question.category}
              </Badge>
              {question.slideRef ? (
                <span className="text-xs text-subtle-foreground">
                  {question.slideRef}
                </span>
              ) : null}
              <span className="text-xs text-subtle-foreground">
                Difficulty {question.difficulty}/5
              </span>
            </div>

            {question.rationale ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="text-subtle-foreground">Why they ask: </span>
                {question.rationale}
              </p>
            ) : null}
          </header>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>That did not work</AlertTitle>
            <AlertDescription>
              <span className="block">{error}</span>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => void loadQuestion(question?.id)}
                disabled={phase === "loading"}
              >
                <HugeiconsIcon icon={RetryIcon} aria-hidden />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {phase === "answering" || phase === "evaluating" ? (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="practice-answer"
              className="text-sm font-medium text-foreground"
            >
              Write your answer…
            </label>
            <Textarea
              id="practice-answer"
              ref={textareaRef}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              disabled={phase === "evaluating"}
              placeholder="Answer out loud, then write what you said. Two or three sentences is realistic."
              className="min-h-40 text-base leading-relaxed"
              aria-describedby="practice-answer-hint"
            />
            <p id="practice-answer-hint" className="text-xs text-subtle-foreground">
              {tooShort
                ? `A sentence or two is the minimum — ${MIN_ANSWER_LENGTH - answer.trim().length} more characters.`
                : "Write it as you would say it, not as you would write an email."}
            </p>

            <div className="flex justify-end pt-1">
              <Button
                size="lg"
                onClick={() => void submitAnswer()}
                disabled={phase === "evaluating" || tooShort || !question}
              >
                {phase === "evaluating" ? (
                  <Spinner className="size-4" />
                ) : (
                  <HugeiconsIcon icon={SparklesIcon} aria-hidden />
                )}
                {phase === "evaluating" ? "Evaluating…" : "Submit answer"}
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "done" && attempt ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <HugeiconsIcon icon={Clock01Icon} className="size-3.5" aria-hidden />
                Scored{" "}
                <span className="font-heading text-sm font-semibold text-brand tabular-nums">
                  {attempt.overallScore ?? "—"}
                </span>
                /100
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={tryAgain}>
                  <HugeiconsIcon icon={RetryIcon} aria-hidden />
                  Try again
                </Button>

                {!revealSuggested ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRevealSuggested(true)}
                  >
                    <HugeiconsIcon icon={EyeIcon} aria-hidden />
                    Show suggested answer
                  </Button>
                ) : null}

                <Button size="sm" onClick={() => void loadQuestion()}>
                  Next question
                </Button>
              </div>
            </div>

            <AnswerFeedback
              evaluation={attempt.evaluation}
              answer={attempt.answer}
              showSuggested={revealSuggested}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
