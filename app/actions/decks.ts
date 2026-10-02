"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { HttpError, requireDeckRecord, requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { createVersion } from "@/lib/versions/snapshot";

/**
 * Deck Server Functions.
 *
 * Every function re-verifies the session AND re-checks deck ownership against
 * the database — client-supplied ids are never trusted, and a deck owned by
 * someone else resolves to the same 404 as a deck that does not exist.
 */

export type DeckActionResult =
  | { status: "ok"; message?: string }
  | { status: "error"; message: string };

function fail(error: unknown): DeckActionResult {
  if (error instanceof HttpError) {
    return { status: "error", message: error.message };
  }
  console.error("[decks] unexpected error", error);
  return {
    status: "error",
    message: "Something went wrong. Please try again.",
  };
}

export async function renameDeckAction(
  deckId: string,
  title: string,
): Promise<DeckActionResult> {
  try {
    const user = await requireUser();
    const parsed = z
      .string()
      .trim()
      .min(1, "Deck name cannot be empty.")
      .max(200)
      .safeParse(title);

    if (!parsed.success) {
      return { status: "error", message: "Deck name cannot be empty." };
    }

    await requireDeckRecord(deckId, user.id);
    await prisma.deck.update({
      where: { id: deckId },
      data: { title: parsed.data },
    });

    revalidatePath("/decks");
    revalidatePath("/");
    return { status: "ok" };
  } catch (error) {
    return fail(error);
  }
}

export async function duplicateDeckAction(
  deckId: string,
): Promise<DeckActionResult> {
  try {
    const user = await requireUser();
    // Ownership gate only: the loaded record is not read again, the copy below
    // re-reads the deck with its slides in one query.
    await requireDeckRecord(deckId, user.id);

    const full = await prisma.deck.findFirst({
      where: { id: deckId, userId: user.id },
      include: { slides: { orderBy: { order: "asc" } } },
    });

    if (!full) {
      throw new HttpError(404, "Deck not found.");
    }

    const copy = await prisma.deck.create({
      data: {
        idea: full.idea,
        title: full.title ? `${full.title} (copy)` : "Untitled deck (copy)",
        startupName: full.startupName,
        deckType: full.deckType,
        stage: full.stage,
        askAmount: full.askAmount,
        status: "COMPLETE",
        completion: full.completion,
        userId: user.id,
        workspaceId: user.workspaceId,
        slides: {
          create: full.slides.map((slide) => ({
            order: slide.order,
            title: slide.title,
            content: slide.content,
            imagePrompt: slide.imagePrompt,
            imageUrl: slide.imageUrl,
            subtitle: slide.subtitle,
            layout: slide.layout,
            caption: slide.caption,
            label: slide.label,
            speakerNotes: slide.speakerNotes,
            blocks: slide.blocks as object,
            chartType: slide.chartType,
            imageStatus: slide.imageStatus,
          })),
        },
      },
    });

    revalidatePath("/decks");
    revalidatePath("/");
    return { status: "ok", message: `Created ${copy.id}` };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteDeckAction(
  deckId: string,
): Promise<DeckActionResult> {
  try {
    const user = await requireUser();
    // Cascades to slides, revisions, versions, shares, views, reviews,
    // questions, attempts, chat messages and assets.
    await requireDeckRecord(deckId, user.id);
    await prisma.deck.delete({ where: { id: deckId } });

    revalidatePath("/decks");
    revalidatePath("/");
    return { status: "ok" };
  } catch (error) {
    return fail(error);
  }
}

export async function archiveDeckAction(
  deckId: string,
): Promise<DeckActionResult> {
  try {
    const user = await requireUser();
    await requireDeckRecord(deckId, user.id);
    await prisma.deck.update({
      where: { id: deckId },
      data: { archivedAt: new Date() },
    });

    revalidatePath("/decks");
    return { status: "ok" };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Snapshot the current deck as a named version. Used by explicit
 * "Save version" and before destructive bulk operations.
 */
export async function snapshotDeckAction(
  deckId: string,
  summary: string,
): Promise<DeckActionResult> {
  try {
    const user = await requireUser();
    // Ownership gate only: the snapshot reads the deck with its slides below.
    await requireDeckRecord(deckId, user.id);

    const withSlides = await prisma.deck.findFirst({
      where: { id: deckId, userId: user.id },
      include: { slides: { orderBy: { order: "asc" } } },
    });

    if (!withSlides) {
      throw new HttpError(404, "Deck not found.");
    }

    await createVersion({
      deckId,
      deck: withSlides,
      summary: summary.trim() || "Manual save",
      createdById: user.id,
    });

    revalidatePath(`/decks/${deckId}/versions`);
    return { status: "ok" };
  } catch (error) {
    return fail(error);
  }
}

export async function createDeckAndRedirect(formData: FormData): Promise<void> {
  const user = await requireUser();
  const idea = String(formData.get("idea") ?? "").trim();

  if (idea.length < 20) {
    return;
  }

  const deck = await prisma.deck.create({
    data: {
      idea,
      startupName: String(formData.get("startupName") ?? "").trim() || null,
      stage: (String(formData.get("stage") ?? "UNKNOWN") ||
        "UNKNOWN") as never,
      userId: user.id,
      workspaceId: user.workspaceId,
    },
  });

  redirect(`/decks/${deck.id}/editor`);
}
