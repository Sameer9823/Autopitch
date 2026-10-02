import { HugeiconsIcon } from "@hugeicons/react";

import {
  Analytics01Icon,
  AnalyticsUpIcon,
  Clock01Icon,
  ViewIcon,
} from "@/components/icons";
import type { DeckAnalytics } from "@/lib/analytics/aggregate";

/**
 * Headline engagement figures for a shared deck.
 *
 * Presentational only — it receives an already-aggregated object so it stays a
 * plain server component with no data access of its own. Every figure here is an
 * aggregate; nothing in this component can identify a viewer.
 */
export function EngagementSummary({
  analytics,
}: {
  analytics: DeckAnalytics;
}) {
  const tiles = [
    {
      label: "Total views",
      value: String(analytics.totalViews),
      hint: `${analytics.uniqueVisitors} unique visitor${
        analytics.uniqueVisitors === 1 ? "" : "s"
      }`,
      icon: ViewIcon,
    },
    {
      label: "Unique visitors",
      value: String(analytics.uniqueVisitors),
      hint: "Counted per day, not per person",
      icon: AnalyticsUpIcon,
    },
    {
      label: "Average time",
      value: analytics.averageDurationLabel ?? "—",
      hint: "Per viewing session",
      icon: Clock01Icon,
    },
    {
      label: "Deck completion",
      value:
        analytics.averageCompletionPct === null
          ? "—"
          : `${analytics.averageCompletionPct}%`,
      hint: `${analytics.completedViews} finished the deck`,
      icon: Analytics01Icon,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex flex-col gap-1 rounded-lg border border-border bg-surface-1 p-4"
        >
          <dt className="flex items-center gap-2 text-xs text-muted-foreground">
            <HugeiconsIcon icon={tile.icon} className="size-3.5" aria-hidden />
            {tile.label}
          </dt>
          <dd className="font-heading text-2xl font-semibold tabular-nums">
            {tile.value}
          </dd>
          <p className="text-xs text-subtle-foreground">{tile.hint}</p>
        </div>
      ))}
    </dl>
  );
}
