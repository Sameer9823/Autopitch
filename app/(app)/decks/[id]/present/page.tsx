import { notFound } from "next/navigation";

import { PresentationMode } from "@/components/present/presentation-mode";
import { requireDeck, requireUser } from "@/lib/api/guards";
import { toRenderModel } from "@/lib/deck/to-render-model";
import { prisma } from "@/lib/db";

/**
 * Presentation mode.
 *
 * A server component with the same guarantees as the editor page: the session is
 * verified here, and `requireDeck` re-proves ownership (404, never 403) so a
 * deck id is never confirmed by its response. The user's Brand Kit is resolved
 * through the same helper the editor and both exporters use, so a deck cannot
 * look one way in the editor and another way in the room.
 *
 * Everything handed to the client is the plain, serialisable render model — no
 * Prisma types, no Date objects, no functions.
 */

export const metadata = { title: "Present" };

export const dynamic = "force-dynamic";

export default async function PresentDeckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const deck = await requireDeck(id, user.id).catch(() => null);

  if (!deck) {
    notFound();
  }

  const brandKit = await prisma.brandKit.findFirst({
    where: {
      OR: [{ userId: user.id }, { workspaceId: user.workspaceId }],
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const model = toRenderModel(deck, brandKit);

  return (
    <PresentationMode
      deckId={deck.id}
      deckTitle={deck.title ?? deck.startupName ?? "Untitled deck"}
      slides={model.slides}
      theme={model.theme ?? null}
    />
  );
}