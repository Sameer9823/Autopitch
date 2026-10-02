import { FundraisingKit } from "@/components/fundraising/fundraising-kit";
import type { FundraisingAssetView } from "@/components/fundraising/fundraising-kit";
import { requireDeckRecord, requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";

export const metadata = { title: "Fundraising Kit" };
export const dynamic = "force-dynamic";

/**
 * The fundraising kit for one deck.
 *
 * Ownership is proved with `requireDeckRecord` before any asset row is read, and
 * assets are additionally scoped to the user's workspace — so an asset id from
 * another workspace is not reachable even if a deck id were guessed.
 */
export default async function FundraisingPage({
  params,
}: PageProps<"/decks/[id]/fundraising">) {
  const user = await requireUser();
  const { id } = await params;

  const deck = await requireDeckRecord(id, user.id);

  const assets = await prisma.fundraisingAsset.findMany({
    where: { deckId: deck.id, workspaceId: user.workspaceId },
    orderBy: { type: "asc" },
  });

  const serialized: FundraisingAssetView[] = assets.map((asset) => ({
    id: asset.id,
    deckId: asset.deckId,
    type: asset.type,
    typeLabel: asset.type,
    title: asset.title,
    content: asset.content,
    hasGaps: asset.hasGaps,
    source: asset.deckId ? ("deck" as const) : ("workspace" as const),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 lg:px-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Fundraising kit
        </h1>
        <p className="text-sm text-muted-foreground">
          {deck.startupName ?? deck.title ?? "This deck"} · every document here
          is written from your deck, so nothing gets retyped
        </p>
      </header>

      <div className="mt-6">
        <FundraisingKit deckId={deck.id} initialAssets={serialized} />
      </div>
    </div>
  );
}
