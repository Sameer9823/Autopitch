"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { format, formatDistanceToNow } from "date-fns";
import { useCallback, useEffect, useState } from "react";

import { CategoryScores } from "@/components/review/category-scores";
import { ConcernsPanel } from "@/components/review/concerns-panel";
import { PitchScore } from "@/components/review/pitch-score";
import { MissingInformation, ReviewIssues } from "@/components/review/review-issues";
import { SlideVerdicts } from "@/components/review/slide-verdicts";
import {
  Analytics01Icon,
  RetryIcon,
  SparklesIcon,
  WandIcon,
} from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { RenderSlide } from "@/lib/deck/render-model";
import type { SlideTheme } from "@/lib/deck/theme";
import type { PitchReview } from "@/lib/schemas/investor-review";
import { cn } from "@/lib/utils";

/**
 * The investor review surface.
 *
 * Owns the three things a server component cannot: the running state, the
 * progress feedback while a review is being written, and the ability to re-open
 * an earlier run. Everything it renders once a review exists is delegated to the
 * presentational components beside it — this file is the state machine and the
 * page layout, not the analysis.
 *
 * A failed run is never a dead end: the row is stored as FAILED with a safe
 * message, and Retry issues the same request again.
 */

export type ReviewSummary = {
  id: string;
  status: string;
  overallScore: number | null;
  createdAt: string;
};

type ReviewState = {
  id: string;
  status: string;
  overallScore: number | null;
  createdAt: string;
  errorMessage: string | null;
  payload: PitchReview | null;
};

export type ReviewRunnerProps = {
  deckId: string;
  initialReview: ReviewState | null;
  initialHistory: ReviewSummary[];
  slides: RenderSlide[];
  theme: SlideTheme | null;
};

/** The steps shown while a review is being written, so waiting reads as progress. */
const RUN_STEPS = [
  "Reading every slide",
  "Scoring the fourteen categories",
  "Checking for data the deck is missing",
  "Writing the issues and the concerns",
];

const STEP_INTERVAL_MS = 4000;

function readableStatus(status: string): string {
  if (status === "PENDING" || status === "RUNNING") return "In progress";
  if (status === "FAILED") return "Failed";
  return "Complete";
}

