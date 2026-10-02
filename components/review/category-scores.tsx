import { HugeiconsIcon } from "@hugeicons/react";

import { Alert02Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import type { ReviewCategory } from "@/lib/schemas/investor-review";
import { cn } from "@/lib/utils";

/**
 * Category scores for the investor review.
 *
 * Every category carries the number AND the sentence that produced it. The
 * number is a rank; the rationale is the work, so the layout gives the sentence
 * as much room as the score rather than hiding it behind a hover.
 *
 * This module is the canonical place a review category becomes display copy —
 * the issue list and the concerns panel both label categories from here, so a
 * category can never read one way on the score panel and another in a list.
 */

export const REVIEW_CATEGORY_LABELS: Record<ReviewCategory, string> = {
  problem: "Problem",
  solution: "Solution",
  market: "Market",
  product: "Product",
  businessModel: "Business Model",
  traction: "Traction",
  competition: "Competition",
  moat: "Moat",
  gtm: "Go-to-market",
  financials: "Financials",
  team: "Team",
  ask: "Fundraising Ask",
  narrative: "Narrative",
  visualCommunication: "Visual Communication",
};

/** Turn a category key into readable copy, tolerating anything the payload holds. */
export function reviewCategoryLabel(category: string): string {
  const known = REVIEW_CATEGORY_LABELS[category as ReviewCategory];
  if (known) return known;

  return category
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase())
    .trim();
}

/**
 * A thin score meter.
 *
 * The numeric value always sits beside it, so the bar reinforces the number
 * rather than being the only signal.
 */
export function ScoreBar({
  value,
  max = 10,
  label,
  className,
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("flex items-center gap-2", className)}
    >
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-4">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-150 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {value}/{max}
      </span>
    </div>
  );
}

export type CategoryScoreEntry = {
  category: string;
  score: number;
  rationale: string;
};

export function CategoryScores({
  scores,
}: {
  scores: readonly CategoryScoreEntry[];
}) {
  if (scores.length === 0) return null;

  return (
    <section aria-labelledby="category-scores">
      <h2
        id="category-scores"
        className="font-heading text-sm font-semibold tracking-tight"
      >
        Category scores
      </h2>
      <p className="mt-1 text-xs text-subtle-foreground">
        Fourteen of the checks an investor runs. Each score is followed by the
        reasoning it came from.
      </p>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {scores.map((entry) => {
          const weak = entry.score <= 4;
          const label = reviewCategoryLabel(entry.category);

          return (
            <div key={entry.category} className="rv-surface flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <dt className="truncate text-sm font-medium">{label}</dt>
                {weak ? (
                  <Badge variant="destructive" className="shrink-0">
                    <HugeiconsIcon icon={Alert02Icon} aria-hidden />
                    Weak
                  </Badge>
                ) : null}
              </div>

              <ScoreBar value={entry.score} label={`${label} score`} />

              <dd className="text-xs leading-relaxed text-muted-foreground">
                {entry.rationale}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
