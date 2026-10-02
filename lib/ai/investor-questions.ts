import {
  defineAgent,
  GROUNDING_RULES,
  REASONING_MODEL,
  runStructured,
} from "@/lib/ai/agent";
import { formatDeckForPrompt, type DeckContext } from "@/lib/ai/deck-context";
import {
  InvestorQuestionListSchema,
  QUESTION_CATEGORIES,
  type InvestorQuestionAi,
} from "@/lib/schemas/investor-questions";

/**
 * Investor question generation.
 *
 * The point of this service is to produce the questions a sharp partner will
 * actually ask about THIS deck — grounded in the slides the founder has actually
 * written. A generic list of "what is your total addressable market" is a failed
 * generation, so the model is required to cite the slide each question comes from
 * and to explain, in the rationale, why that investor would press on it.
 *
 * Every returned question is a fact-free probe: the model is told never to state
 * a number as if it knew it, only to ask for one the founder has not yet shown.
 */

const MIN_QUESTIONS = 8;
const MAX_QUESTIONS = 15;

/** Per-category shape so the model does not write eleven versions of "why now". */
const CATEGORY_BRIEF: Record<(typeof QUESTION_CATEGORIES)[number], string> = {
  MARKET:
    "sizing, segmentation, or the specific claim in the deck that a sceptical partner would demand evidence for.",
  PRODUCT:
    "what the product actually does, who uses it, and the moment it becomes indispensable.",
  COMPETITION:
    "the alternatives, the status quo, and the claim that this company wins rather than merely exists.",
  TRACTION:
    "the evidence of demand: what was measured, over what period, and what it does not prove.",
  BUSINESS_MODEL:
    "who pays, pricing, unit economics, and whether the model holds as the company scales.",
  REVENUE:
    "revenue recognised versus revenue contracted, concentration, and durability.",
  GTM:
    "the route to the first hundred customers, the sales motion, and the cost of acquiring them.",
  FINANCIALS:
    "the assumptions behind the projections, the burn, and the milestone each tranche buys.",
  TEAM:
    "why these specific people can win this specific problem, and what they have actually done.",
  FUNDRAISING:
    "the size of the ask, the use of funds, the milestone it buys, and the alternative paths considered.",
  RISKS:
    "what would have to be true for this to fail, and what would the founder do if it did.",
};

const CategoryBriefs = QUESTION_CATEGORIES.map(
  (category) => `- ${category}: ${CATEGORY_BRIEF[category]}`,
).join("\n");

/** Clamped so a bad request can never ask for an unbounded generation. */
export function normalizeQuestionCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return MIN_QUESTIONS;
  }

  return Math.min(Math.max(Math.round(value), 3), MAX_QUESTIONS);
}

/** True when two questions are close enough that regenerating would duplicate. */
function isDuplicate(candidate: string, existing: readonly string[]): boolean {
  const normalise = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

  const target = normalise(candidate);

  return existing.some((question) => {
    const other = normalise(question);
    if (other === target) return true;
    // A shared opening of several words means the same probe in other words.
    const opening = target.split(" ").slice(0, 6).join(" ");
    return opening.length > 18 && other.startsWith(opening);
  });
}

function buildAgent(count: number, existingCount: number) {
  return defineAgent<{ questions: InvestorQuestionAi[] }>({
    name: "InvestorQuestionGenerator",
    model: REASONING_MODEL,
    instructions: `You are a venture partner preparing for a first meeting with the founder whose deck you are about to read. You are going to ask them the questions that decide whether you take the meeting.

You will be given the COMPLETE deck. Every question must come from this deck.
A question that any deck could receive — "what is your total addressable market",
"who is your target customer" — is a failure. Read the actual slides, find the
specific claim that is unproven, thin, or self-serving, and ask about THAT.

Difficulty 1–5 is how hard the question is to answer well:
- 1–2: you can answer it straight from a slide.
- 3: you need a number that is not in the deck.
- 4–5: it exposes a real risk, and a careless answer gets you into trouble.

Cover these categories, spreading across them rather than piling into one:
${CategoryBriefs}

For each question return:
- question: what the investor would actually say out loud. One or two sentences.
- category: exactly one category from the list above.
- rationale: why an investor may ask this about THIS deck — cite the slide
  number and name what in the deck triggers it.
- slideRef: the slide this relates to, formatted "Slide 4 — Traction", or null
  when the question spans the deck.
- difficulty: 1–5.

NEVER answer your own question, and never assert a fact about this company that
the deck does not state. Asking for a number you do not have is the point. If a
question can only be built on information the deck does not contain, ask for that
information by name ("What is your monthly net revenue retention?") rather than
supplying a plausible value.

Produce ${count} questions.${existingCount > 0 ? " These must be NEW — do not repeat any question below." : ""}

${GROUNDING_RULES}`,
    schema: InvestorQuestionListSchema,
  });
}

/**
 * Generate deck-grounded investor questions.
 *
 * `exclude` is every question the deck already has. Duplicates are dropped after
 * generation rather than trusted to the model, because a repeated question in a
 * practice list reads as a bug.
 */
export async function generateInvestorQuestions(input: {
  context: DeckContext;
  count?: number;
  exclude?: readonly string[];
}): Promise<InvestorQuestionAi[]> {
  const count = normalizeQuestionCount(input.count);
  const exclude = input.exclude ?? [];

  const agent = buildAgent(count, exclude.length);

  const output = await runStructured(
    agent,
    [
      "Ask the founder the questions that decide this meeting, based on the deck below.",
      "",
      formatDeckForPrompt(input.context),
      ...(exclude.length > 0
        ? [
            "",
            "QUESTIONS ALREADY ASKED — do not repeat these:",
            ...exclude.map((question, index) => `${index + 1}. ${question}`),
          ]
        : []),
    ].join("\n"),
  );

  const fresh: InvestorQuestionAi[] = [];

  for (const question of output.questions) {
    if (fresh.length >= count) break;
    if (isDuplicate(question.question, [...exclude, ...fresh.map((q) => q.question)])) {
      continue;
    }
    fresh.push(question);
  }

  return fresh;
}
