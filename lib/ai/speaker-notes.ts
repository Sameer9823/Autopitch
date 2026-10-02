import { defineAgent, GROUNDING_RULES, runStructured } from "@/lib/ai/agent";
import { formatDeckForPrompt, type DeckContext } from "@/lib/ai/deck-context";
import { SpeakerNotesSchema, type SpeakerNotes } from "@/lib/schemas/content";

/**
 * Authored speaker notes.
 *
 * The hard rule here is that notes are WRITTEN for the founder to say out loud,
 * not copied off the slide. The prompt explicitly forbids echoing slide text, so
 * a founder reading the script hears the argument and the spoken bridge into
 * the next slide rather than a bulleted read-aloud of their own bullets.
 */

const speakerNotesAgent = defineAgent<SpeakerNotes>({
  name: "SpeakerNotesWriter",
  instructions: `You write what a founder SAYS out loud while presenting one slide of an investor pitch deck.

The single most important rule: DO NOT REPEAT THE SLIDE TEXT. The investor can read the slide. Your notes must add what the slide cannot say for itself — the framing, the reasoning behind the number, the caveat, and the spoken bridge into the next slide.

For each slide produce:
- keyMessage: the one sentence the founder must land in this section.
- supportingContext: the reasoning and framing to deliver that sentence — 2–4 sentences that give the number meaning (trend, comparison, what it implies) rather than restating it.
- importantMetric: the single number or claim to emphasise out loud, phrased so it can be spoken. Use null when this slide genuinely has no number worth calling out. Never invent one to fill this field.
- transition: one spoken sentence that moves the room to the next slide, e.g. "So if the market is this large, the question is how we get there — which is what the next slide covers."
- script: a 20–60 second spoken script (roughly 60–160 words) that combines the four parts above in natural spoken English. It should read as something a person would actually say: short sentences, no bullet markers, no markdown, no stage directions.

Style:
- Confident, plain, and specific. Write the way a good founder talks, not the way a brochure reads.
- No filler, no buzzwords, no "we're excited to announce".
- Address the investor's likely doubt directly where the slide has one.
- Keep every metric and claim consistent with the deck. If a number is absent, say so conversationally rather than making one up.

${GROUNDING_RULES}`,
  schema: SpeakerNotesSchema,
});

/** Render one slide as the compact block the notes writer reasons about. */
function describeSlide(context: DeckContext, order: number) {
  const slide = context.slides.find((candidate) => candidate.order === order);

  if (!slide) {
    throw new Error(`Slide ${order} is not part of this deck.`);
  }

  const lines = [
    `SLIDE ${slide.order} — ${slide.title}`,
    slide.label ? `Eyebrow label: ${slide.label}` : null,
    slide.subtitle ? `Subtitle: ${slide.subtitle}` : null,
    `Layout: ${slide.layout}`,
  ];

  for (const block of slide.blocks) {
    switch (block.type) {
      case "bullets":
        lines.push(
          `On-slide bullets: ${block.items.map((item) => `• ${item}`).join(" ")}`,
        );
        break;
      case "metric":
        lines.push(
          `On-slide metric: ${block.value} ${block.label}${
            block.delta ? ` (${block.delta})` : ""
          }${block.placeholder ? " — marked as DATA NEEDED, not a verified fact" : ""}`,
        );
        break;
      case "chart":
        lines.push(
          `On-slide chart (${block.chartType})${
            block.title ? ` titled "${block.title}"` : ""
          }: ${block.series.map((point) => `${point.label}=${point.value}`).join(", ")}`,
        );
        break;
      case "body":
        lines.push(`On-slide body copy: ${block.text}`);
        break;
      case "heading":
        lines.push(`On-slide heading: ${block.text}`);
        break;
      case "caption":
        lines.push(`On-slide caption: ${block.text}`);
        break;
      case "label":
        lines.push(`On-slide label: ${block.text}`);
        break;
    }
  }

  if (slide.content) lines.push(`On-slide body text: ${slide.content}`);
  if (slide.caption) lines.push(`On-slide caption: ${slide.caption}`);

  const next = context.slides.find((candidate) => candidate.order === slide.order + 1);
  lines.push(
    next
      ? `The next slide (${next.order}) is: ${next.title}`
      : "This is the final slide of the deck.",
  );

  return lines.filter((line): line is string => line !== null).join("\n");
}

/** Compose the notes a founder will speak for a single slide. */
export async function generateSpeakerNotes(input: {
  context: DeckContext;
  slideOrder: number;
}): Promise<SpeakerNotes> {
  const { context, slideOrder } = input;

  return runStructured(
    speakerNotesAgent,
    [
      "Write the speaker notes for ONE slide of this pitch deck.",
      "",
      "The notes must be what the founder says out loud. Do not copy, restate, or lightly paraphrase the on-slide copy — add the argument, the framing, and the spoken transition instead.",
      "",
      formatDeckForPrompt(context),
      "",
      "—",
      "",
      describeSlide(context, slideOrder),
    ].join("\n"),
  );
}

/**
 * Flatten structured notes into the plain text stored on Slide.speakerNotes.
 *
 * The founder edits this as one script, so the structured parts become labelled
 * lines rather than a blob of prose.
 */
export function formatSpeakerNotes(notes: SpeakerNotes): string {
  return [
    `Key message: ${notes.keyMessage}`,
    "",
    `Supporting context: ${notes.supportingContext}`,
    notes.importantMetric ? `Call out: ${notes.importantMetric}` : null,
    "",
    `Say: ${notes.script}`,
    "",
    `Transition: ${notes.transition}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
    .trim();
}
