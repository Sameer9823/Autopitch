import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { PitchScore, StatePanel } from "@/components/dashboard/state-panels";
import { DeckStatusBadge } from "@/components/deck-status-badge";
import {
  Analytics01Icon,
  Chat01Icon,
  EyeIcon,
  LayoutGridIcon,
  PlusIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";

export const metadata = { title: "Dashboard" };

const STAGE_LABELS: Record<string, string> = {
  BOOTSTRAP: "Bootstrap",
  PRE_SEED: "Pre-Seed",
  SEED: "Seed",
  SERIES_A: "Series A",
  SERIES_B: "Series B",
  GROWTH: "Growth",
  LATER: "Late stage",
  UNKNOWN: "Stage not set",
};

const DECK_TYPE_LABELS: Record<string, string> = {
  PITCH_DECK: "Pitch Deck",
  ONE_PAGER: "One-Pager",
  DATA_ROOM: "Data Room",
  UPDATE: "Company Update",
};

export default async function DashboardPage() {
  const user = await requireUser();

  const [decks, scoredCount, qaSessionCount] = await Promise.all([
    prisma.deck.findMany({
      where: { userId: user.id, workspaceId: user.workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { _count: { select: { slides: true, views: true } } },
    }),
    prisma.deck.count({
      where: { userId: user.id, pitchScore: { not: null } },
    }),
    prisma.questionAttempt.count({ where: { deck: { userId: user.id } } }),
  ]);

  const deckIds = decks.map((deck) => deck.id);

  const [viewAggregate, viewCount, pitchAgg] = await Promise.all([
    deckIds.length
      ? prisma.deckView.aggregate({
          where: { deckId: { in: deckIds } },
          _avg: { durationMs: true },
        })
      : Promise.resolve({ _avg: { durationMs: null } }),
    prisma.deckView.count({ where: { deckId: { in: deckIds } } }),
    prisma.deck.aggregate({
      where: { userId: user.id, pitchScore: { not: null } },
      _avg: { pitchScore: true },
    }),
  ]);

  const totalDecks = await prisma.deck.count({ where: { userId: user.id } });

  const stats = [
    {
      label: "Decks",
      value: String(totalDecks),
      icon: LayoutGridIcon,
    },
    {
      label: "Investor Views",
      value: String(viewCount),
      icon: EyeIcon,
    },
    {
      label: "Pitch Score",
      value:
        pitchAgg._avg.pitchScore === null
          ? "—"
          : String(Math.round(pitchAgg._avg.pitchScore)),
      hint: scoredCount > 0 ? `${scoredCount} scored` : "Run a review",
      icon: Analytics01Icon,
    },
    {
      label: "Q&A Sessions",
      value: String(qaSessionCount),
      hint:
        viewAggregate._avg.durationMs && viewCount > 0
          ? `${Math.round(viewAggregate._avg.durationMs / 1000)}s avg. view`
          : undefined,
      icon: Chat01Icon,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
      <div className="flex flex-col gap-8">
        <section className="rounded-xl border border-border bg-surface-1 px-6 py-8 sm:px-8 sm:py-10">
          <h1 className="max-w-2xl font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Build your next investor story.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Create, refine and prepare your pitch before it reaches the investor.
          </p>
        </section>

        <section aria-label="Workspace summary">
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((stat) => (
              <li
                key={stat.label}
                className="rounded-lg border border-border bg-surface-1 p-4"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <HugeiconsIcon
                    icon={stat.icon}
                    className="size-4"
                    aria-hidden
                  />
                  {stat.label}
                </div>
                <p className="mt-2 font-heading text-2xl font-semibold tracking-tight tabular-nums">
                  {stat.value}
                </p>
                {stat.hint ? (
                  <p className="mt-0.5 text-xs text-subtle-foreground">
                    {stat.hint}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="recent-decks" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <h2
              id="recent-decks"
              className="font-heading text-lg font-semibold tracking-tight"
            >
              Recent Decks
            </h2>
            <Button variant="outline" size="sm" render={<Link href="/decks" />}>
              View all
            </Button>
          </div>

          {decks.length === 0 ? (
            <StatePanel
              kind="empty"
              title="No decks yet"
              description="Create your first investor deck from a startup brief, an imported document, or a URL."
              action={
                <Button render={<Link href="/decks/new" />}>
                  <HugeiconsIcon icon={PlusIcon} aria-hidden />
                  New Deck
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {decks.map((deck) => (
                <li key={deck.id}>
                  <Link
                    href={`/decks/${deck.id}/editor`}
                    className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4 transition-colors hover:border-border hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {deck.startupName ?? deck.title ?? "Untitled deck"}
                        </p>
                        <p className="truncate text-xs text-subtle-foreground">
                          {DECK_TYPE_LABELS[deck.deckType] ?? deck.deckType} ·{" "}
                          {STAGE_LABELS[deck.stage] ?? deck.stage}
                        </p>
                      </div>
                      <DeckStatusBadge status={deck.status} />
                    </div>

                    <div className="flex items-end justify-between gap-2">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {deck._count.slides} slides
                        </span>
                        <span className="tabular-nums">
                          {deck._count.views} views
                        </span>
                      </div>
                      <PitchScore score={deck.pitchScore} />
                    </div>

                    <p className="mt-auto text-xs text-subtle-foreground">
                      Updated{" "}
                      {formatDistanceToNow(deck.updatedAt, { addSuffix: true })}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
