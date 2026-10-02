import { prisma } from "@/lib/db";

/**
 * Analytics queries.
 *
 * All queries are scoped to a single deck and are designed to be cheap: we
 * aggregate in the database where possible rather than loading every
 * `SlideView` or `DeckView` row into memory. The caller is responsible for
 * proving the deck belongs to the authenticated user (via `requireDeckRecord`);
 * these helpers themselves never touch ownership.
 *
 * Where Prisma's high-level aggregate cannot express the query (COUNT(DISTINCT …)
 * or date-truncation) we fall back to a parameterised raw SQL query. The inputs
 * are always a deck id and plain numeric bounds — no user data enters the SQL
 * text, so there is no injection surface.
 */

export type AnalyticsTimeBucket = "day" | "hour";

/** Views grouped by calendar day, oldest first. */
export async function viewsOverTime(
  deckId: string,
  days = 30,
): Promise<{ date: string; count: number }[]> {
  const rows = await prisma.$queryRaw<
    { date: string; count: bigint }[]
  >`
    SELECT
      TO_CHAR(DATE(viewedAt), 'YYYY-MM-DD') AS date,
      COUNT(*)::bigint AS count
    FROM "DeckView"
    WHERE "deckId" = ${deckId}
      AND viewedAt >= NOW() - (${days} || ' days')::interval
    GROUP BY DATE(viewedAt)
    ORDER BY DATE(viewedAt) ASC
  `;

  return rows.map((row) => ({ date: row.date, count: Number(row.count) }));
}

/** Total views for a deck. */
export async function totalViews(deckId: string): Promise<number> {
  return prisma.deckView.count({ where: { deckId } });
}

/** Distinct hashed visitors for a deck. */
export async function uniqueVisitors(deckId: string): Promise<number> {
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT "visitorHash") AS count
    FROM "DeckView"
    WHERE "deckId" = ${deckId}
  `;
  return Number(result[0]?.count ?? 0);
}

/** Average view duration in milliseconds, or null when there are no views. */
export async function averageDurationMs(deckId: string): Promise<number | null> {
  const result = await prisma.deckView.aggregate({
    _avg: { durationMs: true },
    where: { deckId },
  });
  return result._avg.durationMs ?? null;
}

/** Average max slide order reached, or null when there are no views. */
export async function averageMaxSlideOrder(deckId: string): Promise<number | null> {
  const result = await prisma.deckView.aggregate({
    _avg: { maxSlideOrder: true },
    where: { deckId },
  });
  return result._avg.maxSlideOrder ?? null;
}

/** Number of views that reached the last slide (completed). */
export async function completedViews(deckId: string): Promise<number> {
  return prisma.deckView.count({ where: { deckId, completed: true } });
}

/** Most-viewed slide (by distinct slide order), with its view count. */
export async function mostViewedSlide(deckId: string): Promise<{
  order: number | null;
  count: number;
} | null> {
  const rows = await prisma.slideView.groupBy({
    by: ["order"],
    _count: { _all: true },
    where: { deckId },
    orderBy: { _count: { order: "desc" } },
    take: 1,
  });
  const row = rows[0];
  return row ? { order: row.order, count: row._count._all } : null;
}

/** Least-viewed slide (that has been viewed at least once). */
export async function leastViewedSlide(deckId: string): Promise<{
  order: number | null;
  count: number;
} | null> {
  const rows = await prisma.slideView.groupBy({
    by: ["order"],
    _count: { _all: true },
    where: { deckId },
    orderBy: { _count: { order: "asc" } },
    take: 1,
  });
  const row = rows[0];
  return row ? { order: row.order, count: row._count._all } : null;
}

/** Most recent view timestamp, or null. */
export async function lastViewedAt(deckId: string): Promise<Date | null> {
  const result = await prisma.deckView.findFirst({
    where: { deckId },
    orderBy: { viewedAt: "desc" },
    select: { viewedAt: true },
  });
  return result?.viewedAt ?? null;
}

/** Views per slide order, oldest first. */
export async function engagementPerSlide(deckId: string) {
  const rows = await prisma.slideView.groupBy({
    by: ["order"],
    _count: { _all: true },
    where: { deckId },
    orderBy: { order: "asc" },
  });
  return rows.map((row) => ({ order: row.order, count: row._count._all }));
}

/** Average dwell time per slide order, in milliseconds. */
export async function averageTimePerSlide(deckId: string) {
  const rows = await prisma.slideView.groupBy({
    by: ["order"],
    _avg: { dwellMs: true },
    where: { deckId },
    orderBy: { order: "asc" },
  });
  return rows.map((row) => ({
    order: row.order,
    avgMs: row._avg.dwellMs ?? 0,
  }));
}

/**
 * Completion funnel: how many distinct visitors reached each milestone.
 * Milestones are fractions of the deck's total slide count.
 */
export async function completionFunnel(
  deckId: string,
  totalSlides: number,
): Promise<{ label: string; threshold: number; count: number }[]> {
  if (totalSlides <= 0) {
    return [];
  }

  const milestones = [0.25, 0.5, 0.75, 1.0];
  const labels: Record<number, string> = {
    0.25: "25%",
    0.5: "50%",
    0.75: "75%",
    1.0: "Completed",
  };

  const views = await prisma.deckView.findMany({
    where: { deckId },
    select: { maxSlideOrder: true },
  });

  const total = views.length;
  const funnel = milestones.map((fraction) => {
    const threshold = Math.max(1, Math.ceil(totalSlides * fraction));
    const count = views.filter(
      (view) => (view.maxSlideOrder ?? 0) >= threshold,
    ).length;
    return {
      label: labels[fraction],
      threshold,
      count,
    };
  });

  return [{ label: "Opened", threshold: 1, count: total }, ...funnel];
}