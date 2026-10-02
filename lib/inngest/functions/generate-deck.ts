import { NonRetriableError } from "inngest";

import {
  generatePitchDeck,
  PitchDeckGenerationError,
} from "@/lib/agents/generate-pitch-deck";
import { trackUsageSafe } from "@/lib/analytics/usage";
import { prisma } from "@/lib/db";
import { DeckStatus, ImageStatus } from "@/lib/generated/prisma/client";
import { uploadSlideImage } from "@/lib/imagekit";
import { inngest } from "@/lib/inngest/client";
import { generateSlideImage } from "@/lib/openai";

/** How many slides' images may be generated at the same time. */
const IMAGE_CONCURRENCY = 4;

/**
 * Background job: turn a project idea into a full pitch deck with images.
 *
 * Slide CONTENT is generated in one agent call (fast), then every slide row is
 * written to the database immediately so the user can start editing while the
 * images are still rendering. Images are generated with bounded concurrency,
 * each with its own status, so a finished slide is never blocked by a slow one.
 */
export const generateDeck = inngest.createFunction(
  {
    id: "generate-deck",
    triggers: [{ event: "deck/generate" }],
    concurrency: { limit: 5 },
  },
  async ({ event, step }) => {
    const { deckId } = event.data;
    const userId = (event.data as { userId?: string }).userId ?? null;
    const workspaceId = (event.data as { workspaceId?: string }).workspaceId ?? null;

    const deck = await step.run("load-deck", async () => {
      const record = await prisma.deck.findUnique({
        where: { id: deckId },
        select: { id: true, idea: true, title: true },
      });

      if (!record) {
        throw new NonRetriableError(`Deck not found: ${deckId}`);
      }

      return record;
    });

    try {
      await step.run("mark-generating", async () => {
        await prisma.deck.update({
          where: { id: deckId },
          data: { status: DeckStatus.GENERATING },
        });
      });

      // --- AI content -------------------------------------------------------
      const pitchDeck = await step.run("run-agent", async () => {
        return generatePitchDeck(deck.idea);
      });

      await step.run("save-title", async () => {
        await prisma.deck.update({
          where: { id: deckId },
          data: { title: pitchDeck.deckTitle },
        });
      });

      // --- Persist all slide rows up front, images still QUEUED --------------
      const slideIds = await step.run("save-slides", async () => {
        const created: string[] = [];

        for (let index = 0; index < pitchDeck.slides.length; index++) {
          const slide = pitchDeck.slides[index];
          const order = index + 1;

          const row = await prisma.slide.create({
            data: {
              deckId,
              order,
              title: slide.title,
              content: slide.content,
              imagePrompt: slide.imagePrompt,
              imageUrl: null,
              imageStatus: ImageStatus.QUEUED,
              generationSource: "DECK",
              subtitle: slide.subtitle ?? null,
              layout: slide.layout,
              blocks: (slide.blocks ?? []) as object,
            },
            select: { id: true },
          });

          created.push(row.id);
        }

        await prisma.deck.update({
          where: { id: deckId },
          data: { completion: 60 },
        });

        return created;
      });

      trackUsageSafe({
        type: "AI_GENERATION",
        userId,
        workspaceId,
        deckId,
        quantity: 1,
        meta: { operation: "deck_generation" },
      });
      trackUsageSafe({
        type: "SLIDE_GENERATED",
        userId,
        workspaceId,
        deckId,
        quantity: slideIds.length,
      });

      // --- Images, in bounded parallel --------------------------------------
      // Each slide carries its own QUEUED/GENERATING/READY/FAILED state, and a
      // failure on one slide never fails the deck.
      await step.run("generate-images", async () => {
        const jobs = slideIds.map((slideId, index) => async () => {
          const prompt = pitchDeck.slides[index].imagePrompt;
          const order = index + 1;

          await prisma.slide.update({
            where: { id: slideId },
            data: { imageStatus: ImageStatus.GENERATING, imageError: null },
          });

          try {
            const buffer = await generateSlideImage(prompt);
            const url = await uploadSlideImage(
              buffer,
              `deck-${deckId}-slide-${order}.png`,
            );

            await prisma.slide.update({
              where: { id: slideId },
              data: { imageUrl: url, imageStatus: ImageStatus.READY },
            });

            trackUsageSafe({
              type: "IMAGE_GENERATION",
              userId,
              workspaceId,
              deckId,
              quantity: 1,
              bytes: buffer.byteLength,
            });
            trackUsageSafe({
              type: "STORAGE",
              userId,
              workspaceId,
              deckId,
              quantity: 1,
              bytes: buffer.byteLength,
            });
          } catch (error) {
            // Surface the failure on the slide; the deck still completes and the
            // editor offers Retry / Regenerate / Use Placeholder.
            await prisma.slide.update({
              where: { id: slideId },
              data: {
                imageStatus: ImageStatus.FAILED,
                imageError:
                  error instanceof Error
                    ? error.message.slice(0, 300)
                    : "Image generation failed.",
              },
            });
          }
        });

        await runWithConcurrency(jobs, IMAGE_CONCURRENCY);
      });

      await step.run("mark-complete", async () => {
        await prisma.deck.update({
          where: { id: deckId },
          data: { status: DeckStatus.COMPLETE, completion: 100 },
        });
      });

      return { deckId, slideCount: slideIds.length };
    } catch (error) {
      const message =
        error instanceof PitchDeckGenerationError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown error during deck generation";

      await step.run("mark-failed", async () => {
        await prisma.deck.update({
          where: { id: deckId },
          data: { status: DeckStatus.FAILED, errorMessage: message },
        });
      });

      if (
        error instanceof PitchDeckGenerationError ||
        error instanceof NonRetriableError
      ) {
        throw new NonRetriableError(message);
      }

      throw error;
    }
  },
);

/**
 * Run tasks with a bounded number in flight. Failures inside a task are the
 * task's own concern — this never rejects unless a task itself throws.
 */
async function runWithConcurrency(
  tasks: (() => Promise<void>)[],
  limit: number,
): Promise<void> {
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      await tasks[index]();
    }
  });

  await Promise.all(workers);
}
