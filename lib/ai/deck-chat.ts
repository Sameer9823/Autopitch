import {
  defineAgent,
  GROUNDING_RULES,
  type StructuredAgent,
} from "@/lib/ai/agent";
import { formatChatForPrompt, type ChatMessage } from "@/lib/ai/chat-history";
import { formatDeckForPrompt, type DeckContext } from "@/lib/ai/deck-context";
import { prisma } from "@/lib/db";
import { DeckChatReplySchema, type DeckChatReply } from "@/lib/schemas/content";
import { streamStructured, type StreamEvent } from "@/lib/ai/stream";
import { diffSnapshots, parseSnapshot, type VersionDiff } from "@/lib/versions/snapshot";

/**
 * Chat with Deck.
 *
 * The deck IS the knowledge base. Every turn is answered from one deck context
 * that the caller has just loaded through `requireDeck(deckId, user.id)`, so a
 * question can never be answered from — or leak into — another founder's deck.
 * The context is rebuilt per turn rather than cached, which is what makes a
 * mid-conversation deck edit visible in the next answer.
 *
 * The assistant never mutates the deck. A "rewrite this slide" answer contains
 * the replacement copy and points the founder at the editor; accepting it is a
 * separate, explicit action in the editor.
 */

const deckChatAgent: StructuredAgent<DeckChatReply> = defineAgent<DeckChatReply>({
  name: "DeckAnalyst",
  instructions: `You are the RAISEVIA analyst for ONE startup investor pitch deck. The deck below is the only thing you know. You are talking to the founder who wrote it, so be direct and specific.

How to answer:
- Ground every claim in the deck. Quote or paraphrase the slide you are relying on, and name the slide number.
- "referencedSlides" must contain only slide numbers that actually exist in this deck. Use [] when your answer is not about a specific slide.
- If the deck does not contain what the founder asked about, say so in one plain sentence, set "dataNeeded" to true, and list in "suggestedActions" exactly what the founder must supply. Never guess.
- If the founder asks what is missing, incomplete, or weak, audit the deck slide by slide and be candid. Name the slides, not "some slides".
- If the founder asks for investor questions, write the actual questions an investor would ask, each with why they would ask it, and only where the deck gives them something to press on.
- If the founder asks you to rewrite or improve a slide, write the complete replacement copy inside "answer" (title, then the body, in Markdown) so they can paste it straight in. Then say plainly that you have NOT changed the deck and that the change is applied in the editor. Never claim to have edited anything.
- "suggestedActions" holds 0–3 concrete next steps as short imperative sentences ("Cut the market slide to three lines."). Use [] when nothing would help.

Format of "answer":
- Markdown. Short paragraphs, "- " for bullets, "**bold**" for the key phrase.
- Start with the point, not with a restatement of the question.
- No headings above level 3, no "Sure!", no sign-off.

${GROUNDING_RULES}`,
  schema: DeckChatReplySchema,
});

/**
 * Clickable starter prompts shown in the empty state.
 *
 * Re-exported from `lib/chat/shared` so the chat panel can import them without
 * pulling Prisma and the OpenAI SDK into the browser bundle.
 */
export { CHAT_SUGGESTIONS, type ChatSuggestion } from "@/lib/chat/shared";

/**
 * True when the founder is asking about version history.
 *
 * Grounding a version question in anything other than the real diff would
 * invite the model to describe changes that never happened, so the route only
 * attaches version context when the intent is genuinely there.
 */
export function isVersionComparisonIntent(question: string): boolean {
  const normalized = question.toLowerCase();

  return (
    /previous version|last version|prior version|earlier version|old version|version history/.test(
      normalized,
    ) ||
    (/\bversion\b/.test(normalized) &&
      /compare|difference|diff|changed|what did i change/.test(normalized))
  );
}

export type VersionComparison = {
  /** False when the deck has fewer than two saved versions. */
  available: boolean;
  /** Prompt-ready description of the real diff, or "" when unavailable. */
  section: string;
};

/**
 * Load the last two saved versions and describe the actual difference between
 * them, using the same `parseSnapshot` / `diffSnapshots` helpers the Versions
 * page renders — so chat and the history UI can never disagree.
 */
