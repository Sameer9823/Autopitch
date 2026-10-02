import { Suspense } from "react";

import {
  AverageTimePerSlideChart,
  CompletionFunnelChart,
  SlideEngagementChart,
  ViewsOverTimeChart,
} from "@/components/analytics/engagement-charts";
import { EngagementSummary } from "@/components/analytics/engagement-summary";
import { StatePanel } from "@/components/dashboard/state-panels";
import { ShareManager } from "@/components/share/share-manager";
import { Skeleton } from "@/components/ui/skeleton";
import { getDeckAnalytics } from "@/lib/analytics/aggregate";
import { requireDeckRecord, requireUser } from "@/lib/api/guards";
import { formatDuration } from "@/lib/format/duration";
import { prisma } from "@/lib/db";
import type { ShareView } from "@/app/actions/shares";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  params,
}: PageProps<"/decks/[id]/analytics">) {
  const user = await requireUser();
  const { id } = await params;

  // Ownership is proved before any aggregation or share rows are read.
  const deck = await requireDeckRecord(id, user.id);

  const [analytics, shares] = await Promise.all([
    getDeckAnalytics(deck.id),
    prisma.deckShare.findMany({
      where: { deckId: deck.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        permission: true,
        expiresAt: true,
        revokedAt: true,
        viewCount: true,
        createdAt: true,
      },
    }),
  ]);

  const serialized: ShareView[] = shares.map((share) => ({
    id: share.id,
    token: share.token,
    permission: share.permission,
    expiresAt: share.expiresAt?.toISOString() ?? null,
    revokedAt: share.revokedAt?.toISOString() ?? null,
    viewCount: share.viewCount,
    createdAt: share.createdAt.toISOString(),
  }));

  const hasViews = analytics.totalViews > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Engagement
        </h1>
        <p className="text-sm text-muted-foreground">
          {deck.startupName ?? deck.title ?? "This deck"} · how investors moved
          through it
        </p>
      </header>

      {!hasViews ? (
        <div className="mt-6">
          <StatePanel
            kind="empty"
            title="No views yet"
            description="Share this deck with investors and engagement will appear here. Nothing is tracked until someone opens a share link."
          />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <EngagementSummary analytics={analytics} />

          <Suspense fallback={<Skeleton className="h-56 w-full" />}>
            <ChartGrid analytics={analytics} />
          </Suspense>
        </div>
      )}

      <div className="mt-10 flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Share links
        </h2>
        <ShareManager deckId={deck.id} initialShares={serialized} />
      </div>
    </div>
  );
}

/**
 * Charts are grouped so a slow aggregation cannot block the headline tiles, and
 * so the whole block can stream in behind one Suspense boundary.
 */
async function ChartGrid({ analytics }: { analytics: Awaited<ReturnType<typeof getDeckAnalytics>> }) {
  const lastViewed = analytics.lastViewedAt
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(analytics.lastViewedAt)
    : null;

  const insight = buildInsight(analytics);

  return (
    <div className="flex flex-col gap-6">
      {insight ? (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          {insight}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Views over time"
          description="Every time a share link was opened."
        >
          <ViewsOverTimeChart data={analytics.viewsOverTime} />
        </ChartCard>

        <ChartCard
          title="Views per slide"
          description="How many viewers reached each slide."
        >
          <SlideEngagementChart data={analytics.engagementPerSlide} />
        </ChartCard>

        <ChartCard
          title="Average time per slide"
          description="Where attention actually went."
        >
          <AverageTimePerSlideChart
            data={analytics.averageTimePerSlide}
            formatMs={formatDuration}
          />
        </ChartCard>

        <ChartCard
          title="Completion funnel"
          description="How many viewers reached each quarter of the deck."
        >
          <CompletionFunnelChart data={analytics.completionFunnel} />
        </ChartCard>
      </div>

      {lastViewed ? (
        <p className="text-xs text-subtle-foreground">
          Last opened {lastViewed}.
        </p>
      ) : null}
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-subtle-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Turn the aggregate into the one sentence a founder actually wants: where the
 * deck loses people. Only fires when the signal is strong enough to be real
 * signal rather than noise from a handful of views.
 */
function buildInsight(analytics: {
  totalViews: number;
  engagementPerSlide: { order: number; count: number }[];
}): string | null {
  if (analytics.totalViews < 5) return null;

  const drops = analytics.engagementPerSlide
    .map((row, index) => {
      const previous = analytics.engagementPerSlide[index - 1];
      if (!previous || previous.count === 0) return null;
      const delta = previous.count - row.count;
      return delta > 0 ? { order: row.order, delta, share: delta / previous.count } : null;
    })
    .filter((value): value is { order: number; delta: number; share: number } =>
      value !== null,
    )
    .sort((a, b) => b.share - a.share);

  const worst = drops[0];
  if (!worst || worst.share < 0.25) return null;

  return `Attention drops most at slide ${worst.order} — ${Math.round(worst.share * 100)}% of viewers who reached the previous slide stopped there.`;
}
