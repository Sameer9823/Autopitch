import { NextResponse } from "next/server";

import { requireDeckRecord, requireUser, withErrorHandling } from "@/lib/api/guards";
import { getDeckAnalytics } from "@/lib/analytics/aggregate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Engagement analytics for one deck.
 *
 * Returns only aggregated, non-identifying figures. The payload contains no
 * visitor hashes, no timestamps that could be correlated back to a person, and
 * nothing about the viewer beyond "how they moved through the deck".
 */
export const GET = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    // Ownership is proven before any aggregation runs.
    const deck = await requireDeckRecord(id, user.id);

    const analytics = await getDeckAnalytics(deck.id);

    return NextResponse.json({
      deck: {
        id: deck.id,
        title: deck.title,
        startupName: deck.startupName,
      },
      ...analytics,
      lastViewedAt: analytics.lastViewedAt?.toISOString() ?? null,
    });
  },
);
