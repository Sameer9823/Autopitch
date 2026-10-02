import { Agent, run, type RunConfig } from "@openai/agents";
import type { z } from "zod";

/**
 * Shared factory for every AI operation in RAISEVIA AI.
 *
 * Extends the pattern already established in lib/agents/pitch-deck-agent.ts
 * (an `Agent` with a Zod `outputType`) so all new services — slide generation,
 * investor review, question generation, answer evaluation, speaker notes,
 * fundraising assets, chat — validate their output the same way and fail the
 * same way.
 *
 * Every service must:
 *   1. declare a Zod schema for its structured output,
 *   2. go through `runStructured`, which validates before anything is persisted.
 */

export const DEFAULT_MODEL = "gpt-4.1-mini";
export const REASONING_MODEL = "gpt-4.1";

export const GROUNDING_RULES = `
CRITICAL — never invent facts:
- Only use information explicitly present in the material you are given.
- Never fabricate metrics, revenue, funding history, customer names, dates,
  market sizes, or growth numbers.
- If a specific fact is needed but absent, set the corresponding
  "placeholder" flag to true, use the label "Data needed", and explain in the
  rationale what the founder must supply.
- Prefer stating a gap plainly over guessing. An investor-facing document with
  an honest gap is stronger than one with a plausible fabrication.
`.trim();

/**
 * An agent that emits validated structured output.
 *
 * The Agents SDK's `Agent` generics are invariant and do not model a Zod v4
 * schema through `outputType`, so a Zod-derived agent cannot be passed to
 * `run()` without erasing them. This is the single place that erasure happens;
 * the contract that actually matters — validated structured output — is
 * enforced at runtime by `runStructured` against `outputSchema`.
 */
export type StructuredAgent<T> = AnyAgent & {
  /** The Zod schema this agent was built with, used for output validation. */
  readonly outputSchema: z.ZodType<T>;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyAgent = Agent<any, any>;

export function defineAgent<T>(config: {
  name: string;
  instructions: string;
  schema: z.ZodType<T>;
  model?: string;
}): StructuredAgent<T> {
  const agent = new Agent({
    name: config.name,
    model: config.model ?? DEFAULT_MODEL,
    instructions: config.instructions,
    outputType: config.schema as never,
  });

  return Object.assign(agent, {
    outputSchema: config.schema,
  }) as unknown as StructuredAgent<T>;
}

export class AiServiceError extends Error {
  readonly reason: string;

  constructor(message: string, reason?: string) {
    super(message);
    this.name = "AiServiceError";
    this.reason = reason ?? message;
  }
}

/**
 * Run an agent and validate its structured output.
 * Converts any failure into an AiServiceError with a user-safe message —
 * raw stack traces and provider internals never reach the client.
 */
export async function runStructured<T>(
  agent: StructuredAgent<T>,
  input: string,
  options?: { runConfig?: RunConfig },
): Promise<T> {
  let output: unknown;

  try {
    const result = await run(agent, input, options?.runConfig);
    output = result.finalOutput;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown AI provider error";

    if (/rate limit|429/i.test(message)) {
      throw new AiServiceError(
        "The AI service is busy right now. Please try again in a moment.",
        "rate_limited",
      );
    }

    if (/timeout|ETIMEDOUT|ECONN/i.test(message)) {
      throw new AiServiceError(
        "The AI service took too long to respond. Please try again.",
        "timeout",
      );
    }

    throw new AiServiceError(
      "We could not complete that AI request. Please try again.",
      "provider_error",
    );
  }

  try {
    return agent.outputSchema.parse(output);
  } catch {
    throw new AiServiceError(
      "The AI returned an unexpected response. Please try again.",
      "invalid_output",
    );
  }
}
