import { defineAgent, GROUNDING_RULES, runStructured } from "@/lib/ai/agent";
import { formatDeckForPrompt, toDeckContext } from "@/lib/ai/deck-context";
import { requireDeck } from "@/lib/api/guards";
import {
  ImportAnalysisSchema,
  type ImportAnalysis,
} from "@/lib/schemas/content";

/**
 * Import analysis.
 *
 * Extracts a structured startup brief from whatever the founder supplied. The
 * one hard rule: if a field is not present in the source, it is returned as
 * null and listed in `missingFields`. Nothing is ever inferred or invented.
 */

const importAnalyzerAgent = defineAgent<ImportAnalysis>({
  name: "ImportAnalyzer",
  instructions: `You analyse startup source material (a website, an uploaded PDF, an existing deck, or founder notes) and extract a structured brief that can seed pitch deck generation.

Extract, ONLY what the source actually states:
- startupName: the company's name, or null if never mentioned
- product, problem, solution, market, businessModel, traction, team, financials, ask
- missingFields: a list of the fields above that the source does NOT cover
- idea: a single consolidated narrative (20–4000 chars) that a pitch deck agent
  can read directly to generate a deck from the available facts

${GROUNDING_RULES}

If the source is thin, return thin fields and a long missingFields list rather
than filling gaps with plausible-sounding copy.`,
  schema: ImportAnalysisSchema,
});

/** Turn extracted source text (PDF / PPTX / website / plain text) into a brief. */
export async function analyzeSourceText(text: string): Promise<ImportAnalysis> {
  const trimmed = text.trim();

  if (trimmed.length < 40) {
    throw new Error(
      "We could not find enough text to analyse. Try pasting more detail.",
    );
  }

  return runStructured(importAnalyzerAgent, trimmed.slice(0, 60_000));
}

/**
 * Import an existing deck: reuse the deck's own slides as the source material
 * instead of re-reading an uploaded file.
 */
export async function analyzeExistingDeck(
  deckId: string,
  userId: string,
): Promise<ImportAnalysis> {
  // Ownership is verified before the deck is ever read into AI context.
  const deck = await requireDeck(deckId, userId);
  const context = toDeckContext(deck);

  return runStructured(
    importAnalyzerAgent,
    `Analyse this existing pitch deck.\n\n${formatDeckForPrompt(context)}`,
  );
}
