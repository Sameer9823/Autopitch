import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

import { HugeiconsIcon } from "@hugeicons/react";

import { PitchScore, StatePanel } from "@/components/dashboard/state-panels";
import { DeckCardActions } from "@/components/decks/deck-card-actions";
import { DeckStatusBadge } from "@/components/deck-status-badge";
import { PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";

export const metadata = { title: "My Decks" };

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

export default async function DecksPage() {
  const user = await requireUser();

  const decks = await prisma.deck.findMany({
    where: { userId: user.id, workspaceId: user.workspaceId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { slides: true, views: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              My Decks
            </h1>
            <p className="text-sm text-muted-foreground">
              Every deck in your workspace, most recently updated first.
            </p>
          </div>
          <Button render={<Link href="/decks/new" />}>
            <HugeiconsIcon icon={PlusIcon} aria-hidden />
            New Deck
          </Button>
        </div>

        <form className="max-w-sm" role="search">
          <label htmlFor="deck-filter" className="sr-only">
            Filter decks
          </label>
          <Input
            id="deck-filter"
            type="search"
            placeholder="Filter by name or startup…"
          />
        </form>

        {decks.length === 0 ? (
          <StatePanel
            kind="empty"
            title="No decks yet"
            description="Create your first investor deck to get started."
            action={
              <Button render={<Link href="/decks/new" />}>Create a deck</Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {decks.map((deck) => (
              <li
                key={deck.id}
                className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/decks/${deck.id}/editor`}
                      className="truncate font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {deck.startupName ?? deck.title ?? "Untitled deck"}
                    </Link>
                    <DeckStatusBadge status={deck.status} />
                  </div>
                  <p className="mt-1 text-xs text-subtle-foreground">
                    {DECK_TYPE_LABELS[deck.deckType] ?? deck.deckType} ·{" "}
                    {STAGE_LABELS[deck.stage] ?? deck.stage} ·{" "}
                    {deck._count.slides} slides ·{" "}
                    {deck._count.views} investor views
                  </p>
                  <p className="mt-1 text-xs text-subtle-foreground">
                    Updated{" "}
                    {formatDistanceToNow(deck.updatedAt, { addSuffix: true })}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <PitchScore score={deck.pitchScore} />
                  <DeckCardActions
                    deckId={deck.id}
                    deckTitle={deck.title}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
