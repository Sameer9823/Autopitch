import { parseSlideBlocks, type SlideBlock } from "@/lib/schemas/slide";

/**
 * A single slide in the form the AI services consume.
 * Assembled from the Slide row so no service has to know about Prisma.
 */
export type DeckContextSlide = {
  order: number;
  title: string;
  subtitle: string | null;
  content: string;
  layout: string;
  caption: string | null;
  label: string | null;
  imagePrompt: string;
  imageUrl: string | null;
  blocks: SlideBlock[];
};

export type DeckContext = {
  id: string;
  title: string;
  idea: string;
  startupName: string | null;
  stage: string;
  deckType: string;
  askAmount: string | null;
  slides: DeckContextSlide[];
};

/** Minimal shape the shared Prisma `include` must produce. */
type DeckRow = {
  id: string;
  title: string | null;
  idea: string;
  startupName: string | null;
  stage: string;
  deckType: string;
  askAmount: string | null;
  slides: {
    order: number;
    title: string;
    subtitle: string | null;
    content: string;
    layout: string;
    caption: string | null;
    label: string | null;
    imagePrompt: string;
    imageUrl: string | null;
    blocks: unknown;
  }[];
};

/**
 * Convert a deck (already verified as owned by the caller) into a plain object
 * for AI grounding.
 *
 * IMPORTANT: callers MUST have authorized the deck before building context.
 * This helper never queries by client-supplied id on its own; it only reshapes
 * rows the caller already holds.
 */
export function toDeckContext(deck: DeckRow): DeckContext {
  return {
    id: deck.id,
    title: deck.title ?? "Untitled deck",
    idea: deck.idea,
    startupName: deck.startupName,
    stage: deck.stage,
    deckType: deck.deckType,
    askAmount: deck.askAmount,
    slides: deck.slides.map((slide) => ({
      order: slide.order,
      title: slide.title,
      subtitle: slide.subtitle,
      content: slide.content,
      layout: slide.layout,
      caption: slide.caption,
      label: slide.label,
      imagePrompt: slide.imagePrompt,
      imageUrl: slide.imageUrl,
      blocks: parseSlideBlocks(slide.blocks),
    })),
  };
}

/**
 * Render a deck as text for the model.
 * Ordered and numbered so the model can cite exact slide numbers.
 */
export function formatDeckForPrompt(deck: DeckContext): string {
  const header = [
    `Deck title: ${deck.title}`,
    deck.startupName ? `Startup: ${deck.startupName}` : null,
    `Fundraising stage: ${deck.stage}`,
    `Deck type: ${deck.deckType}`,
    deck.askAmount ? `Fundraising ask: ${deck.askAmount}` : null,
    "",
    "Founder's original brief:",
    deck.idea,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const body = deck.slides
    .map((slide) => {
      const lines = [`--- Slide ${slide.order}: ${slide.title} ---`];
      if (slide.subtitle) lines.push(`Subtitle: ${slide.subtitle}`);
      if (slide.content) lines.push(`Body: ${slide.content}`);
      if (slide.caption) lines.push(`Caption: ${slide.caption}`);

      for (const block of slide.blocks) {
        switch (block.type) {
          case "bullets":
            lines.push(
              `Bullets:\n${block.items.map((i) => `  • ${i}`).join("\n")}`,
            );
            break;
          case "metric":
            lines.push(
              `Metric: ${block.value} ${block.label}${
                block.placeholder ? " (DATA NEEDED — not verified)" : ""
              }`,
            );
            break;
          case "chart":
            lines.push(
              `Chart (${block.chartType})${block.title ? `: ${block.title}` : ""}: ${block.series
                .map((p) => `${p.label}=${p.value}`)
                .join(", ")}`,
            );
            break;
          case "body":
            lines.push(`Text: ${block.text}`);
            break;
          case "heading":
            lines.push(`Heading: ${block.text}`);
            break;
          case "caption":
            lines.push(`Caption: ${block.text}`);
            break;
          case "label":
            lines.push(`Label: ${block.text}`);
            break;
        }
      }

      if (slide.imageUrl) lines.push("Has a hero image.");
      else if (slide.imagePrompt) lines.push("Visual planned but not yet generated.");

      return lines.join("\n");
    })
    .join("\n\n");

  return `${header}\n\n${body}`;
}
