/**
 * Shared validation for the `?next=` redirect target used by the auth pages.
 *
 * The proxy used to echo the current URL straight back into `next`, including
 * for requests to `/login` itself. That produced a self-nesting URL
 * (`/login?next=%2Flogin%3Fnext%3D…`) that grew on every hop until the server
 * rejected the oversized request headers with HTTP 431. It was also an open
 * redirect, since an absolute URL in `next` would be followed after sign-in.
 */

const AUTH_PATHS = new Set(["/login", "/signup"]);

/** Keeps a crafted `next` from ever exceeding reasonable header size. */
const MAX_NEXT_LENGTH = 2048;

const BASE = "http://internal";

/**
 * Returns a same-origin, non-auth path safe to redirect to, or "/" otherwise.
 */
export function sanitizeNext(raw: string | null | undefined): string {
  if (!raw || raw.length > MAX_NEXT_LENGTH) return "/";

  // Reject protocol-relative (`//evil.com`) and backslash tricks (`/\evil.com`).
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }

  let parsed: URL;
  try {
    parsed = new URL(raw, BASE);
  } catch {
    return "/";
  }
  if (parsed.origin !== BASE) return "/";

  const { pathname } = parsed;

  // Never bounce back to an auth page: that would restart the redirect cycle.
  if (!pathname || AUTH_PATHS.has(pathname)) return "/";

  return `${pathname}${parsed.search}${parsed.hash}`;
}