import { HugeiconsIcon } from "@hugeicons/react";

import { Chat01Icon, Target01Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { reviewCategoryLabel } from "@/components/review/category-scores";
import type { Concern } from "@/lib/ai/investor-review";

/**
 * The objections an investor will raise in the room.
 *
 * Each entry says who is likely to raise it and on what basis, so the founder
 * knows which partner to prepare for. `suggestedResponse` is a direction, not a
 * script to read out — it is worded as what to address rather than as words to
 * memorise.
 */

export function ConcernsPanel({ concerns }: { concerns: readonly Concern[] }) {
  if (concerns.length === 0) return null;

  return (
    <section
      aria-labelledby="investor-concerns"
      className="rv-surface-raised flex flex-col gap-3 p-4 sm:p-5"
    >
      <div>
        <h2
          id="investor-concerns"
          className="font-heading text-sm font-semibold tracking-tight"
        >
          Potential investor concerns
        </h2>
        <p className="mt-1 text-xs text-subtle-foreground">
          The questions this deck invites, and what to have ready for each.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {concerns.map((concern, index) => (
          <li
            key={`${concern.concern}-${index}`}
            className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {reviewCategoryLabel(concern.category)}
              </Badge>
              {concern.raisedBy ? (
                <span className="inline-flex items-center gap-1 text-xs text-subtle-foreground">
                  <HugeiconsIcon icon={Chat01Icon} className="size-3.5" aria-hidden />
                  Raised by {concern.raisedBy}
                </span>
              ) : null}
            </div>

            <p className="text-sm leading-relaxed text-foreground">
              {concern.concern}
            </p>

            <div className="flex items-start gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2">
              <HugeiconsIcon
                icon={Target01Icon}
                className="mt-0.5 size-3.5 shrink-0 text-brand"
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Prepare: </span>
                {concern.suggestedResponse}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
