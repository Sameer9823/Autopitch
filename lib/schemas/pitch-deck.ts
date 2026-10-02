import { z } from "zod";

import { SlideBlocksSchema, SlideLayoutSchema } from "@/lib/schemas/slide";

/**
 * Structured output contract for whole-deck generation.
 *
 * Extended from the original `{ deckTitle, slides: [{title, content, imagePrompt}] }`
 * shape — every original field is still required, so the existing generation
 * flow keeps working, while `layout`/`subtitle`/`blocks` let the deck arrive
 * with real structure (metrics, bullets, charts) instead of a wall of text.
 */
export const PitchDeckSlideSchema = z.object({
  title: z.string().min(3).max(80),
  content: z.string().min(20).max(500),
  imagePrompt: z.string().min(10).max(300),

  subtitle: z.string().max(160).nullish(),
  layout: SlideLayoutSchema.default("CONTENT"),
  blocks: SlideBlocksSchema.default([]),
});

export const PitchDeckSchema = z.object({
  deckTitle: z.string().min(3).max(100),
  slides: z.array(PitchDeckSlideSchema).min(5).max(8),
});

export type PitchDeckSlide = z.infer<typeof PitchDeckSlideSchema>;
export type PitchDeck = z.infer<typeof PitchDeckSchema>;

/** Kept for callers that only need the original three fields. */
export const SlideSchema = z.object({
  title: z.string().min(3).max(80),
  content: z.string().min(20).max(500),
  imagePrompt: z.string().min(10).max(300),
});

export type Slide = z.infer<typeof SlideSchema>;
