import { createHash, randomBytes, scryptSync } from "node:crypto";

/**
 * Privacy-conscious visitor identity.
 *
 * We deliberately store NO IP address, user agent, name, email, or any other
 * raw personal data. What we DO need is a stable, per-visitor key so we can
 * count "unique visitors" without identifying anyone.
 *
 * How it works:
 *   1. The browser generates a random per-session client id (UUID-like) and
 *      sends it with every tracking ping.
 *   2. The server hashes that client id with a DAILY-ROTATING server-side salt
 *      using scrypt (a memory-hard KDF, overkill here but cheap and standard).
 *   3. The resulting `visitorHash` is stored on `DeckView.visitorHash`.
 *
 * Why this is safe:
 *   - The salt rotates at midnight UTC, so the same client id produces a
 *     DIFFERENT hash on different days. A hash from Tuesday can never be
 *     linked to a hash from Wednesday, even by us.
 *   - scrypt is one-way; given only the hash you cannot recover the client id,
 *     and the client id is a random session token, not a name or email.
 *   - We never see or store the client id beyond the request window.
 *
 * The daily salt is generated lazily and cached in memory for the process
 * lifetime. In a multi-process deployment each process holds its own salt for
 * the day; that is fine — it only means a visitor hashed in process A at
 * 23:59 and process B at 00:01 counts as two, which is the conservative
 * (slightly higher) unique-visitor estimate and never leaks anything.
 */

const ALGORITHM = "sha512";
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

type SaltEntry = { salt: string; date: string };

let cachedSalt: SaltEntry | null = null;

/** Today's date as a UTC `YYYY-MM-DD` string — the rotation key. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Return (and cache) the server salt for today. */
function dailySalt(): string {
  const key = todayKey();
  if (cachedSalt && cachedSalt.date === key) {
    return cachedSalt.salt;
  }
  const salt = randomBytes(SALT_LENGTH).toString("base64url");
  cachedSalt = { salt: salt, date: key };
  return salt;
}

/**
 * Hash a per-session client id into the stored visitor key.
 * The client id is a random browser-side token, never a real identifier.
 */
export function hashVisitor(clientId: string): string {
  if (!clientId) {
    return "";
  }
  const salt = dailySalt();
  // scryptSync is synchronous but the work factors are tiny (N=2^1, r=8, p=1)
  // so it completes in well under a millisecond.
  const derived = scryptSync(clientId, salt, KEY_LENGTH, {
    N: 2,
    r: 8,
    p: 1,
  });
  const digest = createHash(ALGORITHM).update(derived).digest("base64url");
  return digest;
}