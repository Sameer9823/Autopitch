import { uploadSlideImage } from "@/lib/imagekit";
import { generateSlideImage } from "@/lib/openai";

/**
 * Per-slide image pipeline for the editor.
 *
 * The bulk deck-generation job (lib/inngest/functions/generate-deck.ts) owns
 * image generation for a whole new deck. This module covers the editor case:
 * one slide, on demand, because the founder changed the visual direction or a
 * previous attempt failed.
 *
 * It reuses the SAME `generateSlideImage` + `uploadSlideImage` pair as the bulk
 * pipeline so an editor-generated visual is indistinguishable from a
 * deck-generation one, and it drives the same per-slide
 * `Slide.imageStatus` state machine:
 *
 *   NONE ──▶ GENERATING ──▶ READY
 *                   └─────▶ FAILED ──(retry)──▶ GENERATING
 *                              └──(placeholder)──▶ NONE
 *
 * The caller owns the database writes; this module is deliberately free of
 * Prisma so it stays testable and reusable from a route or a server action.
 */

export type ImagePipelineResult =
  | { ok: true; imageUrl: string; imagePrompt: string; bytes: number }
  | { ok: false; /** Safe, user-facing reason. Never a provider error string. */ error: string };

/** Prompts are stored truncated so a runaway generation cannot bloat the row. */
const MAX_STORED_PROMPT = 1000;
const MAX_STORED_ERROR = 300;

function safeFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (/IMAGEKIT/i.test(message)) {
    return "The visual was generated but could not be stored. Please try again.";
  }

  if (/OPENAI_API_KEY/i.test(message)) {
    return "Visual generation is not configured on this workspace yet.";
  }

  return "We could not generate a visual for this slide. Please try again.";
}

export function truncatePrompt(prompt: string): string {
  return prompt.trim().slice(0, MAX_STORED_PROMPT);
}

export function truncateImageError(message: string): string {
  return message.slice(0, MAX_STORED_ERROR);
}

/** A usable prompt for a slide that has none yet. */
export function fallbackPrompt(title: string): string {
  return truncatePrompt(
    `A clean, modern, professional editorial illustration supporting the idea "${title.trim()}". Neutral background, no text, no logos.`,
  );
}

/**
 * Generate one image for one slide and upload it.
 *
 * Returns the new URL and byte count on success so the caller can persist them
 * and record usage; returns a safe message on failure so the caller can set
 * `FAILED` without leaking a provider or driver error to the founder.
 */
export async function runSlideImagePipeline(input: {
  prompt: string;
  title: string;
  fileName: string;
}): Promise<ImagePipelineResult> {
  const prompt = truncatePrompt(input.prompt) || fallbackPrompt(input.title);

  try {
    const buffer = await generateSlideImage(prompt);
    const imageUrl = await uploadSlideImage(buffer, input.fileName);

    return { ok: true, imageUrl, imagePrompt: prompt, bytes: buffer.byteLength };
  } catch (error) {
    console.error("[editor] slide image generation failed", error);
    return { ok: false, error: safeFailureMessage(error) };
  }
}
