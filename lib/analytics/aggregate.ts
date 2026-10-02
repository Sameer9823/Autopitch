import { formatDuration } from "@/lib/format/duration";
import { prisma } from "@/lib/db";
import {
  averageDurationMs,
  averageMaxSlideOrder,
  averageTimePerSlide,
  completedViews,
  completionFunnel,
  engagementPerSlide,
  lastViewedAt,
  leastViewedSlide,
  mostViewedSlide,
  totalViews,
  uniqueVisitors,
  viewsOverTime,
} from "@/lib/analytics/queries";

/**
 * Aggregated analytics for one deck.
 *
 * This is the single read model the analytics pages consume. It is computed
 * with a handful of parameterised queries — never by loading every
 * `SlideView` row — and contains no owner-identifying fields.
 */

export type DeckAnalytics = {
  totalViews: number;
  uniqueVisitors: number;
  averageDurationMs: number | null;
  averageDurationLabel: string | null;
  averageCompletionPct: number | null;
  completedViews: number;
  mostViewedSlide: { order: number | null; count: number } | null;
  leastViewedSlide: { order: number | null; count: number } | null;
  lastViewedAt: Date | null;
  viewsOverTime: { date: string; count: number }[];
  engagementPerSlide: { order: number; count: number }[];
  averageTimePerSlide: { order: number; avgMs: number }[];
  completionFunnel: { label: string; threshold: number; count: number }[];
};

/** Compute every analytics figure for a deck in one pass. */
export async function getDeckAnalytics(
  deckId: string,
): Promise<DeckAnalytics> {
  const [total, unique, avgDuration, avgOrder, completed, most, least, last, overTime, perSlide, timePerSlide] =
    await Promise.all([
      totalViews(deckId),
      uniqueVisitors(deckId),
      averageDurationMs(deckId),
      averageMaxSlideOrder(deckId),
      completedViews(deckId),
      mostViewedSlide(deckId),
      leastViewedSlide(deckId),
      lastViewedAt(deckId),
      viewsOverTime(deckId),
      engagementPerSlide(deckId),
      averageTimePerSlide(deckId),
    ]);

  const totalSlides = perSlide.length;

  const [funnel] = await Promise.all([
    completionFunnel(deckId, totalSlides),
  ]);

  return {
    totalViews: total,
    uniqueVisitors: unique,
    averageDurationMs: avgDuration,
    averageDurationLabel: avgDuration === null ? null : formatDuration(avgDuration),
    averageCompletionPct:
      avgOrder === null || totalSlides === 0 ? null : Math.round((avgOrder / totalSlides) * 100),
    completedViews: completed,
    mostViewedSlide: most,
    leastViewedSlide: least,
    lastViewedAt: last,
    viewsOverTime: overTime,
    engagementPerSlide: perSlide,
    averageTimePerSlide: timePerSlide,
    completionFunnel: funnel,
  };
}

/**
 * Workspace-wide rollup across every deck the user owns.
 * Deliberately flat: a per-deck table plus totals, not per-deck charts.
 */
export type WorkspaceAnalytics = {
  totals: {
    totalViews: number;
    uniqueVisitors: number;
    completedViews: number;
    averageDurationLabel: string | null;
  };
  decks: {
    id: string;
    title: string | null;
    startupName: string | null;
    totalViews: number;
    uniqueVisitors: number;
    completedViews: number;
    lastViewedAt: Date | null;
  }[];
};

export async function getWorkspaceAnalytics(
  deckIds: string[],
): Promise<WorkspaceAnalytics> {
  if (deckIds.length === 0) {
    return {
      totals: {
        totalViews: 0,
        uniqueVisitors: 0,
        completedViews: 0,
        averageDurationLabel: null,
      },
      decks: [],
    };
  }

  const [totalViewsAgg, uniqueAgg, completedAgg, avgDurationAgg] = await Promise.all([
    prisma.deckView.aggregate({
      _count: { _all: true },
      _avg: { durationMs: true },
      where: { deckId: { in: deckIds } },
    }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT ("deckId", "visitorHash")) AS count
      FROM "DeckView"
      WHERE "deckId" = ANY(${deckIds}::text[])
    `,
    prisma.deckView.count({
      where: { deckId: { in: deckIds }, completed: true },
    }),
    prisma.deckView.aggregate({
      _avg: { durationMs: true },
      where: { deckId: { in: deckIds } },
    }),
  ]);

  const decks = await prisma.deck.findMany({
    where: { id: { in: deckIds } },
    select: {
      id: true,
      title: true,
      startupName: true,
    },
  });

  const perDeck = await Promise.all(
    decks.map(async (deck) => {
      const [views, unique, completed, last] = await Promise.all([
        totalViews(deck.id),
        uniqueVisitors(deck.id),
        completedViews(deck.id),
        lastViewedAt(deck.id),
      ]);
      return {
        id: deck.id,
        title: deck.title,
        startupName: deck.startupName,
        totalViews: views,
        uniqueVisitors: unique,
        completedViews: completed,
        lastViewedAt: last,
      };
    }),
  );

  return {
    totals: {
      totalViews: totalViewsAgg._count._all,
      uniqueVisitors: Number(uniqueAgg[0]?.count ?? 0),
      completedViews: completedAgg,
      averageDurationLabel:
        avgDurationAgg._avg.durationMs === null
          ? null
          : formatDuration(avgDurationAgg._avg.durationMs),
    },
    decks: perDeck,
  };
}