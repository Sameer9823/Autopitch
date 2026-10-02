/**
 * Text fitting for the exporters.
 *
 * A slide is 1280x720 and the text on it is model-generated, so it can be much
 * longer than it "should" be. Both exporters therefore cannot measure glyphs
 * natively (pdf-lib's standard fonts can measure, PPTX has no measurement API
 * at all), so this module provides one approximate metric that BOTH formats
 * share. That is what stops a long title from overflowing in the PDF and a
 * different title from overflowing in the PPTX: they ask the same question of
 * the same function and get the same answer.
 *
 * The model is a per-character width table in ems. It is approximate by
 * construction — it exists to be *consistent*, not to be exact.
 */

/** Font families the exporters can reason about generically. */
export type FontFamily = "sans" | "serif" | "mono";

/** The three metrics a glyph can have, as a fraction of the font size. */
const NARROW = 0.3;
const SPACE = 0.27;
const WIDE = 0.88;
const CAPS = 0.64;
const LOWER = 0.53;

function charWidthEm(char: string, family: FontFamily): number {
  if (family === "mono") {
    return 0.6;
  }

  if (char === " " || char === "\t") {
    return SPACE;
  }

  if ("iljtfI.,;:'!|()[]{}/\\-".includes(char)) {
    return NARROW;
  }

  if ("mwMW@%&".includes(char)) {
    return WIDE;
  }

  const isUpper = char >= "A" && char <= "Z";
  if (isUpper || (char >= "0" && char <= "9")) {
    return family === "serif" ? CAPS + 0.02 : CAPS;
  }

  // Serif text runs slightly narrower at lowercase than a geometric sans.
  return family === "serif" ? LOWER - 0.02 : LOWER;
}

/**
 * Classify a font family name.
 *
 * The theme stores brand font *names* ("Inter", "Geist", "IBM Plex Sans"). PDF
 * can only embed its 14 standard fonts, and PPTX has no font fallback story we
 * can rely on, so both exporters reduce the name to one of three families and
 * use it consistently.
 */
export function fontFamilyOf(fontName: string | null | undefined): FontFamily {
  const name = (fontName ?? "").toLowerCase();

  if (/(mono|code|courier|consolas)/.test(name)) {
    return "mono";
  }

  if (/(serif|times|georgia|garamond|playfair|merriweather)/.test(name)) {
    return "serif";
  }

  return "sans";
}

/** Approximate rendered width of a single line, in the same units as fontSize. */
export function textWidth(
  text: string,
  fontSize: number,
  family: FontFamily = "sans",
): number {
  let ems = 0;

  for (const char of text) {
    ems += charWidthEm(char, family);
  }

  return ems * fontSize;
}

/**
 * Typographic characters that pdf-lib's standard fonts cannot encode, folded
 * down to their ASCII equivalents so an export never throws mid-page.
 */
const TRANSLITERATIONS: Array<[RegExp, string]> = [
  [/[‘’‚′‛]/g, "'"],
  [/[“”„″]/g, '"'],
  [/[‐‑‒–—―]/g, "-"],
  [/…/g, "..."],
  [/[•·]/g, "-"],
  [/[   ]/g, " "],
  [/[‹«]/g, "<"],
  [/[›»]/g, ">"],
  [/[→⇒]/g, "->"],
  [/[©®™]/g, ""],
  [/[×]/g, "x"],
  [/[÷]/g, "/"],
];

/**
 * Reduce text to the WinAnsi range that PDF standard fonts support.
 *
 * Anything outside it is dropped rather than replaced, because a replaced glyph
 * would be a visible lie in an investor-facing document.
 */
export function sanitizeWinAnsi(text: string): string {
  let out = text;

  for (const [pattern, replacement] of TRANSLITERATIONS) {
    out = out.replace(pattern, replacement);
  }

  return out.replace(/[^\n\t\x20-\x7e\xa0-\xff]/g, "");
}

export type FittedText = {
  /** One entry per rendered line. Never empty when the source had content. */
  lines: string[];
  fontSize: number;
  /** Distance between baselines, derived from the *final* font size. */
  lineHeight: number;
  height: number;
  /** Width of the widest rendered line. */
  width: number;
  /** True when content was dropped to respect `maxLines`. */
  truncated: boolean;
};

export type FitOptions = {
  maxWidth: number;
  fontSize: number;
  family?: FontFamily;
  maxLines?: number;
  /** Line height as a multiple of the font size. Defaults to 1.3. */
  lineHeight?: number;
  /** Never shrink below this. Defaults to 60% of `fontSize`. */
  minFontSize?: number;
};

