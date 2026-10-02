import {
  defineAgent,
  GROUNDING_RULES,
  REASONING_MODEL,
  runStructured,
} from "@/lib/ai/agent";
import { formatDeckForPrompt, type DeckContext } from "@/lib/ai/deck-context";
import {
  AnswerEvaluationSchema,
  EVALUATION_DIMENSIONS,
  type AnswerEvaluation,
} from "@/lib/schemas/investor-questions";

/**
 * Answer evaluation for Q&A practice.
 *
 * The founder speaks this answer in a real room, so the job is to make the next
 * one better — not to make the founder feel bad. The scoring is only useful if it
 * is honest about what a listener actually does: stops following, asks for proof,
  or forgets the answer afterwards.
 *
 * The single most important constraint: the suggested answer must never contain a
 * fact the founder has not already supplied. The model is a coach, not a source of
 * numbers. Anything the answer should have contained but did not belongs in
 * `dataNeeded`, so the founder goes and gets it.
 */

const DIMENSION_BRIEF: Record<(typeof EVALUATION_DIMENSIONS)[number], string> = {
  clarity:
    "Could a listener who has never met the founder follow it on first hearing, in one pass? Penalise jargon, hedging and sentences with two ideas in them.",
  specificity:
    "Does it name concrete things — the mechanism, the customer, the constraint, the exact position — rather than describing a category in general terms?",
  evidence:
    "Does it back the claim with something checkable the deck already contains, or with a number the founder has actually stated? An unsupported assertion scores low here.",
  relevance:
    "Does it answer the question that was asked, rather than the adjacent question the founder would rather answer?",
  conciseness:
    "Does it land in the length a real answer can hold? An investor's attention drops fast — do not reward length.",
};

const DimensionBriefs = EVALUATION_DIMENSIONS.map(
  (dimension) => `- ${dimension}: ${DIMENSION_BRIEF[dimension]}`,
).join("\n");

const evaluationAgent = defineAgent<AnswerEvaluation>({
  name: "AnswerCoach",
  model: REASONING_MODEL,
  instructions: `You are coaching a founder who has just answered an investor's question out loud. You can hear the answer and you can see the deck the investor was looking at.

Score the answer on five dimensions, each 0–10:
${DimensionBriefs}

Scoring rules:
- Score what was said, not what was intended, and not what could have been said.
- A dimension with no feedback is a dimension you did not evaluate. Every one of
  the five needs a specific, concrete sentence a coach would actually say.
- Do not average the dimensions into the overall score mechanically. If one
  dimension is broken — typically evidence — the answer is not a 90 just because
  the prose was nice.

Then write:
- whatWorked: up to six specific things the founder should keep exactly as they
  are. Be concrete; do not write "good answer".
- whatNeedsImprovement: up to six specific things to change, phrased as actions.
- suggestedAnswer: a stronger answer to THIS question. It is a suggestion of
  structure and emphasis, never a source of facts.
- dataNeeded: the specific facts the founder should have ready but did not
  provide.

The suggested answer is the hard one. It may only use facts that are actually
present — in the founder's own answer, or on the slides of this deck. You must
NEVER invent a number, a customer, a date, a revenue figure or a market size, and
you must never write a specific claim as if it were established fact.

Where the answer needs a number the founder has not given, write the SENTENCE
SHAPE and name the missing fact in dataNeeded instead of filling the blank. For
example: "Here you state the month-over-month growth you have measured and the
period it covers — the deck does not currently contain that figure, so bring it
before the meeting." That is a suggestion about structure and emphasis, which the
founder can adapt to the true facts.

${GROUNDING_RULES}`,
  schema: AnswerEvaluationSchema,
});

export type EvaluateAnswerInput = {
  context: DeckContext;
  question: string;
  /** Why an investor asks this — helps the coach judge relevance. */
  rationale?: string | null;
  slideRef?: string | null;
  answer: string;
};

/** Evaluate one practice answer against the deck it came from. */
export async function evaluatePracticeAnswer(
  input: EvaluateAnswerInput,
): Promise<AnswerEvaluation> {
  return runStructured(
    evaluationAgent,
    [
      "Here is the deck the investor was looking at.",
      "",
      formatDeckForPrompt(input.context),
      "",
      "—",
      "",
      `INVESTOR QUESTION: ${input.question}`,
      input.rationale ? `Why they ask it: ${input.rationale}` : null,
      input.slideRef ? `Related slide: ${input.slideRef}` : null,
      "",
      `FOUNDER'S ANSWER:\n${input.answer}`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  );
}

/**
 * Parse an evaluation payload that came back out of the database.
 * `QuestionAttempt.payload` is an untyped JSON column, so nothing rendered from
 * it may be trusted until it has been through the schema.
 */
export function parseStoredEvaluation(payload: unknown): AnswerEvaluation | null {
  const parsed = AnswerEvaluationSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
