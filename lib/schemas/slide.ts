import { z } from "zod";

/**
 * Structured, editable slide content.
 *
 * This is the single source of truth for "what a slide contains" and is shared
 * by: the AI generators, the editor inspector, the canvas renderer, the public
 * share viewer, presentation mode, and both exporters (PDF/PPTX). Keeping one
 * schema here is what makes single-slide regeneration and native (non-screenshot)
 * export possible.
 *
 * Stored on Slide.blocks as `Json`.
 */

export const SlideLayoutSchema = z.enum([
  "TITLE",
  "SECTION",
  "CONTENT",
  "TWO_COLUMN",
  "THREE_FEATURE",
  "METRICS",
  "CHART",
  "IMAGE",
  "QUOTE",
  "TIMELINE",
  "CLOSING",
]);

export type SlideLayout = z.infer<typeof SlideLayoutSchema>;

export const CHART_TYPES = ["bar", "line", "area", "pie", "donut"] as const;
export const ChartTypeSchema = z.enum(CHART_TYPES);
export type ChartType = z.infer<typeof ChartTypeSchema>;

export const ChartSeriesPointSchema = z.object({
  label: z.string().min(1).max(40),
  value: z.number().finite(),
});

export const HeadingBlockSchema = z.object({
  type: z.literal("heading"),
  text: z.string().min(1).max(200),
});

export const BodyBlockSchema = z.object({
  type: z.literal("body"),
  text: z.string().min(1).max(2000),
});

export const BulletsBlockSchema = z.object({
  type: z.literal("bullets"),
  items: z.array(z.string().min(1).max(400)).min(1).max(8),
});

export const MetricBlockSchema = z.object({
  type: z.literal("metric"),
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(40),
  delta: z.string().max(40).optional(),
  /**
   * True when the AI could not find this number in the founder's input.
   * Rendered as "Data needed" so we never show an invented metric as fact.
   */
  placeholder: z.boolean().optional(),
});

export const ChartBlockSchema = z.object({
  type: z.literal("chart"),
  chartType: ChartTypeSchema,
  title: z.string().max(120).optional(),
  series: z.array(ChartSeriesPointSchema).min(1).max(12),
  caption: z.string().max(300).optional(),
});

export const CaptionBlockSchema = z.object({
  type: z.literal("caption"),
  text: z.string().min(1).max(400),
});

export const LabelBlockSchema = z.object({
  type: z.literal("label"),
  text: z.string().min(1).max(80),
});

export const SlideBlockSchema = z.discriminatedUnion("type", [
  HeadingBlockSchema,
  BodyBlockSchema,
  BulletsBlockSchema,
  MetricBlockSchema,
  ChartBlockSchema,
  CaptionBlockSchema,
  LabelBlockSchema,
]);

export type SlideBlock = z.infer<typeof SlideBlockSchema>;
export const SlideBlocksSchema = z.array(SlideBlockSchema).max(20);

/** Coerce whatever is in the database (or an AI response) into valid blocks. */
export function parseSlideBlocks(input: unknown): SlideBlock[] {
  const result = SlideBlocksSchema.safeParse(input);
  return result.success ? result.data : [];
}

// ---------------------------------------------------------------------------
// Editorial actions available from the inspector's AI tab
// ---------------------------------------------------------------------------

export const EDITORIAL_ACTIONS = [
  "improve",
  "rewrite",
  "shorten",
  "expand",
  "investor_focused",
  "headline",
  "visual",
  "chart",
  "speaker_notes",
  "regenerate",
] as const;

export const EditorialActionSchema = z.enum(EDITORIAL_ACTIONS);
export type EditorialAction = z.infer<typeof EditorialActionSchema>;

// ---------------------------------------------------------------------------
// Full editable slide payload used by autosave and the version snapshot
// ---------------------------------------------------------------------------

export const EditableSlideSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(400).nullish(),
  content: z.string().max(8000).default(""),
  layout: SlideLayoutSchema.default("CONTENT"),
  blocks: SlideBlocksSchema.default([]),
  chartType: ChartTypeSchema.nullish(),
  notes: z.string().max(8000).nullish(),
  speakerNotes: z.string().max(8000).nullish(),
  caption: z.string().max(400).nullish(),
  label: z.string().max(80).nullish(),
  imagePrompt: z.string().max(1000).default(""),
  imageUrl: z.string().nullable().optional(),
});

export type EditableSlide = z.infer<typeof EditableSlideSchema>;

/** Never let a user edit `order` or reassign `deckId` through autosave. */
export const SlidePatchSchema = EditableSlideSchema.partial().extend({
  id: z.string().min(1),
});

export type SlidePatch = z.infer<typeof SlidePatchSchema>;
