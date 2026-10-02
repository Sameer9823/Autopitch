import { NextResponse, type NextRequest } from "next/server";

import { sanitizeNext } from "@/lib/auth/next-redirect";
import { SESSION_COOKIE } from "@/lib/auth/session";

const AUTH_PATHS = new Set(["/login", "/signup"]);

/**
 * Optimistic redirect layer only.
 *
 * Next 16 renamed `middleware` to `proxy` and this file runs on the Node
 * runtime. It performs NO database access by design — it only checks for the
 * presence of a session cookie to avoid flashing protected UI. Real
 * authorization always happens in the data access layer
 * (lib/api/guards.ts) and inside every Server Function.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  const isAuthPage = AUTH_PATHS.has(pathname);

  if (isAuthPage) {
    // Signed in users skip the auth pages; signed out users must be allowed to
    // render them. Never redirect an auth page to itself.
    if (hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", sanitizeNext(`${pathname}${search}`));
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Public: login, signup, the share viewer, and the Inngest endpoint.
  matcher: [
    "/((?!api|_next/static|_next/image|share|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
