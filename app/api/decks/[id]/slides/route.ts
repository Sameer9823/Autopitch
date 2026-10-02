import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireDeck,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { SlideLayoutSchema } from "@/lib/schemas/slide";

/**
 * Deck slides collection.
 *
 *   GET  — the slide list, polled by the editor while a deck is still
 *          generating so a finished slide becomes usable immediately.
 *   POST — add a slide after the current one and renumber in one transaction.
 */

type DeckParams = { params: Promise<{ id: string }> };

const createSlideSchema = z.object({
  /** Insert after this slide. Omit to append after the last slide. */
  afterSlideId: z.string().min(1).optional(),
  layout: SlideLayoutSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

/** Serialize a slide for the editor, including everything the inspector edits. */
function toSlidePayload(slide: {
  id: string;
  order: number;
  title: string;
  subtitle: string | null;
  content: string;
  layout: string;
  blocks: unknown;
  caption: string | null;
  label: string | null;
  imagePrompt: string;
  speakerNotes: string | null;
  notes: string | null;
  imageUrl: string | null;
  imageStatus: string;
  imageError: string | null;
  userEdited: boolean;
}) {
  return {
    id: slide.id,
    order: slide.order,
    title: slide.title,
    subtitle: slide.subtitle,
    content: slide.content,
    layout: slide.layout,
    blocks: slide.blocks,
    caption: slide.caption,
    label: slide.label,
    imagePrompt: slide.imagePrompt,
    speakerNotes: slide.speakerNotes,
    notes: slide.notes,
    imageUrl: slide.imageUrl,
    imageStatus: slide.imageStatus,
    imageError: slide.imageError,
    userEdited: slide.userEdited,
  };
}

export const GET = withErrorHandling<[Request, DeckParams]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    // Ownership is re-verified here; another user's deck is a 404, never a 403.
    const deck = await requireDeck(id, user.id);

    return NextResponse.json({
      status: deck.status,
      completion: deck.completion,
      errorMessage: deck.errorMessage,
      title: deck.title,
      slides: deck.slides.map(toSlidePayload),
    });
  },
);

export const POST = withErrorHandling<[Request, DeckParams]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    await requireDeck(id, user.id);

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = createSlideSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
    }

    const existing = await prisma.slide.findMany({
      where: { deckId: id },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });

    const anchor = parsed.data.afterSlideId
      ? existing.find((slide) => slide.id === parsed.data.afterSlideId)
      : undefined;

    // An unknown anchor is not trusted to be another deck's slide; fall back to
    // appending so a stale client can never create a gap.
    const anchorOrder = anchor
      ? anchor.order
      : existing.length > 0
        ? existing[existing.length - 1].order
        : 0;
    const insertAt = anchorOrder + 1;

    const created = await prisma.$transaction(async (tx) => {
      // Shift everything from the insertion point forward, then insert.
      const shifted = await tx.slide.findMany({
        where: { deckId: id, order: { gte: insertAt } },
        orderBy: { order: "asc" },
        select: { id: true },
      });

      for (const slide of shifted) {
        await tx.slide.update({
          where: { id: slide.id },
          data: { order: { increment: 1 } },
        });
      }

      return tx.slide.create({
        data: {
          deckId: id,
          order: insertAt,
          title: parsed.data.title ?? "New slide",
          content: "",
          imagePrompt: "",
          layout: parsed.data.layout ?? "CONTENT",
          blocks: [] as object,
          imageStatus: "NONE",
          generationSource: "EDITOR",
        },
      });
    });

    const slides = await prisma.slide.findMany({
      where: { deckId: id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(
      { slide: toSlidePayload(created), slides: slides.map(toSlidePayload) },
      { status: 201 },
    );
  },
);
