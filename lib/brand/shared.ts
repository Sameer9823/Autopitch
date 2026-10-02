/**
 * Client-safe brand kit constants.
 *
 * The palette guidance and font list are needed by the brand kit UI, but they
 * used to live in `lib/ai/brand-kit`, which imports the OpenAI Agents SDK. A
 * client component importing from there pulls the agent runtime into the browser
 * bundle and the production build fails. This leaf module has no imports, so it
 * is safe to import from either side.
 *
 * `lib/ai/brand-kit` re-exports these for its server callers.
 */

/** The slide background a generated palette is designed against. */
export const SLIDE_SURFACE_HEX = "#0b0b0c";

/** The canonical font list, mirrored from `BrandKitSuggestionSchema`. */
export const BRAND_FONTS = [
  "Inter",
  "Geist",
  "IBM Plex Sans",
  "Manrope",
  "Sora",
] as const;

export type BrandFont = (typeof BRAND_FONTS)[number];

/** Human labels for the font picker, with the character each one carries. */
export const BRAND_FONT_LABELS: Record<BrandFont, string> = {
  Inter: "Inter — neutral, safe, everywhere",
  Geist: "Geist — modern, product-led",
  "IBM Plex Sans": "IBM Plex Sans — technical, serious",
  Manrope: "Manrope — warm, confident",
  Sora: "Sora — distinctive, ambitious",
};
