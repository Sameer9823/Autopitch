import { NextResponse } from "next/server";

import {
  HttpError,
  requireDeck,
  requireSlide,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { SlidePatchSchema } from "@/lib/schemas/slide";

/**
 * One slide.
 *
 *   GET    — a single slide, ownership re-verified through its deck.
 *   PATCH  — the autosave target. Validated with `SlidePatchSchema` and
 *            explicitly refuses `order` or `deckId`, so no client can move a
 *            slide, reassign it to another deck, or renumber a deck through
 *            the autosave path.
 *   DELETE — removes the slide and renumbers the rest in one transaction.
 */

type SlideParams = { params: Promise<{ id: string; slideId: string }> };

/** Fields `SlidePatchSchema` allows that map straight onto the Prisma row. */
const WRITABLE = [
  "title",
  "subtitle",
  "content",
  "layout",
  "blocks",
  "caption",
  "label",
  "imagePrompt",
  "speakerNotes",
  "notes",
] as const;

/**
 * The subset of `WRITABLE` that is actual deck content.
 *
 * Speaker notes are delivery scaffolding: marking a slide hand-edited because a
 * founder typed notes mid-presentation would permanently suppress the "you can
 * regenerate this" affordance for a slide whose content was never touched.
 */
const CONTENT_FIELDS: ReadonlySet<string> = new Set([
  "title",
  "subtitle",
  "content",
  "layout",
  "blocks",
  "caption",
  "label",
  "imagePrompt",
]);

/**
 * Never writable through the editor's autosave.
 *
 * `order` and `deckId` are the important ones: a slide must never be able to
 * move or be reassigned through the autosave path. The rest are server-owned
 * facts — a client may not declare a slide hand-edited, nor talk the image
 * pipeline into a state it did not reach.
 */
const FORBIDDEN_KEYS = [
  "order",
  "deckId",
  "userEdited",
  "imageStatus",
  "imageError",
] as const;

export const GET = withErrorHandling<[Request, SlideParams]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id, slideId } = await params;
    await requireDeck(id, user.id);
    const slide = await requireSlide(slideId, user.id);

    // A slide that exists but belongs to a different deck of the same user is
    // still a 404 for this route: the URL pair is the resource.
    if (slide.deckId !== id) {
      throw new HttpError(404, "Slide not found.");
    }

    return NextResponse.json({ slide });
  },
);

export const PATCH = withErrorHandling<[Request, SlideParams]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id, slideId } = await params;
    await requireDeck(id, user.id);
    const slide = await requireSlide(slideId, user.id);

    if (slide.deckId !== id) {
      throw new HttpError(404, "Slide not found.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(400, "Invalid request body");
    }

    const keys = Object.keys(body as Record<string, unknown>);
    for (const forbidden of FORBIDDEN_KEYS) {
      if (keys.includes(forbidden)) {
        throw new HttpError(
          400,
          `A slide patch cannot change "${forbidden}". Use the reorder or image endpoints instead.`,
        );
      }
    }

    const parsed = SlidePatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid slide patch",
      );
    }

    const data: Record<string, unknown> = {};

    let touchedContent = false;

    for (const field of WRITABLE) {
      if (parsed.data[field] !== undefined) {
        data[field] = parsed.data[field];
        if (CONTENT_FIELDS.has(field)) {
          touchedContent = true;
        }
      }
    }

    // An image URL is coherent only alongside its pipeline state, so the status
    // is derived rather than trusted from the request.
    if (parsed.data.imageUrl !== undefined) {
      data.imageUrl = parsed.data.imageUrl;
      data.imageStatus = parsed.data.imageUrl ? "READY" : "NONE";
      data.imageError = null;
      touchedContent = true;
    }

    if (touchedContent) {
      data.userEdited = true;
    }

    const updated = await prisma.slide.update({
      where: { id: slide.id },
      data,
    });

    return NextResponse.json({
      slide: {
        id: updated.id,
        order: updated.order,
        title: updated.title,
        subtitle: updated.subtitle,
        content: updated.content,
        layout: updated.layout,
        blocks: updated.blocks,
        caption: updated.caption,
        label: updated.label,
        imagePrompt: updated.imagePrompt,
        speakerNotes: updated.speakerNotes,
        notes: updated.notes,
        imageUrl: updated.imageUrl,
        imageStatus: updated.imageStatus,
        imageError: updated.imageError,
        userEdited: updated.userEdited,
      },
    });
  },
);

export const DELETE = withErrorHandling<[Request, SlideParams]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id, slideId } = await params;
    await requireDeck(id, user.id);
    const slide = await requireSlide(slideId, user.id);

    if (slide.deckId !== id) {
      throw new HttpError(404, "Slide not found.");
    }

    const remaining = await prisma.$transaction(async (tx) => {
      await tx.slide.delete({ where: { id: slide.id } });

      const rest = await tx.slide.findMany({
        where: { deckId: id },
        orderBy: { order: "asc" },
        select: { id: true },
      });

      for (let index = 0; index < rest.length; index++) {
        const target = rest[index];
        if (!target) {
          continue;
        }
        await tx.slide.update({
          where: { id: target.id },
          data: { order: index + 1 },
        });
      }

      return rest;
    });

    return NextResponse.json({
      ok: true,
      deletedId: slide.id,
      slideIds: remaining.map((slideRow) => slideRow.id),
    });
  },
);