/** Break one long word that cannot fit on a line by itself. */
function breakWord(
  word: string,
  maxWidth: number,
  fontSize: number,
  family: FontFamily,
): string[] {
  const parts: string[] = [];
  let current = "";

  for (const char of word) {
    const candidate = current + char;

    if (current.length > 0 && textWidth(candidate, fontSize, family) > maxWidth) {
      parts.push(current);
      current = char;
      continue;
    }

    current = candidate;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

/** Greedy word wrap across explicit newlines, honouring `maxWidth`. */
export function wrapParagraphs(
  text: string,
  maxWidth: number,
  fontSize: number,
  family: FontFamily,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    const trimmed = paragraph.trim();

    if (trimmed.length === 0) {
      continue;
    }

    let current = "";

    for (const word of trimmed.split(/\s+/)) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;

      if (textWidth(candidate, fontSize, family) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current.length > 0) {
        lines.push(current);
        current = "";
      }

      const pieces = breakWord(word, maxWidth, fontSize, family);
      const last = pieces.pop();

      lines.push(...pieces);

      if (last !== undefined) {
        current = last;
      }
    }

    if (current.length > 0) {
      lines.push(current);
    }
  }

  return lines;
}

function ellipsize(
  line: string,
  maxWidth: number,
  fontSize: number,
  family: FontFamily,
): string {
  const marker = "…";
  let out = line;

  while (
    out.length > 1 &&
    textWidth(`${out}${marker}`, fontSize, family) > maxWidth
  ) {
    out = out.slice(0, -1);
  }

  return `${out}${marker}`;
}

/**
 * Fit a text block into a box: wrap it, then shrink it, then clamp it.
 *
 * Shrinking happens before clamping so that a slightly-too-long title renders
 * smaller and complete rather than larger and cut off. Only when the text
 * cannot be made to fit at the minimum size is it truncated, and that is
 * reported through `truncated` so callers can react.
 */
export function fitText(text: string, options: FitOptions): FittedText {
  const {
    maxWidth,
    fontSize,
    family = "sans",
    maxLines = Math.max(1, Math.round(maxWidth / fontSize)),
    lineHeight = 1.3,
    minFontSize = Math.max(8, fontSize * 0.6),
  } = options;

  const clean = sanitizeWinAnsi(text).trim();

  const build = (
    size: number,
    lines: string[],
    truncated: boolean,
  ): FittedText => ({
    lines,
    fontSize: size,
    lineHeight: size * lineHeight,
    height: lines.length * size * lineHeight,
    width: lines.reduce(
      (widest, line) => Math.max(widest, textWidth(line, size, family)),
      0,
    ),
    truncated,
  });

  if (clean.length === 0 || maxWidth <= 0) {
    return build(fontSize, [], false);
  }

  const step = Math.max(0.5, Math.round(fontSize * 0.05 * 2) / 2);
  let size = fontSize;
  let smallest = fontSize;
  let smallestLines = wrapParagraphs(clean, maxWidth, fontSize, family);

  while (size >= minFontSize) {
    const lines = wrapParagraphs(clean, maxWidth, size, family);

    if (lines.length <= maxLines) {
      return build(size, lines, false);
    }

    smallest = size;
    smallestLines = lines;

    if (size - step < minFontSize) {
      break;
    }

    size = Math.max(minFontSize, Math.round((size - step) * 2) / 2);
  }

  const clamped = smallestLines.slice(0, maxLines);

  if (clamped.length > 0) {
    const lastIndex = clamped.length - 1;
    const last = clamped[lastIndex];
    clamped[lastIndex] =
      last === undefined ? "" : ellipsize(last, maxWidth, smallest, family);
  }

  return build(smallest, clamped, true);
}

/**
 * Chart values are shown above bars and in PPTX data labels.
 *
 * Large numbers get compacted so a value never collides with its neighbours.
 */
export function formatChartValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const magnitude = Math.abs(value);

  if (magnitude >= 1_000_000) {
    return `${trimTrailingZeros((value / 1_000_000).toFixed(1))}M`;
  }

  if (magnitude >= 10_000) {
    return `${trimTrailingZeros((value / 1_000).toFixed(1))}K`;
  }

  return trimTrailingZeros(value.toFixed(magnitude < 1 && magnitude > 0 ? 2 : 0));
}

function trimTrailingZeros(value: string): string {
  return value.includes(".")
    ? value.replace(/\.?0+$/, "")
    : value;
}