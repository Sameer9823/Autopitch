import { randomBytes } from "node:crypto";

/**
 * Share-link token generation.
 *
 * Tokens are 32 bytes of URL-safe base64 — 256 bits of entropy, which is
 * unguessable by brute force and collision-free in practice. They are stored
 * verbatim on `DeckShare.token` (unique) and never reused across links.
 */

const TOKEN_BYTES = 32;

/** Generate a fresh, unguessable share token. */
export function generateShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}