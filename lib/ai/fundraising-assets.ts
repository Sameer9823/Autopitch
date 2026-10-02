import {
  defineAgent,
  GROUNDING_RULES,
  runStructured,
} from "@/lib/ai/agent";
import { formatDeckForPrompt, type DeckContext } from "@/lib/ai/deck-context";
import {
  AssetTypeSchema,
  FundraisingAssetSchema,
  type AssetType,
  type FundraisingAssetAi,
} from "@/lib/schemas/content";

/**
 * Fundraising kit generation.
 *
 * The kit is derived, never re-entered. Every asset is written from the same
 * startup context the deck is built from — startup name, product, problem,
 * market, business model, traction, team and ask — so a founder who has already
 * built a deck never types that information twice. A founder without a deck can
 * pass a short brief instead; the same grounding rules apply, and anything the
 * brief does not cover is reported as a gap rather than invented.
 *
 * Each asset type gets its own length and format constraint, because "write an
 * investor document" produces six uselessly similar drafts: a cold email that
 * reads like a memo, an elevator pitch that runs four minutes.
 */

/**
 * Client-safe asset labels live in a leaf module so the fundraising kit UI can
 * import them without pulling the OpenAI Agents SDK into the browser bundle.
 * They are re-exported here for the server callers that already import from
 * this file.
 */
import { ASSET_TYPE_LABELS } from "@/lib/fundraising/shared";

export {
  ASSET_TYPE_LABELS,
  ASSET_TYPE_BLURBS,
} from "@/lib/fundraising/shared";

type AssetBrief = {
  /** What the founder will actually send or say. */
  purpose: string;
  /** Hard length target, so the output is usable as written. */
  length: string;
  /** Required structure. */
  structure: string;
  /** Register and tone rules specific to this asset. */
  voice: string;
};

const ASSET_BRIEFS: Record<AssetType, AssetBrief> = {
  ONE_PAGER: {
    purpose:
      "A single page a partner can read in ninety seconds and forward without editing. It has to survive being forwarded with no context.",
    length:
      "450–650 words total. Use short sections; no section may exceed 120 words.",
    structure:
      "Markdown headings in this order: Company, Problem, Solution, Product, Traction, Market, Business Model, Team, The Ask. Under Traction, use a bullet list of the deck's actual numbers. Under Market, state the deck's own sizing and how it was reached. End with a single closing line.",
    voice:
      "Third person, present tense, declarative. No adjectives that are not earned by a fact. No 'we are excited'.",
  },
  EXECUTIVE_SUMMARY: {
    purpose:
      "A memo for a partner who will not read the deck. They read this and decide whether to take the meeting.",
    length: "300–450 words, in four to six short paragraphs.",
    structure:
      "Markdown. Open with the one-sentence thesis. Then: what the company does, why now, the proof in traction, how it makes money, and the specific ask with the amount. No headings except an optional 'The ask' at the end.",
    voice:
      "Written to be pasted into an email unchanged. Plain, specific, no bullet fragments longer than one line.",
  },
  COLD_EMAIL: {
    purpose:
      "A first email to an investor who has never heard of the company and is reading twenty of these today.",
    length:
      "90–130 words in the body, plus a subject line of 6 words or fewer. Hard limit: the whole email must fit on a phone screen.",
    structure:
      "Markdown. First line exactly 'Subject: …'. Then the body: one sentence on who they are or why you are writing to them (generic is fine and honest — never invent a connection), two sentences on the company, one specific proof point from the deck, one clear ask, one short sign-off. No subject alternatives, no PS.",
    voice:
      "Direct and unembarrassed. No flattery, no 'I hope this finds you well', no paragraph about the market. Every sentence must earn the next one.",
  },
  ELEVATOR_PITCH: {
    purpose:
      "What the founder says when someone in a hallway asks 'so what do you do?' They have about thirty seconds.",
    length:
      "70–90 words. That is roughly thirty seconds spoken aloud. Do not exceed 90 words.",
    structure:
      "Prose only. No headings, no bullets, no stage directions, no bracketed notes. Three beats in order: the problem, what the company does about it, the proof or the ask.",
    voice:
      "Spoken English. Short sentences. Contractions are fine. It must be sayable in one breath per sentence.",
  },
  MEETING_SCRIPT: {
    purpose:
      "A run of sheet for a 25-minute first investor meeting, including the questions that will be asked back.",
    length:
      "1,100–1,600 words of spoken script. Timed sections, listed below.",
    structure:
      "Markdown headings with the duration in the heading, in this order: Opening (60s), Problem (3m), Product (5m), Traction (4m), Market (4m), Business Model (3m), Team (2m), The Ask (2m), Close (1m). Under each heading write the actual words to say, in prose a person can speak. Finish with a '## Likely questions' section: 4–6 bullets, each the investor's question in their words, followed by the one-paragraph answer.",
    voice:
      "Spoken word, not written prose. No bullet fragments inside the script itself. The founder should be able to read it aloud from the page without rewriting.",
  },
  LANDING_PAGE: {
    purpose:
      "The top of the page a stranger lands on from a link in the meeting, or from a forwarded email.",
    length:
      "250–400 words of copy, structured for a page rather than a document.",
    structure:
      "Markdown headings in order: Hero (an H1 headline of 6 words or fewer, then a subhead of 20 words or fewer), What it does (three short benefit sections, each a heading and two sentences, benefits before features), Proof (the deck's real traction in one line each), FAQ (three question-and-answer pairs). Finish with a single call to action line.",
    voice:
      "Marketing register, but restrained and specific — the reader is a sceptic who clicked a link, not a browsing tourist. No exclamation marks, no 'revolutionise', no 'seamless'.",
  },
};

