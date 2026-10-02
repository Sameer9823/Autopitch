import { z } from "zod";

import {
  SlideBlocksSchema,
  SlideLayoutSchema,
  type SlideBlock,
} from "@/lib/schemas/slide";

/**
 * Structured output contract for whole-deck generation.
 *
 * Extended from the original `{ deckTitle, slides: [{title, content, imagePrompt}] }`
 * shape — every original field is still accepted, while `layout`/`subtitle`/`blocks`
 * let the deck arrive with real structure (metrics, bullets, charts) instead of a
 * wall of text.
 *
 * This must stay a plain `z.object`: the Agents SDK converts `outputType` into an
 * OpenAI `json_schema` request and only accepts object schemas. Wrapping it in a
 * `transform()`/`pipe()` would break structured output, so normalization happens
 * in `normalizePitchDeck()` after parsing instead.
 */

/**
 * Plain-text body derived from a slide's blocks.
 *
 * The generator writes real copy into `blocks`; `content` is the legacy plain
 * text column that the simple renderer, the exporters and the version snapshot
 * still read. Deriving one from the other keeps the two from drifting.
 */
function blocksToContent(blocks: SlideBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "body":
        lines.push(block.text);
        break;
      case "bullets":
        lines.push(...block.items.map((item) => `• ${item}`));
        break;
      case "metric":
        lines.push(
          `${block.label}: ${block.value}${block.delta ? ` (${block.delta})` : ""}`,
        );
        break;
      case "chart":
        lines.push(
          [block.title, block.caption].filter(Boolean).join(" — ") || "Chart",
        );
        break;
      case "heading":
      case "caption":
      case "label":
        lines.push(block.text);
        break;
    }
  }

  return lines.join("\n").trim();
}

export const PitchDeckSlideSchema = z.object({
  title: z.string().min(3).max(80),
  imagePrompt: z.string().min(10).max(300),

  /**
   * Optional in the model contract. Structured output runs in non-strict mode,
   * where `required` is a hint rather than a guarantee, so the model routinely
   * omits `content` and expresses the body through `blocks` instead. A missing
   * value is filled in from `blocks` by `normalizePitchDeck()`.
   */
  content: z.string().max(8000).nullish(),
  subtitle: z.string().max(160).nullish(),
  layout: SlideLayoutSchema.default("CONTENT"),
  blocks: SlideBlocksSchema.default([]),
});

export const PitchDeckSchema = z.object({
  deckTitle: z.string().min(3).max(100),
  slides: z.array(PitchDeckSlideSchema).min(5).max(8),
});

/** The shape `PitchDeckSchema` parses: `content` may be absent or null. */
export type ParsedPitchDeckSlide = z.infer<typeof PitchDeckSlideSchema>;

/** After normalization: `content` is always a string. */
export type NormalizedPitchDeckSlide = Omit<ParsedPitchDeckSlide, "content"> & {
  content: string;
};

export type PitchDeckSlide = NormalizedPitchDeckSlide;
export type PitchDeck = {
  deckTitle: string;
  slides: NormalizedPitchDeckSlide[];
};

/**
 * Fill in the derived `content` column for slides where the model left it
 * empty, so what we persist matches what the editor and exporters read back.
 */
export function normalizePitchDeck(deck: {
  deckTitle: string;
  slides: ParsedPitchDeckSlide[];
}): PitchDeck {
  return {
    deckTitle: deck.deckTitle,
    slides: deck.slides.map((slide) => ({
      ...slide,
      content: slide.content?.trim() || blocksToContent(slide.blocks),
      subtitle: slide.subtitle ?? null,
    })),
  };
}

/** Kept for callers that only need the original three fields. */
export const SlideSchema = z.object({
  title: z.string().min(3).max(80),
  content: z.string().min(20).max(500),
  imagePrompt: z.string().min(10).max(300),
});

export type Slide = z.infer<typeof SlideSchema>;