export async function loadVersionComparison(
  deckId: string,
): Promise<VersionComparison> {
  const versions = await prisma.deckVersion.findMany({
    where: { deckId },
    orderBy: { number: "desc" },
    take: 2,
    select: { number: true, summary: true, snapshot: true, createdAt: true },
  });

  if (versions.length < 2) {
    return { available: false, section: "" };
  }

  const [current, previous] = versions;

  let diff: VersionDiff;

  try {
    diff = diffSnapshots(parseSnapshot(previous.snapshot), parseSnapshot(current.snapshot));
  } catch {
    return { available: false, section: "" };
  }

  return {
    available: true,
    section: formatVersionDiff(current.number, previous.number, diff),
  };
}

/** Truncate a diff value so a long body does not dominate the prompt. */
function shorten(value: string | null, limit = 240): string {
  if (!value) {
    return "(empty)";
  }

  const single = value.replace(/\s+/g, " ").trim();
  return single.length > limit ? `${single.slice(0, limit)}…` : single;
}

function formatVersionDiff(
  currentNumber: number,
  previousNumber: number,
  diff: VersionDiff,
): string {
  const lines = [
    `VERSION HISTORY (from version ${currentNumber} against version ${previousNumber})`,
    `Slides added: ${diff.addedSlides}. Removed: ${diff.removedSlides}. Changed: ${diff.changedSlides}.`,
  ];

  for (const change of diff.metaChanges) {
    lines.push(
      `Deck ${change.label}: "${shorten(change.before, 80)}" → "${shorten(change.after, 80)}"`,
    );
  }

  for (const slide of diff.slides.slice(0, 12)) {
    if (slide.status === "added") {
      lines.push(`Slide ${slide.order} was ADDED: "${slide.title}"`);
      continue;
    }

    if (slide.status === "removed") {
      lines.push(`Slide ${slide.order} was REMOVED: "${slide.title}"`);
      continue;
    }

    lines.push(`Slide ${slide.order} "${slide.title}" changed:`);

    for (const change of slide.changes.slice(0, 5)) {
      lines.push(
        `  - ${change.label}: "${shorten(change.before)}" → "${shorten(change.after)}"`,
      );
    }
  }

  if (diff.slides.length > 12) {
    lines.push(`…and ${diff.slides.length - 12} more changed slides.`);
  }

  lines.push(
    "This is the complete, factual record of what changed. Describe only these changes — do not speculate about edits that are not listed.",
  );

  return lines.join("\n");
}

const NO_VERSION_SECTION = `VERSION HISTORY
The founder asked about a previous version, but this deck has fewer than two saved versions, so there is no earlier state to compare against. Say so plainly in one sentence and explain that a comparison becomes available once the deck has been saved to version history at least twice.`;

/**
 * Assemble the model prompt for one turn.
 *
 * Exported so the composition is inspectable without running the model: deck
 * first (the source of truth), then version history when relevant, then the
 * conversation, then the question.
 */
export function buildChatPrompt(input: {
  context: DeckContext;
  history: ChatMessage[];
  question: string;
  versionComparison: VersionComparison;
}): string {
  const { context, history, question, versionComparison } = input;

  const sections = [
    "THE DECK — the only source of information you may use.",
    formatDeckForPrompt(context),
  ];

  if (isVersionComparisonIntent(question)) {
    sections.push(
      "—",
      versionComparison.available
        ? versionComparison.section
        : NO_VERSION_SECTION,
    );
  }

  const conversation = formatChatForPrompt(history);

  if (conversation) {
    sections.push("—", "EARLIER IN THIS CONVERSATION", conversation);
  }

  sections.push(
    "—",
    "FOUNDER'S QUESTION",
    question,
    "",
    "Answer it now, grounded only in the deck above.",
  );

  return sections.join("\n\n");
}

/**
 * Answer one question about one deck, streamed.
 *
 * Yields the same `StreamEvent` frames as any other streaming route so the
 * chat UI can render the prose progressively and then swap in the validated
 * metadata (slide references, data-needed flag, suggested actions).
 */
export function streamDeckChatReply(input: {
  context: DeckContext;
  history: ChatMessage[];
  question: string;
  versionComparison: VersionComparison;
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent<DeckChatReply>> {
  return streamStructured({
    agent: deckChatAgent,
    prompt: buildChatPrompt(input),
    signal: input.signal,
  });
}
