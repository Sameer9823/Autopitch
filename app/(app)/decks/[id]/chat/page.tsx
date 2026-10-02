import { DeckChatPanel } from "@/components/chat/deck-chat-panel";
import { listChatMessages } from "@/lib/ai/chat-history";
import { requireDeckRecord, requireUser } from "@/lib/api/guards";

export const metadata = { title: "Chat with Deck" };
export const dynamic = "force-dynamic";

/**
 * Conversation grounded on one deck.
 *
 * The transcript is read through `listChatMessages`, which is only ever called
 * with a deck id this request has already proven ownership of — so there is no
 * path by which one founder's transcript can be rendered for another.
 */
export default async function DeckChatPage({
  params,
}: PageProps<"/decks/[id]/chat">) {
  const user = await requireUser();
  const { id } = await params;

  const deck = await requireDeckRecord(id, user.id);

  const messages = await listChatMessages(deck.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-8 lg:px-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Chat with your deck
        </h1>
        <p className="text-sm text-muted-foreground">
          {deck.startupName ?? deck.title ?? "This deck"} · grounded on your
          slides and version history
        </p>
      </header>

      <div className="mt-6 flex flex-1">
        <DeckChatPanel
          deckId={deck.id}
          initialMessages={messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
          }))}
        />
      </div>
    </div>
  );
}
