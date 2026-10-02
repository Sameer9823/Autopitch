/**
 * Client-safe deck chat constants.
 *
 * These two values are needed by the browser as well as the server, but they
 * used to live in modules that import Prisma and the OpenAI SDK. A client
 * component importing from those drags `pg` and `node:crypto` into the browser
 * bundle and the production build fails on `dns`, `fs` and `tls`.
 *
 * Keeping them here — a leaf module with no imports at all — is what makes
 * `components/chat/deck-chat-panel.tsx` bundleable. Server modules re-export
 * them so existing call sites keep working.
 */

/** The composer limit, applied before anything is written. */
export const CHAT_MESSAGE_MAX_LENGTH = 2000;

/** Clickable starter prompts shown in the empty state. */
export const CHAT_SUGGESTIONS = [
  "What is weak about my market slide?",
  "Rewrite my business model slide.",
  "What questions will investors ask?",
  "What information is missing?",
  "Summarize my deck.",
  "Compare this version with the previous version.",
  "Which slides need attention?",
] as const;

export type ChatSuggestion = (typeof CHAT_SUGGESTIONS)[number];
