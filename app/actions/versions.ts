"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  HttpError,
  requireDeck,
  requireDeckRecord,
  requireUser,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { parseSnapshot } from "@/lib/versions/snapshot";

export type VersionActionResult =
  | { status: "ok"; message?: string; versionNumber?: number }
  | { status: "error"; message: string };

function fail(error: unknown): VersionActionResult {
  if (error instanceof HttpError) {
    return { status: "error", message: error.message };
  }
  console.error("[versions] unexpected error", error);
  return {
    status: "error",
    message: "Something went wrong. Please try again.",
  };
}

/**
 * Save the current deck state as a new named version.
 *
 * Reuses `snapshotDeckAction` from `@/app/actions/decks` for the actual
 * snapshot write; this is the thin server-action wrapper the UI calls.
 */
export async function saveVersionAction(
  deckId: string,
  summary: string,
): Promise<VersionActionResult> {
  try {
    const user = await requireUser();
    const parsed = z
      .string()
      .trim()
      .min(1, "Summary is required.")
      .max(400, "Summary is too long.")
      .safeParse(summary);

    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0].message };
    }

    await requireDeckRecord(deckId, user.id);

    const { snapshotDeckAction } = await import("@/app/actions/decks");
    const result = await snapshotDeckAction(deckId, parsed.data);

    if (result.status === "error") {
      return result;
    }

    revalidatePath(`/decks/${deckId}/versions`);
    return { status: "ok", message: "Version saved." };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Restore a version.
 *
 * Restoring applies the snapshot to the live deck AND appends a new version
 * whose `isRestoredFrom` points at the restored version. History is never
 * rewritten — every restore is itself recorded as a new version.
 */
export async function restoreVersionAction(
  deckId: string,
  versionId: string,
): Promise<VersionActionResult> {
  try {
    const user = await requireUser();
    await requireDeck(deckId, user.id);

    const version = await prisma.deckVersion.findFirst({
      where: { id: versionId, deckId },
    });
    if (!version) {
      return { status: "error", message: "Version not found." };
    }

    const { applySnapshot, createVersion } = await import("@/lib/versions/snapshot");
    const snapshot = parseSnapshot(version.snapshot);
    await applySnapshot(deckId, snapshot);

    const live = await prisma.deck.findFirst({
      where: { id: deckId, userId: user.id },
      include: { slides: { orderBy: { order: "asc" } } },
    });
    if (!live) {
      throw new HttpError(500, "Deck disappeared during restore.");
    }

    const newVersion = await createVersion({
      deckId,
      deck: live,
      summary: `Restored from version ${version.number}`,
      createdById: user.id,
      isRestoredFrom: version.number,
    });

    revalidatePath(`/decks/${deckId}/versions`);
    return {
      status: "ok",
      message: `Restored version ${version.number}. Created version ${newVersion.number}.`,
      versionNumber: newVersion.number,
    };
  } catch (error) {
    return fail(error);
  }
}