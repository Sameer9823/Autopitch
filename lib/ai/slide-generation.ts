import { z } from "zod";

import { defineAgent, GROUNDING_RULES, runStructured } from "@/lib/ai/agent";
import { formatDeckForPrompt, type DeckContext } from "@/lib/ai/deck-context";
import { generateSpeakerNotes, formatSpeakerNotes } from "@/lib/ai/speaker-notes";
import type { SlideProposal } from "@/components/editor/helpers";
import {
  EditableSlideSchema,
  parseSlideBlocks,
  SlideBlocksSchema,
  SlideLayoutSchema,
  type EditableSlide,
  type EditorialAction,
} from "@/lib/schemas/slide";

/**
 * Single-slide AI generation.
 *
 * Every entry point here regenerates or edits EXACTLY ONE slide. Nothing in this
 * file can touch another slide, the slide order, deck metadata, brand settings
 * or another slide's image — the caller's deck context is read-only grounding,
 * and the only output is a proposed replacement for one slide's editable
 * content, which the caller persists as a PENDING revision for the founder to
 * accept or discard.
 */

const SlideRewriteOutputSchema = z.object({
  /** One line the founder reads in the "New AI Version" header. */
  summary: z.string().min(1).max(300),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(400).nullish(),
  content: z.string().max(8000),
  layout: SlideLayoutSchema.default("CONTENT"),
  blocks: SlideBlocksSchema.default([]),
  caption: z.string().max(400).nullish(),
  label: z.string().max(80).nullish(),
  imagePrompt: z.string().max(1000),
  speakerNotes: z.string().max(8000).nullish(),
  /** Facts the deck does not contain. Surfaced to the founder, never invented. */
  dataNeeded: z.array(z.string().min(1).max(200)).max(6).default([]),
});

type SlideRewriteOutput = z.infer<typeof SlideRewriteOutputSchema>;

/**
 * A proposed replacement for one slide's editable content. Never applied
 * directly — the caller stores it as a PENDING SlideRevision first.
 *
 * The shape lives with the other editor helpers so the client can type a
 * proposal without importing this module (and therefore the OpenAI SDK).
 */
export type { SlideProposal } from "@/components/editor/helpers";

const ACTION_INSTRUCTIONS: Record<Exclude<EditorialAction, "speaker_notes">, string> = {
  regenerate: `Write a complete new version of this slide. The founder asked for a fresh take: keep the slide's job in the deck narrative, but rebuild the title, the body, the structure and the blocks so it lands harder. Do not simply restate the previous version.`,
  improve: `Sharpen this slide without changing what it claims. Tighten the title, cut hedging, make every bullet earn its place, and make the structure match the layout. Keep the same underlying facts.`,
  rewrite: `Rewrite this slide in a different, better way. Keep the facts, change the framing and the phrasing entirely.`,
  shorten: `Cut this slide down. Roughly half the length. Keep only what an investor needs to remember this slide. Prefer a tight title and 2–4 short bullets over paragraphs.`,
  expand: `Add substance to this slide. Where the argument is thin, ground it in something the deck already contains and develop it. Never pad with filler, and never add a fact the deck does not have.`,
  investor_focused: `Make this slide work on a skeptical investor. Lead with the number, the proof, or the mechanism that answers "why you". State the implication of the data rather than the data itself. Address the obvious objection in a bullet.`,
  headline: `Rewrite ONLY the title. Change nothing else — same layout, same content, same blocks, same caption, same label, same imagePrompt, same speakerNotes. Give 3–6 strong alternatives the founder would actually choose between, then pick the single best one as the title. No trailing punctuation, no exclamation marks, no colons before a subtitle.`,
  visual: `Keep the slide's copy and structure. Change ONLY the imagePrompt, rewriting it as a specific, concrete visual direction for a professional slide illustration: the subject, the composition, the mood, the colour. No text inside the image. Keep it under 300 characters.`,
  chart: `Keep the slide's copy and structure. Add or replace the slide's chart: return exactly one "chart" block with a chartType, a short title, and 3–6 series points. Set the slide's layout to CHART. Every series value must come from the deck; if the deck has no numbers for this slide, emit a chart block whose points are all 0 and list what is missing in dataNeeded rather than inventing figures.`,
};

