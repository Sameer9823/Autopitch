"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ChatAdd01Icon,
  SparklesIcon,
  TrashIcon,
} from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CHAT_MESSAGE_MAX_LENGTH, CHAT_SUGGESTIONS } from "@/lib/chat/shared";
import type { DeckChatReply } from "@/lib/schemas/content";

/**
 * A conversation with the deck.
 *
 * The assistant is grounded on this deck's own slides and, when the question is
 * genuinely about history, its real version diffs. It never sees anything else,
 * so a wrong answer here is a grounding failure the UI can point at rather than
 * a mystery.
 *
 * The response arrives as NDJSON — one JSON frame per line — so the reply can be
 * rendered as it is written. Frames are parsed off a buffered reader rather than
 * `response.json()`, which would block until the whole answer had landed.
 */

/** One turn in the transcript as the UI holds it. */
type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Present only on a completed assistant turn. */
  reply?: DeckChatReply;
  /** Set while the turn is streaming or has failed. */
  pending?: boolean;
  error?: string;
  /** Slide orders this reply is grounded in. */
  referencedSlides?: number[];
};

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function DeckChatPanel({
  deckId,
  initialMessages,
}: {
  deckId: string;
  initialMessages: StoredMessage[];
}) {
  const [turns, setTurns] = useState<Turn[]>(() =>
    initialMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Pin to the newest turn as the answer streams in, but only when the founder
  // is already near the bottom — yanking the view while they are reading an
  // earlier answer is worse than a scrollbar that lags.
  const pinnedRef = useRef(true);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !pinnedRef.current) return;

    node.scrollTop = node.scrollHeight;
  }, [turns]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const distanceFromBottom = () =>
      node.scrollHeight - node.scrollTop - node.clientHeight;

    function onScroll() {
      pinnedRef.current = distanceFromBottom() < 80;
    }

    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || streaming) return;

      setError(null);
      setInput("");
      pinnedRef.current = true;

      const userTurn: Turn = {
        id: `local-user-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      const assistantTurn: Turn = {
        id: `local-assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        pending: true,
      };

      setTurns((current) => [...current, userTurn, assistantTurn]);
      setStreaming(true);

      const patch = (change: Partial<Turn>) =>
        setTurns((current) =>
          current.map((turn) =>
            turn.id === assistantTurn.id ? { ...turn, ...change } : turn,
          ),
        );

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`/api/decks/${deckId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          patch({
            pending: false,
            error: await readError(
              response,
              "We couldn't reach the deck assistant. Please try again.",
            ),
          });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // `done` arrives before the persisted `assistant` frame, so the terminal
        // metadata is applied first and the stored message swaps in afterwards.
        let finished = false;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // NDJSON: frames are separated by newlines, and the last one may be
          // partial until the next chunk arrives.
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;

            let frame: unknown;
            try {
              frame = JSON.parse(line);
            } catch {
              continue;
            }

            if (!frame || typeof frame !== "object") continue;

            const typed = frame as { type?: unknown };

            switch (typed.type) {
              case "delta": {
                const text = (frame as { text?: unknown }).text;
                if (typeof text !== "string") break;

                // Append, never replace: the server sends cumulative text, but
                // re-reading the current turn here keeps this correct either way.
                setTurns((current) =>
                  current.map((turn) =>
                    turn.id === assistantTurn.id
                      ? { ...turn, content: turn.content + text }
                      : turn,
                  ),
                );
                break;
              }

              case "done": {
                const value_ = (frame as { value?: unknown }).value;
                if (!value_ || typeof value_ !== "object") break;

                const reply = value_ as DeckChatReply;
                finished = true;

                patch({
                  content: reply.answer,
                  reply,
                  referencedSlides: reply.referencedSlides,
                });
                break;
              }

              case "assistant": {
                const message = (frame as { message?: unknown }).message;
                if (
                  finished &&
                  message &&
                  typeof message === "object" &&
                  "id" in message
                ) {
                  const stored = message as StoredMessage;
                  // Replace the local placeholder with the real persisted row so
                  // the transcript matches what a reload will show.
                  setTurns((current) =>
                    current.map((turn) =>
                      turn.id === assistantTurn.id
                        ? { ...turn, id: stored.id, content: stored.content, pending: false }
                        : turn,
                    ),
                  );
                }
                break;
              }

              case "error": {
                const message = (frame as { message?: unknown }).message;
                patch({
                  pending: false,
                  error:
                    typeof message === "string"
                      ? message
                      : "Something went wrong while writing that reply.",
                });
                finished = true;
                break;
              }

              default:
                break;
            }
          }
        }

        // A stream that ended without a terminal frame — the connection dropped
        // mid-answer. Say so rather than leaving a spinner that never stops.
        setTurns((current) =>
          current.map((turn) =>
            turn.id === assistantTurn.id && turn.pending
              ? {
                  ...turn,
                  pending: false,
                  error:
                    turn.content.length > 0
                      ? "That answer was cut short. Ask again to finish it."
                      : "We lost the connection before that answer came back.",
                }
              : turn,
          ),
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          patch({ pending: false, error: "Cancelled." });
          return;
        }

        patch({
          pending: false,
          error: "We couldn't reach the deck assistant. Please try again.",
        });
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [deckId, streaming],
  );

  async function clear() {
    setError(null);

    try {
      const response = await fetch(`/api/decks/${deckId}/chat`, { method: "DELETE" });

      if (!response.ok) {
        setError(await readError(response, "Couldn't clear this conversation."));
        return;
      }

      setTurns([]);
    } catch {
      setError("We couldn't reach the server to clear this conversation.");
    }
  }

  const showSuggestions = turns.length === 0;

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col gap-4">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-lg border border-border bg-surface-1 p-4"
        role="log"
        aria-live="polite"
        aria-label="Conversation about this deck"
      >
        {showSuggestions ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="font-heading text-lg font-semibold">
                Ask about this deck
              </h2>
              <p className="text-sm text-muted-foreground">
                Answers are grounded on your slides and your version history. If
                the deck does not contain something, it will say so rather than
                guess.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {CHAT_SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  onClick={() => void ask(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {turns.map((turn) => (
              <li key={turn.id} className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">
                  {turn.role === "user" ? "You" : "Deck assistant"}
                </span>

                <div
                  className={
                    turn.role === "user"
                      ? "rounded-lg border border-border bg-surface-2 p-3 text-sm whitespace-pre-wrap"
                      : "rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm whitespace-pre-wrap"
                  }
                >
                  {turn.content.length > 0 ? (
                    turn.content
                  ) : turn.pending ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <HugeiconsIcon
                        icon={SparklesIcon}
                        className="size-4 animate-pulse"
                        aria-hidden
                      />
                      Reading your deck…
                    </span>
                  ) : null}
                </div>

                {turn.error ? (
                  <Alert variant="destructive">
                    <AlertTitle>That didn&apos;t work</AlertTitle>
                    <AlertDescription>{turn.error}</AlertDescription>
                  </Alert>
                ) : null}

                {turn.referencedSlides && turn.referencedSlides.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-subtle-foreground">
                      Grounded in
                    </span>
                    {turn.referencedSlides.map((order) => (
                      <Link
                        key={order}
                        href={`/decks/${deckId}/editor?slide=${order}`}
                        className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-primary"
                      >
                        Slide {order}
                      </Link>
                    ))}
                  </div>
                ) : null}

                {turn.reply?.dataNeeded ? (
                  <p className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
                    Your deck does not contain enough detail for a confident
                    answer to that. Add the missing slide and ask again.
                  </p>
                ) : null}

                {turn.reply && turn.reply.suggestedActions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {turn.reply.suggestedActions.map((action) => (
                      <Button
                        key={action}
                        variant="outline"
                        size="xs"
                        disabled={streaming}
                        onClick={() => void ask(action)}
                      >
                        {action}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Textarea
          value={input}
          rows={3}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          placeholder="Ask about any slide, or what an investor will push on…"
          aria-label="Your question"
          disabled={streaming}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline. Never send an empty box.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask(input);
            }
          }}
        />

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={turns.length === 0}
            onClick={() => void clear()}
          >
            <HugeiconsIcon icon={TrashIcon} aria-hidden />
            Clear conversation
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-subtle-foreground tabular-nums">
              {input.length} / {CHAT_MESSAGE_MAX_LENGTH}
            </span>

            {streaming ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => abortRef.current?.abort()}
              >
                Stop
              </Button>
            ) : null}

            <Button
              size="sm"
              disabled={streaming || input.trim().length === 0}
              onClick={() => void ask(input)}
            >
              <HugeiconsIcon icon={ChatAdd01Icon} aria-hidden />
              Ask
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (body && typeof body === "object" && "error" in body) {
    const value = (body as { error: unknown }).error;
    if (typeof value === "string" && value.length > 0) return value;
  }

  return fallback;
}
