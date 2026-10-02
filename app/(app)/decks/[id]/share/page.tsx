import { StatePanel } from "@/components/dashboard/state-panels";
import { ShareManager } from "@/components/share/share-manager";
import { requireDeckRecord, requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import type { ShareView } from "@/app/actions/shares";

export const metadata = { title: "Share" };
export const dynamic = "force-dynamic";

export default async function SharePage({ params }: PageProps<"/decks/[id]/share">) {
  const user = await requireUser();
  const { id } = await params;

  // Ownership enforced before any share rows are read.
  const deck = await requireDeckRecord(id, user.id);

  const shares = await prisma.deckShare.findMany({
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
  });

  const serialized: ShareView[] = shares.map((share) => ({
    id: share.id,
    token: share.token,
    permission: share.permission,
    expiresAt: share.expiresAt?.toISOString() ?? null,
    revokedAt: share.revokedAt?.toISOString() ?? null,
    viewCount: share.viewCount,
    createdAt: share.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-6">
      <div className="flex flex-col gap-6">
        <header className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Share with investors
          </h1>
          <p className="text-sm text-muted-foreground">
            {deck.startupName ?? deck.title ?? "This deck"} ·{" "}
            {serialized.reduce((sum, share) => sum + share.viewCount, 0)} total
            views
          </p>
        </header>

        {serialized.length === 0 ? (
          <StatePanel
            kind="empty"
            title="No share links yet"
            description="Create a link to send this deck to investors. No account required for them."
          />
        ) : (
          <ShareManager deckId={deck.id} initialShares={serialized} />
        )}
      </div>
    </div>
  );
}
