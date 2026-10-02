import { z } from "zod";

/**
 * Speaker notes are authored, not copied. Each note carries a key message,
 * supporting context, the metric worth calling out, and a spoken transition —
 * so a founder reads a script, not the slide text repeated back.
 */
export const SpeakerNotesSchema = z.object({
  keyMessage: z.string().min(1).max(400),
  supportingContext: z.string().min(1).max(1200),
  /** The one number or claim to emphasise, or null if the slide has none. */
  importantMetric: z.string().max(200).nullable(),
  /** Spoken bridge into the next slide. */
  transition: z.string().min(1).max(400),
  /** 20–60 second spoken script combining the four parts above. */
  script: z.string().min(1).max(2000),
});

export type SpeakerNotes = z.infer<typeof SpeakerNotesSchema>;

// ---------------------------------------------------------------------------
// Fundraising kit
// ---------------------------------------------------------------------------

export const ASSET_TYPES = [
  "ONE_PAGER",
  "EXECUTIVE_SUMMARY",
  "COLD_EMAIL",
  "ELEVATOR_PITCH",
  "MEETING_SCRIPT",
  "LANDING_PAGE",
] as const;

export const AssetTypeSchema = z.enum(ASSET_TYPES);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const FundraisingAssetSchema = z.object({
  title: z.string().min(1).max(160),
  /** Markdown-ish body. Editable, copyable, regeneratable. */
  content: z.string().min(1).max(8000),
  /** True when the deck lacks facts this asset needs. */
  hasGaps: z.boolean(),
  /** What the founder must supply before this asset is investor-ready. */
  gaps: z.array(z.string().min(1).max(200)).max(8),
});

export type FundraisingAssetAi = z.infer<typeof FundraisingAssetSchema>;

// ---------------------------------------------------------------------------
// Import analysis (PDF / PPTX / website / text)
// ---------------------------------------------------------------------------

export const ImportAnalysisSchema = z.object({
  startupName: z.string().max(160).nullable(),
  product: z.string().max(1200).nullable(),
  problem: z.string().max(1200).nullable(),
  solution: z.string().max(1200).nullable(),
  market: z.string().max(1200).nullable(),
  businessModel: z.string().max(1200).nullable(),
  traction: z.string().max(1200).nullable(),
  team: z.string().max(1200).nullable(),
  financials: z.string().max(1200).nullable(),
  ask: z.string().max(600).nullable(),
  /** Fields the source material simply did not cover. */
  missingFields: z.array(z.string().min(1).max(120)).max(20),
  /** A normalized narrative that can seed deck generation directly. */
  idea: z.string().min(20).max(4000),
});

export type ImportAnalysis = z.infer<typeof ImportAnalysisSchema>;

// ---------------------------------------------------------------------------
// Brand kit suggestion
// ---------------------------------------------------------------------------

export const BrandKitSuggestionSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  headingFont: z.enum(["Inter", "Geist", "IBM Plex Sans", "Manrope", "Sora"]),
  bodyFont: z.enum(["Inter", "Geist", "IBM Plex Sans", "Manrope", "Sora"]),
  rationale: z.string().min(1).max(400),
});

export type BrandKitSuggestion = z.infer<typeof BrandKitSuggestionSchema>;

// ---------------------------------------------------------------------------
// Deck chat
// ---------------------------------------------------------------------------

export const DeckChatReplySchema = z.object({
  answer: z.string().min(1).max(4000),
  /** Slide orders the reply is grounded in. */
  referencedSlides: z.array(z.number().int().min(1).max(60)).max(10),
  /** True when the deck does not contain what the user asked about. */
  dataNeeded: z.boolean(),
  suggestedActions: z.array(z.string().min(1).max(200)).max(5),
});

export type DeckChatReply = z.infer<typeof DeckChatReplySchema>;
