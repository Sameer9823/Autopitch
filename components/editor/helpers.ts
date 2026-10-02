import type { RenderSlide } from "@/lib/deck/render-model";
import { shallowEqual } from "@/lib/editor/undo-history";
import type { EditorSlide } from "@/lib/editor/use-deck-editor";
import {
  CHART_TYPES,
  parseSlideBlocks,
  SlideLayoutSchema,
  type ChartType,
  type EditableSlide,
  type SlideBlock,
  type SlideLayout,
} from "@/lib/schemas/slide";

/**
 * Editor helpers shared by the navigator, canvas, inspector and dialogs.
 *
 * Two rules live here rather than in each component:
 *   1. There is exactly one conversion from editor state to the render model,
 *      so the canvas, the thumbnails and the compare dialog can never disagree.
 *   2. The image fields are server-owned. Every merge of an AI proposal goes
 *      through `mergeProposal`, which copies content and never touches the image.
 */

export const LAYOUT_OPTIONS: {
  value: SlideLayout;
  label: string;
  description: string;
}[] = [
  { value: "TITLE", label: "Title", description: "Deck opener or cover" },
  { value: "SECTION", label: "Section", description: "Act break between chapters" },
  { value: "CONTENT", label: "Content", description: "Text with supporting bullets" },
  { value: "TWO_COLUMN", label: "Two column", description: "Text beside a visual" },
  { value: "THREE_FEATURE", label: "Three features", description: "Three short pillars" },
  { value: "METRICS", label: "Metrics", description: "Two or three headline numbers" },
  { value: "CHART", label: "Chart", description: "A single data story" },
  { value: "IMAGE", label: "Image", description: "Visual first, minimal copy" },
  { value: "QUOTE", label: "Quote", description: "A customer or founder line" },
  { value: "TIMELINE", label: "Timeline", description: "Milestones in sequence" },
  { value: "CLOSING", label: "Closing", description: "The ask, or a thank-you" },
];

export const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] =
  CHART_TYPES.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }));

/** A proposed replacement for one slide's editable content. Never applied directly. */
export type SlideProposal = {
  summary: string;
  dataNeeded: string[];
  slide: EditableSlide;
};

/** The editor → render model conversion. */
export function toCanvasSlide(slide: EditorSlide): RenderSlide {
  return {
    id: slide.id,
    order: slide.order,
    title: slide.title || "Untitled slide",
    subtitle: slide.subtitle,
    content: slide.content,
    layout: slide.layout,
    caption: slide.caption,
    label: slide.label,
    imageUrl: slide.imageUrl,
    imageStatus: slide.imageStatus,
    imageError: slide.imageError,
    speakerNotes: slide.speakerNotes,
    blocks: slide.blocks,
  };
}

/** The same conversion for a server payload that is not an `EditorSlide` yet. */
export function canvasSlideFromPayload(row: {
  id: string;
  order: number;
  title: string;
  subtitle: string | null;
  content: string | null;
  layout: string | null;
  blocks: unknown;
  caption: string | null;
  label: string | null;
  imageUrl: string | null;
  imageStatus: string | null;
  imageError: string | null;
  speakerNotes: string | null;
}): RenderSlide {
  return {
    id: row.id,
    order: row.order,
    title: row.title || "Untitled slide",
    subtitle: row.subtitle ?? null,
    content: row.content ?? null,
    layout: SlideLayoutSchema.catch("CONTENT").parse(row.layout),
    caption: row.caption ?? null,
    label: row.label ?? null,
    imageUrl: row.imageUrl ?? null,
    imageStatus:
      (row.imageStatus as RenderSlide["imageStatus"]) ?? "NONE",
    imageError: row.imageError ?? null,
    speakerNotes: row.speakerNotes ?? null,
    blocks: parseSlideBlocks(row.blocks),
  };
}

/**
 * Apply an accepted AI proposal to a slide.
 *
 * Content fields come from the proposal. `imageUrl`, `imageStatus` and
 * `imageError` are copied from the current slide untouched, which is what makes
 * regenerating one slide provably leave its visual — and every other slide —
 * alone.
 */
export function mergeProposal(
  slide: EditorSlide,
  proposal: EditableSlide,
): EditorSlide {
  return {
    ...slide,
    title: proposal.title,
    subtitle: proposal.subtitle ?? null,
    content: proposal.content,
    layout: proposal.layout,
    blocks: proposal.blocks ?? [],
    caption: proposal.caption ?? null,
    label: proposal.label ?? null,
    imagePrompt: proposal.imagePrompt,
    speakerNotes: proposal.speakerNotes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Compare view
// ---------------------------------------------------------------------------

export type FieldChange = {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
};

function asText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

const COMPARED: { field: string; label: string; read: (slide: EditorSlide) => unknown }[] =
  [
    { field: "title", label: "Title", read: (slide) => slide.title },
    { field: "subtitle", label: "Subtitle", read: (slide) => slide.subtitle },
    { field: "content", label: "Body text", read: (slide) => slide.content },
    { field: "layout", label: "Layout", read: (slide) => slide.layout },
    { field: "label", label: "Label", read: (slide) => slide.label },
    { field: "caption", label: "Caption", read: (slide) => slide.caption },
    { field: "imagePrompt", label: "Visual prompt", read: (slide) => slide.imagePrompt },
    { field: "speakerNotes", label: "Speaker notes", read: (slide) => slide.speakerNotes },
    { field: "blocks", label: "Bullets, metrics & charts", read: (slide) => slide.blocks },
  ];

/** Field-level before/after for the Regeneration dialog. */
export function diffSlideProposal(
  current: EditorSlide,
  proposal: EditableSlide,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const { field, label, read } of COMPARED) {
    const before = asText(read(current));
    const after = asText(read(mergeProposal(current, proposal)));
    if (!shallowEqual(before, after)) {
      changes.push({ field, label, before, after });
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Block helpers
// ---------------------------------------------------------------------------

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) {
    return items;
  }
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

export function describeBlock(block: SlideBlock): string {
  switch (block.type) {
    case "bullets":
      return `Bullets · ${block.items.length} item${block.items.length === 1 ? "" : "s"}`;
    case "metric":
      return `Metric · ${block.label}`;
    case "chart":
      return `Chart · ${block.chartType}`;
    case "heading":
      return "Heading";
    case "body":
      return "Body text";
    case "caption":
      return "Caption";
    case "label":
      return "Label";
  }
}

export const IMAGE_STATUS_LABEL: Record<EditorSlide["imageStatus"], string> = {
  NONE: "No visual",
  QUEUED: "Queued",
  GENERATING: "Generating",
  READY: "Ready",
  FAILED: "Failed",
};
