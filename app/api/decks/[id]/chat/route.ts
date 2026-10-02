import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireDeck,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { trackUsage } from "@/lib/analytics/usage";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  clearChatHistory,
  listChatMessages,
  recordAssistantMessage,
  recordUserMessage,
  type ChatMessage,
} from "@/lib/ai/chat-history";
import { toDeckContext } from "@/lib/ai/deck-context";
import {
  isVersionComparisonIntent,
  loadVersionComparison,
  streamDeckChatReply,
} from "@/lib/ai/deck-chat";
import {
  createPartialJsonFieldReader,
  STREAM_CONTENT_TYPE,
  type StreamEvent,
} from "@/lib/ai/stream";
import type { DeckChatReply } from "@/lib/schemas/content";

/**
 * Chat with Deck.
 *
 *   GET    → the deck's transcript
 *   POST   → { message } → an NDJSON stream of the reply
 *   DELETE → clear the transcript
 *
 * Isolation is the whole point of this route, so it is worth stating plainly:
 * `requireDeck(id, user.id)` runs on every single request, BEFORE any deck row
 * is read, BEFORE the version history is queried, and BEFORE the model is
 * called. The deck id in the URL is never trusted on its own — a deck owned by
 * someone else resolves to the same 404 as a deck that does not exist, so this
 * endpoint can never be used to discover or probe another founder's deck.
 *
 * The AI context is rebuilt from that freshly loaded row on every turn. Nothing
 * about the deck is cached between requests or shared between users.
 *
 * POST response frames (one JSON object per line):
 *   { type: "user",   message }              the persisted question
 *   { type: "status", status: "thinking" }   before the first token
 *   { type: "delta",  text }                 progressive answer text
 *   { type: "done",   reply, message }       the validated reply, persisted
 *   { type: "error",  message, reason }      user-safe failure, nothing saved
 */

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const askSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Type a question first.")
    .max(
      CHAT_MESSAGE_MAX_LENGTH,
      `Keep questions under ${CHAT_MESSAGE_MAX_LENGTH} characters.`,
    ),
});

/** Every frame this route can emit, documented as one union. */
type ChatFrame =
  | { type: "user"; message: ChatMessage }
  /** The assistant turn as it was actually persisted, for transcript sync. */
  | { type: "assistant"; message: ChatMessage }
  | StreamEvent<DeckChatReply>;

/** One NDJSON line. */
function encodeFrame(frame: ChatFrame): string {
  return `${JSON.stringify(frame)}\n`;
}

/** The deck's transcript, oldest first. */
export const GET = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    await requireDeck(id, user.id);

    return NextResponse.json({ messages: await listChatMessages(id) });
  },
);

/** Clear the transcript. The deck itself is untouched. */
export const DELETE = withErrorHandling<[Request, Ctx]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    await requireDeck(id, user.id);
    const removed = await clearChatHistory(id);

    return NextResponse.json({ status: "ok" as const, removed });
  },
);

export const POST = withErrorHandling<[Request, Ctx]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;

    // Ownership first. Nothing below this line reads an unowned row.
    const deck = await requireDeck(id, user.id);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = askSchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid question",
      );
    }

    const question = parsed.data.message;

    // Prior turns are captured BEFORE the new question is stored, so the
    // conversation window does not repeat the question that is already
    // appended separately as the thing to answer.
    const history = await listChatMessages(id);

    // The founder's question is stored before the model runs, so a failed or
    // abandoned answer still leaves an accurate transcript.
    const userMessage = await recordUserMessage(id, question);

    const context = toDeckContext(deck);

    // Only fetched for a genuine version question, and only from this deck's
    // own history.
    const versionComparison = isVersionComparisonIntent(question)
      ? await loadVersionComparison(id)
      : { available: false, section: "" };

    const encoder = new TextEncoder();
    const reader = createPartialJsonFieldReader("answer");

    const body$ = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (frame: ChatFrame) => {
          controller.enqueue(encoder.encode(encodeFrame(frame)));
        };

        send({ type: "user", message: userMessage });

        try {
          for await (const event of streamDeckChatReply({
            context,
            history,
            question,
            versionComparison,
            signal: request.signal,
          })) {
            if (event.type === "delta") {
              // Structured output arrives as JSON, so the raw delta is
              // forwarded as the partially-decoded answer instead. The stored
              // value still comes from the validated `done` frame.
              const partial = reader.push(event.text);

              if (partial) {
                send({ type: "delta", text: partial });
              }

              continue;
            }

            if (event.type === "done") {
              const message = await recordAssistantMessage(id, event.value.answer);

              send({ type: "done", value: event.value });
              send({ type: "assistant", message });

              trackUsage({
                type: "AI_GENERATION",
                userId: user.id,
                workspaceId: user.workspaceId,
                deckId: id,
                meta: {
                  operation: "deck_chat",
                  referenced_slides: event.value.referencedSlides.length,
                  data_needed: event.value.dataNeeded,
                },
              });

              continue;
            }

            send(event);
          }
        } catch (error) {
          // Anything that escapes the generator is a bug, not a provider
          // problem. Report it as a plain failure and persist nothing.
          console.error("[deck-chat] stream failed", error);
          send({
            type: "error",
            message: "Something went wrong while writing that reply. Please try again.",
            reason: "internal_error",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(body$, {
      headers: {
        "Content-Type": STREAM_CONTENT_TYPE,
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  },
);
