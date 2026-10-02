import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { StatePanel } from "@/components/dashboard/state-panels";
import {
  AnalyticsUpIcon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  ViewIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/api/guards";
import { getWorkspaceAnalytics } from "@/lib/analytics/aggregate";
import { prisma } from "@/lib/db";
import { format } from "date-fns";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

/**
 * Cross-deck engagement rollup.
 *
 * Deliberately flat: totals plus a per-deck table. Per-deck charts live on the
 * deck's own analytics page, where there is enough context to interpret them.
 */
export default async function WorkspaceAnalyticsPage() {
  const user = await requireUser();

  const decks = await prisma.deck.findMany({
    where: { userId: user.id },
    select: { id: true },
  });

  const analytics = await getWorkspaceAnalytics(decks.map((deck) => deck.id));

  const totals = [
    {
      label: "Total views",
      value: String(analytics.totals.totalViews),
      hint: "Across every shared deck",
      icon: ViewIcon,
    },
    {
      label: "Unique visitors",
      value: String(analytics.totals.uniqueVisitors),
      hint: "Counted per day, not per person",
      icon: AnalyticsUpIcon,
    },
    {
      label: "Completed viewings",
      value: String(analytics.totals.completedViews),
      hint: "Viewers who reached the final slide",
      icon: CheckmarkCircle01Icon,
    },
    {
      label: "Average time",
      value: analytics.totals.averageDurationLabel ?? "—",
      hint: "Per viewing session",
      icon: Clock01Icon,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Engagement across all your shared decks
        </p>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {totals.map((tile) => (
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

      {analytics.decks.length === 0 ? (
        <div className="mt-6">
          <StatePanel
            kind="empty"
            title="No decks yet"
            description="Create a deck and share it to start collecting engagement data."
          />
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">
              Engagement per deck, most recently viewed first
            </caption>
            <thead className="border-b border-border bg-surface-1 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Deck
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Views
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Visitors
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Completed
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Last opened
                </th>
              </tr>
            </thead>
            <tbody>
              {analytics.decks.map((deck) => (
                <tr
                  key={deck.id}
                  className="border-b border-border last:border-b-0"
                >
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <Link
                      href={`/decks/${deck.id}/analytics`}
                      className="font-medium hover:text-primary"
                    >
                      {deck.startupName ?? deck.title ?? "Untitled deck"}
                    </Link>
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {deck.totalViews}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {deck.uniqueVisitors}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {deck.completedViews}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {deck.lastViewedAt
                      ? format(deck.lastViewedAt, "d MMM yyyy")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-subtle-foreground">
        Visitor counts are daily and aggregate. RAISEVIA never stores an IP
        address, user agent, or any raw identifier for the people viewing your
        decks.
      </p>

      {analytics.decks.some((deck) => deck.totalViews > 0) ? (
        <div className="mt-4 flex items-center gap-2">
          <Badge variant="outline">Beta</Badge>
          <span className="text-xs text-muted-foreground">
            Per-slide attention and completion funnels are on each deck&apos;s
            analytics page.
          </span>
        </div>
      ) : null}
    </div>
  );
}
