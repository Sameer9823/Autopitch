import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { VersionHistoryClient } from "@/components/versions/version-history-client";

export const metadata = { title: "Version History" };
export const dynamic = "force-dynamic";

export default async function VersionsPage({
  params,
}: PageProps<"/decks/[id]/versions">) {
  const user = await requireUser();
  const { id } = await params;

  const deck = await prisma.deck.findFirst({
    where: { id, userId: user.id },
    select: { id: true, title: true, startupName: true },
  });

  if (!deck) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-6">
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {deck.startupName ?? "Untitled deck"}
          </p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Version History
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every saved state of this deck, oldest first. Restoring never
            deletes history — it appends a new version.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          }
        >
          <VersionHistoryClient deckId={deck.id} />
        </Suspense>
      </div>
    </div>
  );
}