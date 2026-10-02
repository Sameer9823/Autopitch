"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { HttpError, requireDeck, requireSlide, requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";

/**
 * Editor Server Functions.
 *
 * Structural slide operations that do not need an HTTP round trip. Every
 * function re-verifies the session AND re-checks ownership, so a client-supplied
 * deck or slide id can never reach another founder's deck. An id the caller does
 * not own resolves to the same 404 as one that does not exist.
 *
 * Add, delete and reorder live on the slides API routes (they need the updated
 * ordering back for the navigator); duplication lives here because it is a pure
 * server-side copy.
 */

export type EditorActionResult =
  | {
      status: "ok";
      /** The deck's slides after the operation, in order. */
      slides: { id: string; order: number }[];
      /** The slide the caller should select next. */
      focusSlideId: string;
    }
  | { status: "error"; message: string };

const idsSchema = z.object({
  deckId: z.string().min(1),
  slideId: z.string().min(1),
});

function fail(error: unknown): EditorActionResult {
  if (error instanceof HttpError) {
    return { status: "error", message: error.message };
  }
  console.error("[editor] unexpected error", error);
  return {
    status: "error",
    message: "Something went wrong. Please try again.",
  };
}

/**
 * Copy a slide — content, structure, speaker notes and the existing image.
 *
 * The image is copied rather than regenerated: a duplicate is the same slide
 * with a tweak, and re-running the image model would cost the founder time and
 * produce a different picture for identical content.
 */
export async function duplicateSlideAction(
  deckId: string,
  slideId: string,
): Promise<EditorActionResult> {
  try {
    const user = await requireUser();
    const parsed = idsSchema.safeParse({ deckId, slideId });

    if (!parsed.success) {
      return { status: "error", message: "That slide could not be duplicated." };
    }

    await requireDeck(deckId, user.id);
    const source = await requireSlide(slideId, user.id);

    if (source.deckId !== deckId) {
      throw new HttpError(404, "Slide not found.");
    }

    const created = await prisma.$transaction(async (tx) => {
      const tail = await tx.slide.findMany({
        where: { deckId, order: { gte: source.order } },
        orderBy: { order: "asc" },
        select: { id: true },
      });

      for (const slide of tail) {
        await tx.slide.update({
          where: { id: slide.id },
          data: { order: { increment: 1 } },
        });
      }

      return tx.slide.create({
        data: {
          deckId,
          order: source.order + 1,
          title: source.title,
          subtitle: source.subtitle,
          content: source.content,
          layout: source.layout,
          blocks: (source.blocks ?? []) as object,
          caption: source.caption,
          label: source.label,
          notes: source.notes,
          speakerNotes: source.speakerNotes,
          chartType: source.chartType,
          imagePrompt: source.imagePrompt,
          // Preserved, never regenerated.
          imageUrl: source.imageUrl,
          imageStatus: source.imageUrl ? "READY" : source.imageStatus,
          imageError: source.imageUrl ? null : source.imageError,
          userEdited: source.userEdited,
          generationSource: "EDITOR",
        },
        select: { id: true, order: true },
      });
    });

    const slides = await prisma.slide.findMany({
      where: { deckId },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });

    revalidatePath(`/decks/${deckId}/editor`);

    return {
      status: "ok",
      slides,
      focusSlideId: created.id,
    };
  } catch (error) {
    return fail(error);
  }
}
