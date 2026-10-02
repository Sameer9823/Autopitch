import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/**
 * Hash a password with scrypt. Uses only node:crypto, so no extra dependency.
 * Format: scrypt$<salt-hex>$<hash-hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** Verify a password against a stored hash. Never throws on malformed input. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");

  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, saltHex, hashHex] = parts;

  try {
    const expected = Buffer.from(hashHex, "hex");
    const derived = await scrypt(
      password.normalize("NFKC"),
      Buffer.from(saltHex, "hex"),
      expected.length,
    );
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
