import { HugeiconsIcon } from "@hugeicons/react";

import { InformationCircleIcon, SparklesIcon } from "@/components/icons";
import type { PitchReview } from "@/lib/schemas/investor-review";
import { cn } from "@/lib/utils";

/**
 * The overall pitch score.
 *
 * This is the one number a founder will screenshot, so it gets the visual weight.
 * It is also the number most likely to be over-trusted, so the panel states
 * plainly, in the component itself, that it is a summary of the analysis rather
 * than the analysis. Everything a score cannot carry — the reasoning, the missing
 * data, the concerns — is in the sections beneath it.
 */

function band(score: number): { label: string; tone: string } {
  if (score >= 80) {
    return { label: "Strong", tone: "border-brand/40 bg-brand/10 text-brand" };
  }
  if (score >= 65) {
    return { label: "Solid", tone: "border-border bg-surface-4 text-foreground" };
  }
  if (score >= 50) {
    return {
      label: "Promising, with gaps",
      tone: "border-border bg-surface-4 text-foreground",
    };
  }
  if (score >= 30) {
    return { label: "Early", tone: "border-border bg-surface-4 text-foreground" };
  }
  return { label: "Needs a rebuild", tone: "border-destructive/40 bg-destructive/10 text-destructive" };
}

export function PitchScore({
  review,
  generatedAt,
  className,
}: {
  review: PitchReview;
  /** ISO timestamp of the run that produced this review. */
  generatedAt?: string;
  className?: string;
}) {
  const score = review.overallScore;
  const bandInfo = band(score);

  return (
    <section
      aria-labelledby="overall-pitch-score"
      className={cn("rv-surface-raised overflow-hidden", className)}
    >
      <div className="rv-accent-gradient h-0.5 w-full" aria-hidden />

      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-center gap-4">
          <div className="flex flex-col items-start">
            <p
              id="overall-pitch-score"
              className="text-[0.6875rem] font-medium tracking-[0.14em] text-subtle-foreground uppercase"
            >
              Overall Pitch Score
            </p>
            <p className="flex items-baseline gap-1">
              <span className="font-heading text-6xl leading-none font-semibold text-brand tabular-nums">
                {score}
              </span>
              <span className="text-lg text-subtle-foreground tabular-nums">/100</span>
            </p>
          </div>

          <div
            className={cn(
              "hidden rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex",
              bandInfo.tone,
            )}
          >
            {bandInfo.label}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-foreground">
            {review.summary}
          </p>

          <p className="mt-2 flex items-start gap-1.5 text-xs text-subtle-foreground">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden
            />
            <span>
              This is a summary of the analysis below, not the analysis itself. Read
              the issues, the missing data and the concerns before you act on the
              number.
            </span>
          </p>

          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle-foreground">
            <span className="inline-flex items-center gap-1">
              <HugeiconsIcon icon={SparklesIcon} className="size-3.5" aria-hidden />
              Grounded in this deck only
            </span>
            {generatedAt ? <span>Reviewed {generatedAt}</span> : null}
          </p>
        </div>
      </div>
    </section>
  );
}
