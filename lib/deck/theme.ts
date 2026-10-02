/**
 * Slide theme.
 *
 * One source of truth for slide surface colours so the editor canvas, the
 * presentation mode, the public share viewer, and both exporters (PDF/PPTX)
 * render the same deck the same way.
 *
 * Slides are light-on-dark to match the product. A deck's own Brand Kit can
 * override `accent` / `headingFont` / `bodyFont` at render time.
 */

export type SlideTheme = {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
  accent: string;
  accentDeep: string;
  headingFont: string;
  bodyFont: string;
};

export const DEFAULT_SLIDE_THEME: SlideTheme = {
  background: "#0b0b0c",
  surface: "#18181a",
  foreground: "#f5f5f5",
  muted: "#a1a1aa",
  border: "#2a2a2d",
  accent: "#ff7a18",
  accentDeep: "#e63900",
  headingFont: "Inter",
  bodyFont: "Inter",
};

/** 16:9 at 1280x720 — the canvas size used by the editor and both exporters. */
export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

export const SLIDE_ASPECT_RATIO = SLIDE_WIDTH / SLIDE_HEIGHT;

/**
 * Apply a deck's Brand Kit on top of the defaults.
 * Any unset field falls back to the product default, so a partially configured
 * kit still produces a coherent deck.
 */
export function resolveSlideTheme(
  kit?: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
    headingFont?: string | null;
    bodyFont?: string | null;
  } | null,
): SlideTheme {
  if (!kit) {
    return DEFAULT_SLIDE_THEME;
  }

  return {
    ...DEFAULT_SLIDE_THEME,
    background: kit.secondaryColor || DEFAULT_SLIDE_THEME.background,
    surface: kit.primaryColor || DEFAULT_SLIDE_THEME.surface,
    accent: kit.accentColor || DEFAULT_SLIDE_THEME.accent,
    headingFont: kit.headingFont || DEFAULT_SLIDE_THEME.headingFont,
    bodyFont: kit.bodyFont || DEFAULT_SLIDE_THEME.bodyFont,
  };
}

/** Charts reuse the brand ramp so no slide introduces an off-brand colour. */
export const SLIDE_CHART_COLORS = [
  "#ff7a18",
  "#ff4d00",
  "#e63900",
  "#8a8079",
  "#4d4741",
] as const;