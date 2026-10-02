import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireDeck,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";

/**
 * Reorder a deck's slides.
 *
 * The client sends the complete new order as an array of slide ids. The server
 * does not trust it: the id set must exactly match the deck's slides, and the
 * renumbering happens in one transaction so a deck is never left with two
 * slides claiming the same position.
 */

type DeckParams = { params: Promise<{ id: string }> };

const reorderSchema = z.object({
  slideIds: z.array(z.string().min(1)).min(1).max(100),
});

export const POST = withErrorHandling<[Request, DeckParams]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    await requireDeck(id, user.id);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid order");
    }

    const incoming = parsed.data.slideIds;
    const unique = new Set(incoming);

    if (unique.size !== incoming.length) {
      throw new HttpError(400, "The new order lists a slide more than once.");
    }

    const existing = await prisma.slide.findMany({
      where: { deckId: id },
      orderBy: { order: "asc" },
      select: { id: true },
    });

    if (existing.length !== incoming.length || existing.some((slide) => !unique.has(slide.id))) {
      throw new HttpError(400, "The new order does not match this deck's slides.");
    }

    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < incoming.length; index++) {
        const slideId = incoming[index];
        if (!slideId) {
          continue;
        }
        await tx.slide.update({
          where: { id: slideId },
          data: { order: index + 1 },
        });
      }
    });

    const slides = await prisma.slide.findMany({
      where: { deckId: id },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });

    return NextResponse.json({
      ok: true,
      slides: slides.map((slide) => ({ id: slide.id, order: slide.order })),
    });
  },
);