const slideAgent = defineAgent<SlideRewriteOutput>({
  name: "SlideEditor",
  instructions: `You are editing ONE slide of a startup investor pitch deck. You never touch other slides.

You will be given the full deck for context and then ONE slide to work on. Return the complete edited version of that single slide — every field, not only the ones you changed.

Field rules:
- title: 3–80 characters, sentence case, no trailing punctuation.
- subtitle: optional one-liner, max 200 characters. null when the slide does not need one.
- content: short supporting text. Use bullet-style short lines. Do not duplicate text that already appears in blocks.
- layout: choose the layout that matches the slide's job in the deck.
- blocks: structured content. METRICS slides carry "metric" blocks, CHART slides carry exactly one "chart" block, list slides carry one "bullets" block with 2–6 items. Each block must be one of: heading, body, bullets, metric, chart, caption, label.
- metric blocks: set "placeholder": true and "value": "Data needed" whenever the deck does not actually contain that number. A verified metric has placeholder absent or false.
- chart blocks: "chartType" is one of bar, line, area, pie, donut. "series" is an array of { label, value } with numeric values.
- imagePrompt: a concrete visual direction for a professional slide illustration. No text in the image.
- speakerNotes: keep the founder's existing speaker notes unless the action asks you to rewrite them. When you do change them, keep them in plain spoken text.
- caption, label: optional, null when unused.
- summary: one short line describing what you changed, written for the founder to read.
- dataNeeded: facts the deck is missing that this slide would be stronger with. Empty array if nothing is missing.

${GROUNDING_RULES}`,
  schema: SlideRewriteOutputSchema,
});

type SlideForEditing = {
  order: number;
  title: string;
  subtitle: string | null;
  content: string;
  layout: string;
  caption: string | null;
  label: string | null;
  imagePrompt: string;
  speakerNotes: string | null;
  blocks: unknown;
  /** True when the founder hand-edited this slide, so their work must survive. */
  userEdited?: boolean;
};

/** The editable content of a slide, as the AI sees it. */
function currentEditable(slide: SlideForEditing): EditableSlide {
  return EditableSlideSchema.parse({
    title: slide.title,
    subtitle: slide.subtitle,
    content: slide.content,
    layout: slide.layout,
    blocks: parseSlideBlocks(slide.blocks),
    caption: slide.caption,
    label: slide.label,
    imagePrompt: slide.imagePrompt,
    speakerNotes: slide.speakerNotes,
  });
}

function describeCurrentSlide(slide: SlideForEditing): string {
  const editable = currentEditable(slide);
  const lines = [
    `SLIDE ${slide.order} — ${slide.title}`,
    editable.subtitle ? `Current subtitle: ${editable.subtitle}` : null,
    `Current layout: ${editable.layout}`,
    `Current body: ${editable.content || "(empty)"}`,
  ];

  for (const block of editable.blocks) {
    lines.push(`Current block (${block.type}): ${JSON.stringify(block)}`);
  }

  if (editable.caption) lines.push(`Current caption: ${editable.caption}`);
  if (editable.label) lines.push(`Current label: ${editable.label}`);
  if (editable.imagePrompt) lines.push(`Current image prompt: ${editable.imagePrompt}`);
  if (editable.speakerNotes) {
    lines.push(
      `Founder's current speaker notes (keep these unless the action says otherwise): ${editable.speakerNotes}`,
    );
  }

  return lines.filter((line): line is string => line !== null).join("\n");
}

/**
 * Tell the model the founder edited this slide, so their work is preserved in
 * spirit rather than silently discarded by a rewrite.
 */
function userEditNotice(slide: SlideForEditing): string {
  if (!slide.userEdited) {
    return "";
  }

  return `

IMPORTANT — the founder has hand-edited this slide. Their wording is deliberate. Preserve their intent, their terminology, and any fact they added. You may improve clarity and structure, but do NOT drop a point they wrote, and do NOT reintroduce wording they removed.`;
}

/**
 * Run an editorial action against one slide and return the proposal.
 *
 * The proposal is a complete replacement for that slide's editable content. It
 * is never written to the live slide here — the caller stores it as a PENDING
 * SlideRevision so the founder compares it before accepting.
 */
export async function runEditorialAction(input: {
  context: DeckContext;
  slide: SlideForEditing;
  action: EditorialAction;
}): Promise<SlideProposal> {
  const { context, slide, action } = input;

  if (action === "speaker_notes") {
    const notes = await generateSpeakerNotes({
      context,
      slideOrder: slide.order,
    });

    return {
      summary: "Fresh speaker notes written for this slide.",
      dataNeeded: notes.importantMetric ? [] : ["A number worth calling out on this slide"],
      slide: {
        ...currentEditable(slide),
        speakerNotes: formatSpeakerNotes(notes),
      },
    };
  }

  const instruction = ACTION_INSTRUCTIONS[action];

  const output = await runStructured(
    slideAgent,
    [
      "Edit this ONE slide. The rest of the deck is context only — do not change it.",
      "",
      `ACTION: ${action}`,
      instruction,
      userEditNotice(slide),
      "",
      "—",
      "",
      "DECK CONTEXT",
      formatDeckForPrompt(context),
      "",
      "—",
      "",
      describeCurrentSlide(slide),
    ].join("\n"),
  );

  return {
    summary: output.summary,
    dataNeeded: output.dataNeeded,
    slide: {
      title: output.title,
      subtitle: output.subtitle ?? null,
      content: output.content,
      layout: output.layout,
      blocks: output.blocks,
      caption: output.caption ?? null,
      label: output.label ?? null,
      imagePrompt: output.imagePrompt,
      speakerNotes: output.speakerNotes ?? null,
    },
  };
}
