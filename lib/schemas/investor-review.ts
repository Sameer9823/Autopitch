import { z } from "zod";

/**
 * AI Investor Review output schema.
 *
 * The numeric score is only a summary. The substance of this feature is the
 * reasoning: every issue carries why it matters and a concrete fix, and every
 * missing item is explicitly labelled as data the founder must supply.
 */

export const REVIEW_CATEGORIES = [
  "problem",
  "solution",
  "market",
  "product",
  "businessModel",
  "traction",
  "competition",
  "moat",
  "gtm",
  "financials",
  "team",
  "ask",
  "narrative",
  "visualCommunication",
] as const;

export const ReviewCategorySchema = z.enum(REVIEW_CATEGORIES);
export type ReviewCategory = z.infer<typeof ReviewCategorySchema>;

export const CategoryScoreSchema = z.object({
  category: ReviewCategorySchema,
  /** 0–10 */
  score: z.number().int().min(0).max(10),
  rationale: z.string().min(1).max(600),
});

export const ReviewIssueSchema = z.object({
  title: z.string().min(1).max(160),
  /** Why an investor would care about this gap. */
  whyItMatters: z.string().min(1).max(600),
  /** A concrete, actionable fix. */
  recommendation: z.string().min(1).max(600),
  category: ReviewCategorySchema,
  /** Slide order (1-based) this refers to, when it maps to one slide. */
  slideOrder: z.number().int().min(1).max(60).nullable(),
  severity: z.enum(["low", "medium", "high"]),
  /** True when the issue is absent information rather than a present weakness. */
  dataNeeded: z.boolean().default(false),
});

export const SlideVerdictSchema = z.object({
  slideOrder: z.number().int().min(1).max(60),
  title: z.string().min(1).max(160),
  verdict: z.enum(["strong", "adequate", "weak"]),
  reason: z.string().min(1).max(500),
});

export const ConcernSchema = z.object({
  concern: z.string().min(1).max(400),
  /** Which investor(s) are likely to raise this, and on what basis. */
  raisedBy: z.string().min(1).max(300).nullable(),
  category: ReviewCategorySchema,
  suggestedResponse: z.string().min(1).max(500),
});

export const PitchReviewSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  /** One line an investor would say after a first read. */
  summary: z.string().min(1).max(800),
  categoryScores: z.array(CategoryScoreSchema).min(1).max(20),
  strongestSlides: z.array(SlideVerdictSchema).max(10),
  weakestSlides: z.array(SlideVerdictSchema).max(10),
  /** Things the deck does not cover at all. */
  missingInformation: z.array(ReviewIssueSchema).max(15),
  issues: z.array(ReviewIssueSchema).max(30),
  investorConcerns: z.array(ConcernSchema).max(15),
  recommendedChanges: z.array(z.string().min(1).max(400)).max(20),
});

export type PitchReview = z.infer<typeof PitchReviewSchema>;
