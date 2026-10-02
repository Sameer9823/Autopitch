import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  resolveShareToken,
  withErrorHandling,
} from "@/lib/api/guards";
import { hashVisitor } from "@/lib/analytics/visitor";
import { prisma } from "@/lib/db";
import { trackUsage } from "@/lib/analytics/usage";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Tracking endpoint for the public share viewer.
 *
 * UNAUTHENTICATED — anyone with the link can POST here. Privacy-conscious:
 *   - The client sends only a random per-session client id (never an email,
 *     name, IP, or user agent).
 *   - The server hashes that client id with a daily-rotating salt into
 *     `DeckView.visitorHash`. The hash is stored, the raw client id is not.
 *   - We never read or forward `x-forwarded-for`, `user-agent`, or any other
 *     request header that could identify a person or device.
 *
 * `Cache-Control: no-store` is set so no CDN or proxy ever caches a tracking
 * request and replays it as a view.
 */
export const POST = withErrorHandling<[Request, Ctx]>(
  async (request, { params }) => {
    const { token } = await params;
    const share = await resolveShareToken(token);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const trackSchema = z.object({
      clientId: z.string().min(1).max(128),
      events: z
        .array(
          z.object({
            type: z.enum(["view-open", "slide", "final"]),
            slideOrder: z.number().int().optional(),
            dwellMs: z.number().int().min(0).optional(),
            durationMs: z.number().int().min(0).optional(),
            maxSlideOrder: z.number().int().optional(),
            completed: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(50),
    });

    const parsed = trackSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid request",
      );
    }

    const visitorHash = hashVisitor(parsed.data.clientId);
    if (!visitorHash) {
      throw new HttpError(400, "Missing visitor id");
    }

    const now = new Date();
    const slideEvents = parsed.data.events.filter(
      (event) => event.type === "slide",
    );
    const finalEvent = parsed.data.events.find(
      (event) => event.type === "final",
    );

    // Resolve slide ids by order up front. Events whose order has no matching
    // slide on the deck are dropped — we never write a row with a dangling FK.
    const orders = [
      ...new Set(slideEvents.map((event) => event.slideOrder ?? 0)),
    ];
    const slides =
      orders.length > 0
        ? await prisma.slide.findMany({
            where: { deckId: share.deckId, order: { in: orders } },
            select: { id: true, order: true },
          })
        : [];
    const byOrder = new Map(slides.map((slide) => [slide.order, slide.id]));

    const slideViewCreates =
      slideEvents.length > 0
        ? slideEvents
            .map((event) => {
              const slideId = byOrder.get(event.slideOrder ?? 0);
              if (!slideId) return null;
              return {
                deckId: share.deckId,
                slideId,
                order: event.slideOrder ?? 0,
                dwellMs: event.dwellMs ?? 0,
                viewedAt: now,
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
        : [];

    const view = await prisma.deckView.create({
      data: {
        deckId: share.deckId,
        shareId: share.id,
        visitorHash,
        viewedAt: now,
        durationMs: finalEvent?.durationMs ?? 0,
        maxSlideOrder:
          finalEvent?.maxSlideOrder ??
          (Math.max(
            ...slideEvents.map((event) => event.slideOrder ?? 0),
            0,
          ) || null),
        completed: finalEvent?.completed ?? false,
        slideViews:
          slideViewCreates.length > 0
            ? { create: slideViewCreates }
            : undefined,
      },
    });

    // Bump the share's view counter.
    await prisma.deckShare.update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 } },
    });

    trackUsage({
      type: "SHARE_VIEW",
      deckId: share.deckId,
      quantity: 1,
      meta: {
        permission: share.permission,
        completed: String(finalEvent?.completed ?? false),
      },
    });

    const response = NextResponse.json({ ok: true, viewId: view.id });
    response.headers.set("Cache-Control", "no-store");
    return response;
  },
);