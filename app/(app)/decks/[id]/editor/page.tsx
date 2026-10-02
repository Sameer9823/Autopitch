import { notFound } from "next/navigation";

import { DeckEditor } from "@/components/editor/deck-editor";
import { requireDeck, requireUser } from "@/lib/api/guards";
import { toRenderModel } from "@/lib/deck/to-render-model";
import { prisma } from "@/lib/db";

/**
 * Deck editor.
 *
 * A server component: it verifies the session, proves the deck belongs to the
 * caller (404 for anything else, so a deck id is never confirmed by its
 * response), loads the user's Brand Kit, converts everything to the render model
 * and hands a plain serialisable payload to the client editor.
 *
 * A deck that is still being generated is NOT blocked. `requireDeck` returns
 * whatever slides exist right now, so a finished slide is immediately editable
 * in the navigator while later slides are still being written in the background.
 */

export const metadata = { title: "Deck Editor" };

export const dynamic = "force-dynamic";

export default async function DeckEditorPage({
  params,
}: PageProps<"/decks/[id]/editor">) {
  const user = await requireUser();
  const { id } = await params;

  const deck = await requireDeck(id, user.id).catch(() => null);

  if (!deck) {
    notFound();
  }

  // The user's default kit first, then any kit in their workspace, so a deck
  // always renders with the brand a founder has actually set up.
  const brandKit = await prisma.brandKit.findFirst({
    where: {
      OR: [{ userId: user.id }, { workspaceId: user.workspaceId }],
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  // One conversion for the whole editor: the brand kit becomes the slide theme
  // through the same helper the share viewer, presentation mode and both
  // exporters use, so the editor can never render a different deck.
  const renderModel = toRenderModel(deck, brandKit);

  // The editor also needs fields the render model does not carry — the visual
  // prompt, the private notes and the hand-edited flag — so the slide rows are
  // serialised directly rather than round-tripped through the renderer.
  const initialSlides = deck.slides.map((slide) => ({
    id: slide.id,
    order: slide.order,
    title: slide.title,
    subtitle: slide.subtitle,
    content: slide.content,
    layout: slide.layout,
    blocks: slide.blocks,
    caption: slide.caption,
    label: slide.label,
    imagePrompt: slide.imagePrompt,
    speakerNotes: slide.speakerNotes,
    notes: slide.notes,
    imageUrl: slide.imageUrl,
    imageStatus: slide.imageStatus,
    imageError: slide.imageError,
    userEdited: slide.userEdited,
  }));

  return (
    <div className="flex h-full min-h-[34rem] flex-col">
      <DeckEditor
        deckId={deck.id}
        deckTitle={deck.title ?? "Untitled deck"}
        initialStatus={deck.status}
        initialSlides={initialSlides}
        theme={renderModel.theme ?? null}
        brandKitName={brandKit?.name ?? null}
      />
    </div>
  );
}