const assetAgent = defineAgent<FundraisingAssetAi>({
  name: "FundraisingAssetWriter",
  instructions: `You write the fundraising documents a founder sends around a raise. You are given the company's own material and you write from it — you never research, never estimate and never fill a hole with a plausible number.

For every asset return:
- title: a short document title for the founder's own library (max 160 characters). Not a headline for the document.
- content: the document itself, in Markdown, obeying the length and structure you are given for this asset type.
- hasGaps: true when the source material is missing a fact this document needs.
- gaps: up to 8 short phrases naming exactly what the founder must supply ("ARR for the last two quarters").

When hasGaps is true you must also end content with a section headed exactly "## Data needed" containing one "- " bullet per gap, each stating what to add and where. Inside the document body, where a missing fact belongs, write "Data needed" in place of the fact — never a guess, never a range, never a hedge like "approximately".

Style across every asset:
- Concrete and plain. Prefer the deck's own numbers and nouns over adjectives.
- Never invent a metric, customer name, market size, date, competitor, or funding history.
- Never address a named investor, and never claim a personal connection you were not given.
- If the material is thin, write the strongest honest version and report the gaps rather than padding.

${GROUNDING_RULES}`,
  schema: FundraisingAssetSchema,
});

/** Build the grounding text shared by every asset type. */
function grounding(context: DeckContext): string {
  return formatDeckForPrompt(context);
}

function buildPrompt(
  type: AssetType,
  brief: AssetBrief,
  source: string,
  sourceLabel: string,
): string {
  return [
    `Write the ${ASSET_TYPE_LABELS[type].toUpperCase()} for this company.`,
    "",
    `PURPOSE`,
    brief.purpose,
    "",
    `LENGTH`,
    brief.length,
    "",
    `STRUCTURE`,
    brief.structure,
    "",
    `VOICE`,
    brief.voice,
    "",
    "—",
    "",
    `SOURCE MATERIAL — ${sourceLabel}. This is everything you know about the company.`,
    source,
    "",
    "—",
    "",
    "Write the document now.",
  ].join("\n");
}

/**
 * Generate one fundraising asset from a deck.
 *
 * `context` must come from a deck the caller has already authorized; this
 * function never looks a deck up by id.
 */
export async function generateFundraisingAssetFromDeck(input: {
  type: AssetType;
  context: DeckContext;
}): Promise<FundraisingAssetAi> {
  return runStructured(
    assetAgent,
    buildPrompt(
      AssetTypeSchema.parse(input.type),
      ASSET_BRIEFS[input.type],
      grounding(input.context),
      "the founder's pitch deck",
    ),
  );
}

/**
 * Generate one fundraising asset from a short written brief.
 *
 * The workspace-level path for a founder who has not built a deck yet. The
 * brief is treated with exactly the same suspicion as a deck: what it does not
 * say is a gap, not an invitation to guess.
 */
export async function generateFundraisingAssetFromBrief(input: {
  type: AssetType;
  brief: string;
}): Promise<FundraisingAssetAi> {
  return runStructured(
    assetAgent,
    buildPrompt(
      AssetTypeSchema.parse(input.type),
      ASSET_BRIEFS[input.type],
      input.brief.trim(),
      "the founder's written brief, which is the ONLY material available — this company has no pitch deck yet",
    ),
  );
}

/** Regenerate an existing asset, optionally steering the rewrite. */
export async function regenerateFundraisingAsset(input: {
  type: AssetType;
  source: string;
  sourceLabel: string;
  previous: string;
  instruction?: string;
}): Promise<FundraisingAssetAi> {
  const steer = input.instruction?.trim()
    ? `\n\nThe founder asked for this revision: "${input.instruction.trim()}"`
    : "";

  return runStructured(
    assetAgent,
    `${buildPrompt(
      input.type,
      ASSET_BRIEFS[input.type],
      input.source,
      input.sourceLabel,
    )}\n\n—\n\nA PREVIOUS VERSION OF THIS DOCUMENT EXISTS. Keep anything in it that is still correct and true to the source material; fix and improve the rest. Do not carry over a fact the source material does not support.\n\n${input.previous}${steer}`,
  );
}
