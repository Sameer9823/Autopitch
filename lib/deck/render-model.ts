import {
  CHART_TYPES,
  type ChartType,
  type SlideBlock,
  type SlideLayout,
} from "@/lib/schemas/slide";
import {
  DEFAULT_SLIDE_THEME,
  SLIDE_CHART_COLORS,
  type SlideTheme,
} from "@/lib/deck/theme";

/**
 * Presentational slide model.
 *
 * This is deliberately a plain, serialisable shape with no React and no
 * database types so it can be consumed by:
 *   - the editor canvas (client)
 *   - presentation mode (client)
 *   - the public share viewer (server + client)
 *   - the PDF exporter (server, pdf-lib)
 *   - the PPTX exporter (server, pptxgenjs)
 *
 * One model means one layout, so what a founder previews is exactly what an
 * investor receives.
 */
export type RenderSlide = {
  id: string;
  order: number;
  title: string;
  subtitle?: string | null;
  content?: string | null;
  layout: SlideLayout;
  caption?: string | null;
  label?: string | null;
  imageUrl?: string | null;
  imageStatus?: "NONE" | "QUEUED" | "GENERATING" | "READY" | "FAILED";
  imageError?: string | null;
  speakerNotes?: string | null;
  blocks: SlideBlock[];
};

export type DeckRenderModel = {
  id: string;
  title: string | null;
  startupName: string | null;
  theme?: SlideTheme | null;
  slides: RenderSlide[];
};

/**
 * Normalize a slide into render order.
 * Text on `content` that duplicates block bullets is not repeated, so a slide
 * never shows the same sentence twice.
 */
export function normalizeSlide(slide: RenderSlide): RenderSlide {
  const bullets = slide.blocks
    .filter((block): block is Extract<SlideBlock, { type: "bullets" }> =>
      block.type === "bullets",
    )
    .flatMap((block) => block.items);

  const content = (slide.content ?? "")
    .split("\n")
    .map((line) => line.replace(/^[\u2022•\-\*]\s*/, "").trim())
    .filter((line) => line.length > 0);

  const bulletSet = new Set(bullets.map((bullet) => bullet.trim()));
  const remaining = content.filter((line) => !bulletSet.has(line));

  return {
    ...slide,
    content: remaining.length > 0 ? remaining.join("\n") : null,
    blocks: slide.blocks.length > 0 ? slide.blocks : remaining.length > 0
      ? [{ type: "bullets", items: remaining.slice(0, 8) }]
      : [],
  };
}

export function isChartType(value: unknown): value is ChartType {
  return (
    typeof value === "string" &&
    (CHART_TYPES as readonly string[]).includes(value)
  );
}

/** Slides with a hero image use a split layout; everything else is text-first. */
export function slideUsesImage(slide: RenderSlide): boolean {
  return Boolean(slide.imageUrl) || slide.layout === "IMAGE";
}

export function chartColorAt(index: number): string {
  return SLIDE_CHART_COLORS[index % SLIDE_CHART_COLORS.length] as string;
}

export const THEME = DEFAULT_SLIDE_THEME;