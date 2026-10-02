"use server";

import { revalidatePath } from "next/cache";

import { HttpError, requireDeckRecord, requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";

/**
 * Practice Server Functions.
 *
 * The practice surface talks to the attempts API for anything the AI has to
 * think about. These two mutations do not — deleting one attempt and clearing a
 * founder's history are pure database writes, so they run as Server Functions and
 * avoid a round trip and a loading state for no reason.
 *
 * Both re-verify the session AND re-check ownership inside the action, so a
 * client-supplied deck or attempt id can never reach another founder's practice
 * history. An id the caller does not own resolves to the same 404 as one that does
 * not exist.
 */

type PracticeActionResult =
  | { status: "ok"; deleted: number }
  | { status: "error"; message: string };

function fail(error: unknown): PracticeActionResult {
  if (error instanceof HttpError) {
    return { status: "error", message: error.message };
  }
  console.error("[practice] unexpected error", error);
  return { status: "error", message: "Something went wrong. Please try again." };
}

/**
 * Remove a single practice attempt from the founder's history.
 *
 * Scoped to the deck, which the caller has already proven they own — a
 * cross-tenant attempt id matches nothing and resolves to the same 404.
 */
export async function deleteAttemptAction(
  deckId: string,
  attemptId: string,
): Promise<PracticeActionResult> {
  try {
    const user = await requireUser();
    const deck = await requireDeckRecord(deckId, user.id);

    const removed = await prisma.questionAttempt.deleteMany({
      where: { id: attemptId, deckId: deck.id },
    });

    if (removed.count === 0) {
      throw new HttpError(404, "That attempt is already gone.");
    }

    revalidatePath(`/decks/${deck.id}/practice`);

    return { status: "ok", deleted: removed.count };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Clear this deck's practice history.
 *
 * Only attempts are removed. The questions themselves are kept: they are derived
 * from the deck, and throwing them away would mean paying to regenerate them.
 */
export async function resetPracticeAction(
  deckId: string,
): Promise<PracticeActionResult> {
  try {
    const user = await requireUser();
    const deck = await requireDeckRecord(deckId, user.id);

    const removed = await prisma.questionAttempt.deleteMany({
      where: { deckId: deck.id },
    });

    revalidatePath(`/decks/${deck.id}/practice`);

    return { status: "ok", deleted: removed.count };
  } catch (error) {
    return fail(error);
  }
}
