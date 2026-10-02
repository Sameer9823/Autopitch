import { z } from "zod";

/** Question categories must stay in sync with the Prisma QuestionCategory enum. */
export const QUESTION_CATEGORIES = [
  "MARKET",
  "PRODUCT",
  "COMPETITION",
  "TRACTION",
  "BUSINESS_MODEL",
  "REVENUE",
  "GTM",
  "FINANCIALS",
  "TEAM",
  "FUNDRAISING",
  "RISKS",
] as const;

export const QuestionCategorySchema = z.enum(QUESTION_CATEGORIES);
export type QuestionCategory = z.infer<typeof QuestionCategorySchema>;

export const InvestorQuestionSchema = z.object({
  question: z.string().min(10).max(500),
  category: QuestionCategorySchema,
  /** Why an investor may ask this — grounded in the actual deck. */
  rationale: z.string().min(1).max(500),
  /** Human-readable slide reference, e.g. "Slide 4 — Traction". */
  slideRef: z.string().max(160).nullable(),
  difficulty: z.number().int().min(1).max(5),
});

export const InvestorQuestionListSchema = z.object({
  questions: z.array(InvestorQuestionSchema).min(3).max(20),
});

export type InvestorQuestionAi = z.infer<typeof InvestorQuestionSchema>;

// ---------------------------------------------------------------------------
// Answer evaluation
// ---------------------------------------------------------------------------

export const EVALUATION_DIMENSIONS = [
  "clarity",
  "specificity",
  "evidence",
  "relevance",
  "conciseness",
] as const;

export const EvaluationDimensionSchema = z.enum(EVALUATION_DIMENSIONS);
export type EvaluationDimension = z.infer<typeof EvaluationDimensionSchema>;

export const DimensionScoreSchema = z.object({
  dimension: EvaluationDimensionSchema,
  /** 0–10 */
  score: z.number().int().min(0).max(10),
  feedback: z.string().min(1).max(400),
});

export const AnswerEvaluationSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  dimensionScores: z.array(DimensionScoreSchema).min(5).max(5),
  /** Concrete positives the founder should keep. */
  whatWorked: z.array(z.string().min(1).max(300)).max(6),
  whatNeedsImprovement: z.array(z.string().min(1).max(300)).max(6),
  /** A model answer, clearly presented as a suggestion not a fact. */
  suggestedAnswer: z.string().min(1).max(1500),
  /** Facts the founder must have ready but did not provide. */
  dataNeeded: z.array(z.string().min(1).max(200)).max(6),
});

export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;
