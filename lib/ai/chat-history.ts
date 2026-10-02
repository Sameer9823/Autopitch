import { z } from "zod";

import { prisma } from "@/lib/db";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/chat/shared";

/**
 * Deck chat persistence.
 *
 * Every function here is scoped to a single `deckId` that the caller has
 * ALREADY proven it owns (via `requireDeck`). Nothing in this module accepts a
 * user id, because the row it writes to is only ever reachable through a deck
 * the request was authorized against. That is deliberate: it means there is no
 * code path in which a chat message could be read from or written to another
 * founder's transcript.
 *
 * Roles are constrained to `user | assistant` at the boundary, matching the
 * `DeckChatMessage.role` column.
 */

export const ChatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

/** A stored chat turn, as the client receives it. */
export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

/**
 * The composer limit, applied before anything is written.
 *
 * Re-exported from `lib/chat/shared` so a client component can import it
 * without pulling this Prisma-backed module into the browser bundle.
 */
export { CHAT_MESSAGE_MAX_LENGTH };

/** How many prior turns are replayed into the model prompt. */
const PROMPT_TURNS = 12;

/** Hard cap on how many turns are returned to the client in one page. */
const HISTORY_LIMIT = 200;

type MessageRow = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
};

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: ChatRoleSchema.catch("user").parse(row.role),
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Full transcript for a deck, oldest first. */
export async function listChatMessages(
  deckId: string,
  limit = HISTORY_LIMIT,
): Promise<ChatMessage[]> {
  const rows = await prisma.deckChatMessage.findMany({
    where: { deckId },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return rows.map(toMessage);
}

async function appendMessage(
  deckId: string,
  role: ChatRole,
  content: string,
): Promise<ChatMessage> {
  const row = await prisma.deckChatMessage.create({
    data: { deckId, role, content },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return toMessage(row);
}

/** Persist the founder's question. The question is stored before the AI runs. */
export function recordUserMessage(deckId: string, content: string): Promise<ChatMessage> {
  return appendMessage(deckId, "user", content);
}

/** Persist a validated assistant reply. */
export function recordAssistantMessage(
  deckId: string,
  content: string,
): Promise<ChatMessage> {
  return appendMessage(deckId, "assistant", content);
}

/** Remove a deck's transcript. The deck itself is untouched. */
export async function clearChatHistory(deckId: string): Promise<number> {
  const result = await prisma.deckChatMessage.deleteMany({ where: { deckId } });
  return result.count;
}

/**
 * Render the most recent turns as prompt context.
 *
 * Bounded twice over: by turn count and by per-message length, so a long
 * transcript can never crowd the deck out of the model's context.
 */
export function formatChatForPrompt(messages: ChatMessage[]): string {
  const recent = messages.slice(-PROMPT_TURNS);

  if (recent.length === 0) {
    return "";
  }

  return recent
    .map((message) => {
      const speaker = message.role === "user" ? "FOUNDER" : "ANALYST";
      const content =
        message.content.length > 1200
          ? `${message.content.slice(0, 1200)}…`
          : message.content;

      return `${speaker}: ${content}`;
    })
    .join("\n\n");
}
