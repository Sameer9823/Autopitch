import { resolveSlideTheme, type SlideTheme } from "@/lib/deck/theme";
import type { DeckRenderModel, RenderSlide } from "@/lib/deck/render-model";
import { parseSlideBlocks, type SlideLayout } from "@/lib/schemas/slide";

/**
 * Prisma row → presentational render model.
 *
 * The editor, presentation mode, the public share viewer and both exporters all
 * need the same conversion, so it lives here rather than being re-derived in
 * each of them.
 */

export type SlideRow = {
  id: string;
  order: number;
  title: string;
  subtitle?: string | null;
  content?: string | null;
  layout?: string | null;
  caption?: string | null;
  label?: string | null;
  imageUrl?: string | null;
  imageStatus?: string | null;
  imageError?: string | null;
  speakerNotes?: string | null;
  blocks?: unknown;
};

export type DeckRowForRender = {
  id: string;
  title?: string | null;
  startupName?: string | null;
  slides: SlideRow[];
};

export function toRenderSlide(row: SlideRow): RenderSlide {
  return {
    id: row.id,
    order: row.order,
    title: row.title,
    subtitle: row.subtitle ?? null,
    content: row.content ?? null,
    layout: (row.layout ?? "CONTENT") as SlideLayout,
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

export function toRenderModel(
  deck: DeckRowForRender,
  brandKit?: Parameters<typeof resolveSlideTheme>[0],
): DeckRenderModel {
  return {
    id: deck.id,
    title: deck.title ?? null,
    startupName: deck.startupName ?? null,
    theme: resolveSlideTheme(brandKit) as SlideTheme,
    slides: [...deck.slides]
      .sort((a, b) => a.order - b.order)
      .map(toRenderSlide),
  };
}