import { Agent } from "@openai/agents";

import { PitchDeckSchema } from "@/lib/schemas/pitch-deck";
import {
  pitchDeckQualityGuardrail,
  validProjectIdeaGuardrail,
} from "@/lib/agents/guardrails";

/**
 * Main agent that turns a project idea into a typed pitch deck.
 *
 * Extended for RAISEVIA AI: the deck now carries layout + structured blocks so
 * the editor has real metrics, bullets and charts to work with, and follows the
 * narrative order an investor expects.
 */
const PITCH_DECK_INSTRUCTIONS = `You write startup pitch decks for investors.

Given a project idea, create 7–8 slides in this order:
1. Title (layout TITLE) — deck title + a one-line tagline in subtitle
2. Problem (layout CONTENT) — the pain point, in the customer's own words
3. Solution (layout CONTENT) — how the product removes that pain
4. Market (layout CHART) — target customers and the opportunity; use a chart block
5. Product (layout THREE_FEATURE) — 3 key capabilities as bullets
6. Business Model (layout METRICS) — how the company makes money
7. Traction or Roadmap (layout METRICS) — proof so far, or the plan to get it
8. The Ask (layout CLOSING) — the raise and what it buys

Field rules:
- title: 3–80 characters, sentence case, no trailing punctuation
- subtitle: optional one-liner, max 160 characters
- content: 2–4 short paragraphs or bullets as plain text, each starting with "• "
- layout: pick the layout that matches the slide's job
- blocks: use the structured block types that suit the slide —
  • METRICS slides should carry "metric" blocks
  • CHART slides should carry one "chart" block with 3–6 real data points
  • list slides should carry one "bullets" block with 2–6 items
- imagePrompt: a short description for a professional slide illustration
  (no text in the image, clean and modern style)
- Keep language clear, confident and investor-friendly
- Do not use placeholder filler like "TBD" or "lorem ipsum"

GROUNDING — never invent facts:
- Use only what the founder's idea actually contains.
- Never fabricate metrics, revenue, customer names, funding history, market
  sizes or growth numbers.
- When a slide needs a number the idea does not provide, still create the slide
  but set "placeholder": true on the metric block and use the value "Data needed".
- An honest gap is far better than a plausible fabrication.

Write copy that a real fund could believe. Avoid hype, buzzwords and filler.`;

/**
 * - outputType: forces JSON to match PitchDeckSchema (structured output)
 * - inputGuardrails: validate the user's idea before generating
 * - outputGuardrails: validate the deck content before returning
 */
export const pitchDeckAgent = new Agent({
  name: "PitchDeckGenerator",
  model: "gpt-4.1-mini",
  instructions: PITCH_DECK_INSTRUCTIONS,
  // Zod v4 types differ slightly from the SDK — runtime structured output works fine.
  outputType: PitchDeckSchema as never,
  inputGuardrails: [validProjectIdeaGuardrail],
  outputGuardrails: [pitchDeckQualityGuardrail],
});
