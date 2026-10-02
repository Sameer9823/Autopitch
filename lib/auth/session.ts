import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "raisevia_session";
const SESSION_TTL_DAYS = 30;

/** Sessions are stored hashed; the raw token only ever lives in the cookie. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function expiryDate(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Create a session row and return the opaque token to put in the cookie. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: expiryDate(),
    },
  });

  return token;
}

/** Resolve the signed-in user from the request cookie, or null. */
export async function getSessionUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          memberships: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    // Best-effort cleanup; a failure here must not block the request.
    await prisma.session
      .delete({ where: { id: session.id } })
      .catch(() => undefined);
    return null;
  }

  return session.user;
}

/** Attach the session cookie to a response being written. */
export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiryDate(),
  });
}

/** Remove the session cookie from the browser. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Delete the current session row, if any. */
export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => undefined);
  }

  await clearSessionCookie();
}
