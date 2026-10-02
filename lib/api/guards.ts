import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * Auth + ownership layer.
 *
 * Every server-side read of user data goes through this file. Client-supplied
 * ids are NEVER trusted: they are always re-checked against the authenticated
 * user and their workspace before any data is returned or mutated.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "error") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export const unauthorized = () =>
  new HttpError(401, "You need to sign in to continue.", "unauthorized");

export const forbidden = () =>
  new HttpError(403, "You do not have access to this resource.", "forbidden");

export const notFound = (what = "Resource") =>
  new HttpError(404, `${what} not found.`, "not_found");

/** The authenticated user + their primary workspace, or an error. */
export async function requireUser() {
  const user = await getSessionUser();

  if (!user) {
    throw unauthorized();
  }

  const membership = user.memberships[0];

  if (!membership) {
    throw new HttpError(
      403,
      "Your account has no workspace. Contact support.",
      "no_workspace",
    );
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
}

export type AuthUser = Awaited<ReturnType<typeof requireUser>>;

/**
 * Load a deck and prove the current user owns it.
 *
 * Returns 404 (not 403) for decks the user cannot access, so the API never
 * leaks the existence of another user's deck id.
 */
export async function requireDeck(deckId: string, userId: string) {
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
    include: {
      slides: { orderBy: { order: "asc" } },
    },
  });

  if (!deck) {
    throw notFound("Deck");
  }

  return deck;
}

/** Same as requireDeck but without eagerly loading slides. */
export async function requireDeckRecord(deckId: string, userId: string) {
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
  });

  if (!deck) {
    throw notFound("Deck");
  }

  return deck;
}

/** Load a slide and prove the current user owns its parent deck. */
export async function requireSlide(slideId: string, userId: string) {
  const slide = await prisma.slide.findFirst({
    where: { id: slideId, deck: { userId } },
    include: { deck: true },
  });

  if (!slide) {
    throw notFound("Slide");
  }

  return slide;
}

/**
 * Resolve an enabled share link to its deck, or throw.
 * Used by the public (unauthenticated) viewer — only explicitly shared,
 * non-revoked, non-expired links get through.
 */
export async function resolveShareToken(token: string) {
  const share = await prisma.deckShare.findUnique({
    where: { token },
    include: {
      deck: { include: { slides: { orderBy: { order: "asc" } } } },
    },
  });

  if (!share || share.revokedAt || !share.deck) {
    throw notFound("Share link");
  }

  if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) {
    throw notFound("Share link");
  }

  return share;
}

/**
 * Wrap a route handler so thrown HttpErrors become clean JSON responses.
 *
 * Call sites pass their route-args tuple explicitly, e.g.
 *   withErrorHandling<[{ params: Promise<{ id: string }> }]>(async (_req, { params }) => ...)
 * That keeps each handler's parameter types intact while still giving every
 * route one error boundary. Unknown failures become a generic message, so no
 * stack trace or driver detail ever reaches the client.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      }

      console.error("[api] unhandled error", error);
      return NextResponse.json(
        {
          error: "Something went wrong on our side. Please try again.",
          code: "internal_error",
        },
        { status: 500 },
      );
    }
  };
}
