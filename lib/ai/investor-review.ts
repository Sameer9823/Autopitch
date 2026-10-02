import {
  defineAgent,
  GROUNDING_RULES,
  REASONING_MODEL,
  runStructured,
} from "@/lib/ai/agent";
import { formatDeckForPrompt, type DeckContext } from "@/lib/ai/deck-context";
import {
  ConcernSchema,
  PitchReviewSchema,
  ReviewIssueSchema,
  REVIEW_CATEGORIES,
  SlideVerdictSchema,
  type PitchReview,
  type ReviewCategory,
} from "@/lib/schemas/investor-review";
import { z } from "zod";

/**
 * AI Investor Review.
 *
 * This service reads the COMPLETE deck exactly once and returns one structured
 * review. It never writes to the deck: the caller persists the validated payload
 * on a `PitchReview` row and mirrors the score onto `Deck.pitchScore`.
 *
 * The single hardest rule here is grounding. The model is told, in our own words
 * as well as in `GROUNDING_RULES`, that a missing fact must be reported as a
 * labelled "Data needed" gap rather than filled in. A review that invents a
 * retention number is worse than no review at all, because the founder will
 * present it.
 */

/**
 * What a serious investor actually tests in each category.
 *
 * Kept explicit so the model judges each one against a real standard instead of
 * producing fourteen variations of "looks good".
 */
const CATEGORY_BRIEF: Record<ReviewCategory, string> = {
  problem:
    "Is the pain specific, credible and expensive enough that someone would pay to solve it?",
  solution:
    "Does the proposed solution address the stated problem, or a substitute problem?",
  market:
    "Is there a market definition and a sizing method an investor could defend?",
  product:
    "Does the deck show what the product actually is and why it is usable?",
  businessModel:
    "Is it clear who pays, how much, and why that is a viable economic model?",
  traction:
    "Is there evidence of real demand — and is the evidence honest and dated?",
  competition:
    "Are alternatives named, including the status quo of doing nothing?",
  moat:
    "Is there a reason this business is hard to copy that compounds over time?",
  gtm:
    "Is there a credible, specific path to the first hundred customers?",
  financials:
    "Are projections or unit economics present, with assumptions a reader can see?",
  team:
    "Do the people shown explain why THIS team can win THIS problem?",
  ask:
    "Is the amount, the use of funds and the milestone it buys all stated?",
  narrative:
    "Do the slides tell one coherent founder → problem → market → traction → ask story, in that order, without a gap in the middle?",
  visualCommunication:
    "Does the deck read like a document a serious investor would take seriously — one idea per slide, legible type, no walls of text, no placeholder numbers left visible?",
};

const CATEGORY_LIST = REVIEW_CATEGORIES.map(
  (category) => `- ${category}: ${CATEGORY_BRIEF[category]}`,
).join("\n");

const reviewAgent = defineAgent<PitchReview>({
  name: "InvestorReviewer",
  model: REASONING_MODEL,
  instructions: `You are a partner at a venture fund reading this pitch deck for the very first time, before the first meeting. Your job is to tell the founder the truth about how the deck will land, and exactly what to fix.

SCORING IS A SUMMARY — THE REASONING IS THE DELIVERABLE.
- The number exists to rank a deck, not to justify itself. Never pad, soften or
  inflate the narrative so that it lines up with a score you already had in mind.
- Write the reasoning first in your head, then let the score follow it. If the
  analysis is unflattering, a high score is a lie.
- A low score with sharp, specific, correct reasoning is far more useful to this
  founder than a generous score with vague praise.

GROUNDING — THIS IS THE WHOLE POINT.
- Judge ONLY what the deck actually contains. You are given the complete deck.
- Never invent a metric, a customer name, a revenue figure, a market size, a
  date, a growth rate, a funding history or a team credential. Not as an example,
  not as an illustration, not in a suggested sentence.
- When the information you need is absent, put it in "missingInformation" with
  "dataNeeded": true, and put the label "Data needed" in front of the title, e.g.
  "Data needed: no pricing or unit economics anywhere in the deck".
- A recommendation may say which kind of number belongs on a slide, but must
  never state a number the founder has not supplied.

WHAT TO PRODUCE
- categoryScores: exactly one entry for every one of these categories, each with
  a 0–10 score and a rationale that cites specific slide numbers. Judge each one
  against the test given against it:
${CATEGORY_LIST}
- summary: the one line an investor would say out loud after a first read.
- strongestSlides / weakestSlides: real slide numbers from the deck, each with a
  verdict of "strong", "adequate" or "weak" and a reason. Never cite a slide that
  does not exist.
- missingInformation: what a reader needs and the deck does not supply. Every
  entry has "dataNeeded": true.
- issues: weaknesses that are present in the deck, as problems that already exist.
  Set "dataNeeded": false for these and reserve it for absent information.
- investorConcerns: the objections a sharp investor will raise in the room, who is
  likely to raise them, and how the founder could respond to each one.
- recommendedChanges: the ordered shortlist of what to do next, most valuable
  first.

EVERY ISSUE MUST ANSWER THREE QUESTIONS, and the three answers are separate
fields — do not merge them:
- title: the issue, stated plainly.
- whyItMatters: what an investor concludes, asks or stops believing as a result.
- recommendation: the concrete change to make, specific enough to act on today.
  "Tighten the headline" is not a recommendation. "Replace the tagline with the
  mechanism — what the product actually does — so the slide explains itself" is.

Judge "narrative" and "visualCommunication" as carefully as any other category:
does the deck hold together as one argument, and does it look like a document a
serious fund would take seriously?

${GROUNDING_RULES}`,
  schema: PitchReviewSchema,
});

/**
 * Derived display types for the pieces of a review.
 *
 * `lib/schemas/investor-review.ts` is owned by another module and deliberately
 * exports schemas plus `PitchReview` only. The UI needs these three nested
 * shapes on their own, so they are derived here once rather than re-derived with
 * `z.infer` in every component. Consumers import them with `import type`, which
 * is erased at compile time and keeps the OpenAI SDK out of the client bundle.
 */
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;
export type SlideVerdict = z.infer<typeof SlideVerdictSchema>;
export type Concern = z.infer<typeof ConcernSchema>;

/**
 * Run the investor review over a whole deck.
 *
 * The caller must have already proved the deck belongs to the requesting user —
 * this function only reshapes and analyses, it never fetches.
 */
export async function runPitchReview(input: {
  context: DeckContext;
}): Promise<PitchReview> {
  return runStructured(reviewAgent, formatDeckForPrompt(input.context));
}

/**
 * Parse a review payload that came back out of the database.
 *
 * `PitchReview.payload` is an untyped JSON column, so nothing rendered from it may
 * be trusted until it has been through the same schema the model was held to.
 * Returns null for a review that is absent, unfinished or unreadable, which is
 * what lets the UI show a clean empty state instead of a crash.
 */
export function parseStoredReview(payload: unknown): PitchReview | null {
  const parsed = PitchReviewSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