export function ReviewRunner({
  deckId,
  initialReview,
  initialHistory,
  slides,
  theme,
}: ReviewRunnerProps) {
  const [review, setReview] = useState<ReviewState | null>(initialReview);
  const [history, setHistory] = useState<ReviewSummary[]>(initialHistory);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!running) return;

    const timer = setInterval(() => {
      setStep((current) => Math.min(current + 1, RUN_STEPS.length - 1));
    }, STEP_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [running]);

  const runReview = useCallback(async () => {
    setRunning(true);
    setError(null);
    setStep(0);

    try {
      const response = await fetch(`/api/decks/${deckId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const body: unknown = await response.json();
      const message = readError(body);

      if (!response.ok) {
        throw new Error(message ?? "We could not run the review. Please try again.");
      }

      const data = body as { review: ReviewState | null };

      if (!data.review?.payload) {
        throw new Error(
          "The review finished but could not be read. Please run it again.",
        );
      }

      setReview(data.review);

      // The history strip is refreshed from the same collection endpoint so the
      // new run appears without a full page reload.
      const historyResponse = await fetch(`/api/decks/${deckId}/review`);
      if (historyResponse.ok) {
        const historyBody = (await historyResponse.json()) as {
          history?: ReviewSummary[];
        };
        if (historyBody.history) setHistory(historyBody.history);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We could not run the review. Please try again.",
      );
    } finally {
      setRunning(false);
    }
  }, [deckId]);

  const openOlderReview = useCallback(
    async (reviewId: string) => {
      setLoadingOlder(true);
      setError(null);

      try {
        const response = await fetch(`/api/decks/${deckId}/review/${reviewId}`);
        const body: unknown = await response.json();

        if (!response.ok) {
          throw new Error(readError(body) ?? "That review is no longer available.");
        }

        const data = body as { review: ReviewState };
        setReview(data.review);
        setShowHistory(false);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "That review is no longer available.",
        );
      } finally {
        setLoadingOlder(false);
      }
    },
    [deckId],
  );

  const current = review?.payload ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-subtle-foreground">
            {review
              ? `Reviewed ${formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}`
              : "This deck has not been reviewed yet."}
          </p>
        </div>

        <Button
          onClick={() => void runReview()}
          disabled={running}
          variant={current ? "outline" : "default"}
        >
          {running ? (
            <Spinner className="size-4" />
          ) : (
            <HugeiconsIcon icon={SparklesIcon} aria-hidden />
          )}
          {running
            ? "Review running…"
            : current
              ? "Re-run investor review"
              : "Run investor review"}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>The review did not finish</AlertTitle>
          <AlertDescription>
            <span className="block">{error}</span>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void runReview()}
              disabled={running}
            >
              <HugeiconsIcon icon={RetryIcon} aria-hidden />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {running ? <RunProgress step={step} /> : null}

      {current ? (
        <div className="flex flex-col gap-8">
          <PitchScore review={current} />

          <CategoryScores scores={current.categoryScores} />

          <ReviewIssues issues={current.issues} />

          <MissingInformation items={current.missingInformation} />

          <SlideVerdicts
            verdicts={current.weakestSlides}
            slides={slides}
            theme={theme}
            tone="weak"
          />

          <SlideVerdicts
            verdicts={current.strongestSlides}
            slides={slides}
            theme={theme}
            tone="strong"
          />

          <ConcernsPanel concerns={current.investorConcerns} />

          <RecommendedChanges changes={current.recommendedChanges} />
        </div>
      ) : null}

      {!current && !running ? <NeverReviewed /> : null}

      {history.length > 1 ? (
        <HistoryPanel
          history={history}
          activeId={review?.id ?? null}
          open={showHistory}
          loading={loadingOlder}
          onToggle={() => setShowHistory((value) => !value)}
          onSelect={(reviewId) => void openOlderReview(reviewId)}
        />
      ) : null}
    </div>
  );
}

function readError(body: unknown): string | null {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }

  return null;
}

function RunProgress({ step }: { step: number }) {
  return (
    <section
      aria-live="polite"
      className="rv-surface-raised flex flex-col gap-3 p-5"
      aria-label="Review in progress"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <Spinner className="size-4 text-brand" />
        Reading the whole deck, not a summary of it
      </p>

      <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {RUN_STEPS.map((label, index) => {
          const done = index < step;

          return (
            <li
              key={label}
              className={cn(
                "flex items-center gap-1.5 text-xs",
                index <= step ? "text-foreground" : "text-subtle-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  done ? "bg-success" : index === step ? "bg-brand" : "bg-surface-4",
                )}
              />
              {label}
              {index === step ? <span className="sr-only">(in progress)</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function NeverReviewed() {
  return (
    <div className="rv-surface flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <HugeiconsIcon
        icon={Analytics01Icon}
        className="size-8 text-subtle-foreground"
        aria-hidden
      />
      <div>
        <h2 className="font-heading text-base font-medium tracking-tight">
          No investor review yet
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          The review reads every slide as a fundraising document — the narrative,
          the evidence, and what an investor would still be missing afterwards.
          Anything the deck does not contain is reported as data you need to
          supply, never estimated on your behalf.
        </p>
      </div>
    </div>
  );
}

function RecommendedChanges({ changes }: { changes: readonly string[] }) {
  if (changes.length === 0) return null;

  return (
    <section
      aria-labelledby="recommended-changes"
      className="rv-surface-raised flex flex-col gap-3 p-4 sm:p-5"
    >
      <div>
        <h2
          id="recommended-changes"
          className="flex items-center gap-1.5 font-heading text-sm font-semibold tracking-tight"
        >
          <HugeiconsIcon icon={WandIcon} className="size-4 text-brand" aria-hidden />
          Recommended changes
        </h2>
        <p className="mt-1 text-xs text-subtle-foreground">
          Most valuable first. Working through this list will move the score more
          than any other single change.
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {changes.map((change, index) => (
          <li
            key={change}
            className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm leading-relaxed"
          >
            <span className="mt-0.5 font-heading text-xs font-semibold text-brand tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 text-muted-foreground">{change}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HistoryPanel({
  history,
  activeId,
  open,
  loading,
  onToggle,
  onSelect,
}: {
  history: ReviewSummary[];
  activeId: string | null;
  open: boolean;
  loading: boolean;
  onToggle: () => void;
  onSelect: (reviewId: string) => void;
}) {
  const regionId = "review-history-list";

  return (
    <section aria-labelledby="review-history" className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm transition-colors duration-150 hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        <span className="font-medium">
          Review history
          <span className="ml-2 text-xs font-normal text-subtle-foreground">
            {history.length} runs
          </span>
        </span>
        <span aria-hidden className="text-xs text-subtle-foreground">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open ? (
        <ul id={regionId} className="flex flex-col gap-1.5">
          {history.map((entry) => {
            const isActive = entry.id === activeId;

            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.id)}
                  disabled={loading}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none disabled:opacity-60",
                    isActive
                      ? "border-brand/40 bg-brand/10"
                      : "border-border bg-surface-1 hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {readableStatus(entry.status)}
                    </Badge>
                    <span className="text-muted-foreground">
                      {format(new Date(entry.createdAt), "d MMM yyyy, HH:mm")}
                    </span>
                  </span>
                  <span className="text-xs text-subtle-foreground tabular-nums">
                    {entry.overallScore === null
                      ? "No score"
                      : `${entry.overallScore}/100`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
