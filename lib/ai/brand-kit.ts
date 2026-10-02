import { defineAgent, GROUNDING_RULES, runStructured } from "@/lib/ai/agent";
import { formatDeckForPrompt, type DeckContext } from "@/lib/ai/deck-context";
import {
  BrandKitSuggestionSchema,
  type BrandKitSuggestion,
} from "@/lib/schemas/content";

/**
 * Brand kit suggestions.
 *
 * The palette is not a taste decision, it is a rendering decision: the three
 * colours are fed straight into `resolveSlideTheme`, where `secondaryColor`
 * becomes the slide background, `primaryColor` the card surface and
 * `accentColor` the single bright accent. The prompt therefore constrains the
 * palette by ROLE, so the model cannot return three mid-tones that render as
 * an unreadable deck.
 *
 * The product's own identity is warm and serious — near-black surfaces, a warm
 * accent, generous space. The model is told to stay inside that world: no
 * purple, blue or cyan, no neon, nothing that reads as a generic AI product.
 */

/**
 * Client-safe palette constants live in a leaf module so the brand kit UI can
 * import them without pulling the OpenAI Agents SDK into the browser bundle.
 * They are re-exported here for the server callers that already import from
 * this file.
 */
import { SLIDE_SURFACE_HEX } from "@/lib/brand/shared";

export {
  SLIDE_SURFACE_HEX,
  BRAND_FONTS,
  BRAND_FONT_LABELS,
  type BrandFont,
} from "@/lib/brand/shared";

const brandKitAgent = defineAgent<BrandKitSuggestion>({
  name: "BrandKitDesigner",
  instructions: `You design the brand system for a startup's pitch deck. The deck renders light-on-dark, so every colour you choose has a rendering job.

Each colour's role is fixed:
- secondaryColor is the SLIDE BACKGROUND. It must be near-black: a deep neutral, warm charcoal, ink, or a very dark brown/olive. If it is lighter than a dark mode UI, the deck will be unusable.
- primaryColor is the CARD and metric-tile surface sitting on that background. Also very dark, but clearly distinguishable from secondaryColor — lighter, or shifted warmer.
- accentColor is the ONE bright colour: eyebrows, metric numbers, bullet markers, chart bars. It must be warm and legible.

Palette rules, all mandatory:
- NO purple, NO violet, NO indigo, NO blue, NO cyan, NO teal. Nothing in that hue family, in any lightness.
- NO neon, no fluorescent, no high-chroma electric colour. Nothing that glows on a dark surface.
- Stay in the warm and earthy range: terracotta, copper, burnt orange, amber, ochre, rust, oxblood, bone, sand, taupe, olive only when heavily desaturated.
- accentColor must reach at least WCAG AA contrast (4.5:1) against ${SLIDE_SURFACE_HEX}, so it is light or bright enough to read on near-black.
- The three colours must read as one system: the same underlying temperature, similar saturation discipline, no accidental clashing third hue.
- Set a real hex value for every colour. Never return a placeholder.

Fonts:
- headingFont and bodyFont must each be one of: Inter, Geist, IBM Plex Sans, Manrope, Sora.
- Pick the pairing from the company's positioning, not from taste alone. A serious infrastructure or enterprise company reads better in IBM Plex Sans; a modern product company in Geist or Inter; a confident consumer brand in Sora or Manrope. Setting both to the same font is a legitimate answer when the positioning is that plain.

rationale:
- 2–3 sentences, addressed to the founder, saying what the palette is doing for this specific company and why these fonts fit. Reference the company's actual positioning from the material. No marketing adjectives about the palette itself.

${GROUNDING_RULES}`,
  schema: BrandKitSuggestionSchema,
});

/** HSL values the product refuses, so a regression is caught in review. */
const FORBIDDEN_HUES = "purple, violet, indigo, blue, cyan, teal, and neon";

/**
 * Generate a palette and font pairing for a startup.
 *
 * Grounded on the company's own deck when one exists, so the suggestion reflects
 * what the company actually does. A founder with no deck gets a restrained
 * neutral system and is told why in the rationale.
 */
export async function suggestBrandKit(input: {
  context?: DeckContext | null;
  startupName?: string | null;
}): Promise<BrandKitSuggestion> {
  const material = input.context
    ? formatDeckForPrompt(input.context)
    : `The company: ${input.startupName ?? "a startup with no pitch deck yet"}. No deck exists, so choose a restrained, serious default system that would suit almost any B2B company and say so in the rationale.`;

  return runStructured(
    brandKitAgent,
    [
      "Design the brand system for this company's pitch deck.",
      "",
      "Remember the hard exclusions: nothing in the " +
        FORBIDDEN_HUES +
        " family, and every colour must keep its rendering role.",
      "",
      "—",
      "",
      "COMPANY MATERIAL",
      material,
    ].join("\n"),
  );
}
