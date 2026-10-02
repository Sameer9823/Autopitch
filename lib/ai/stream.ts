import { run, type RunConfig } from "@openai/agents";

import { AiServiceError, type StructuredAgent } from "@/lib/ai/agent";

/**
 * Streaming execution for structured AI replies.
 *
 * The repo already has `runStructured` in `lib/ai/agent.ts` for one-shot
 * structured output. This module is its streaming twin and deliberately mirrors
 * it: the same `defineAgent` agents, the same Zod validation of the final
 * output, and the same user-safe `AiServiceError` mapping. The only difference
 * is that raw model deltas are surfaced as they arrive, so a long deck review
 * can be read while it is being written.
 *
 * The wire format is NDJSON — one JSON object per line — because it survives a
 * truncated connection without a framing protocol: a client that loses the
 * socket mid-reply still holds every complete line it received.
 */

/** A single frame of a streamed reply. */
export type StreamEvent<T> =
  /** Emitted immediately so the UI can show progress before the first token. */
  | { type: "status"; status: "thinking" }
  /** Raw model text. For a structured agent this is a JSON fragment. */
  | { type: "delta"; text: string }
  /** The validated, schema-conformant result. Terminal. */
  | { type: "done"; value: T }
  /** A user-safe failure. Terminal. */
  | { type: "error"; message: string; reason: string };

/** Serialize one frame as a single NDJSON line. */
export function encodeStreamEvent<T>(event: StreamEvent<T>): string {
  return `${JSON.stringify(event)}\n`;
}

/** Content type used by every streaming route. */
export const STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

/**
 * Map a provider failure onto a user-safe `AiServiceError`.
 *
 * Deliberately equivalent to the mapping in `lib/ai/agent.ts` so a streamed
 * request and a non-streamed one report the same thing for the same problem.
 */
function toAiServiceError(error: unknown): AiServiceError {
  if (error instanceof AiServiceError) {
    return error;
  }

  const message =
    error instanceof Error ? error.message : "Unknown AI provider error";

  if (/abort/i.test(message)) {
    return new AiServiceError(
      "The reply was stopped before it finished.",
      "aborted",
    );
  }

  if (/rate limit|429/i.test(message)) {
    return new AiServiceError(
      "The AI service is busy right now. Please try again in a moment.",
      "rate_limited",
    );
  }

  if (/timeout|ETIMEDOUT|ECONN/i.test(message)) {
    return new AiServiceError(
      "The AI service took too long to respond. Please try again.",
      "timeout",
    );
  }

  return new AiServiceError(
    "We could not complete that AI request. Please try again.",
    "provider_error",
  );
}

/** Narrow a raw provider stream event to a text delta. */
function isTextDelta(
  data: unknown,
): data is { type: "output_text_delta"; delta: string } {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const candidate = data as { type?: unknown; delta?: unknown };

  return (
    candidate.type === "output_text_delta" && typeof candidate.delta === "string"
  );
}

/**
 * Start a streaming run.
 *
 * Isolated in its own function so the return type is inferred from the SDK's
 * streaming overload instead of being spelled out with erased generics.
 */
function startStream<T>(input: {
  agent: StructuredAgent<T>;
  prompt: string;
  signal?: AbortSignal;
  runConfig?: RunConfig;
}) {
  return run(input.agent, input.prompt, {
    stream: true,
    signal: input.signal,
    ...input.runConfig,
  });
}

/**
 * Run a structured agent and stream its reply.
 *
 * Contract:
 *   - exactly one terminal frame is emitted (`done` or `error`);
 *   - `done.value` has been parsed with the agent's own Zod schema, so callers
 *     can persist it without re-validating;
 *   - when the caller aborts (client disconnect, Stop button) the generator
 *     ends with an `aborted` error frame and never yields a partial `done`;
 *   - no provider error, stack trace or raw JSON ever reaches the caller.
 */
export async function* streamStructured<T>(input: {
  agent: StructuredAgent<T>;
  prompt: string;
  signal?: AbortSignal;
  runConfig?: RunConfig;
}): AsyncGenerator<StreamEvent<T>> {
  yield { type: "status", status: "thinking" };

  const aborted: StreamEvent<T> = {
    type: "error",
    message: "The reply was stopped before it finished.",
    reason: "aborted",
  };

  if (input.signal?.aborted) {
    yield aborted;
    return;
  }

  let stream: Awaited<ReturnType<typeof startStream<T>>>;

  try {
    stream = await startStream(input);
  } catch (error) {
    const failure = toAiServiceError(error);
    yield { type: "error", message: failure.message, reason: failure.reason };
    return;
  }

  try {
    for await (const event of stream.toStream()) {
      if (event.type === "raw_model_stream_event" && isTextDelta(event.data)) {
        yield { type: "delta", text: event.data.delta };
      }
    }

    await stream.completed;
  } catch (error) {
    const failure = toAiServiceError(error);
    yield { type: "error", message: failure.message, reason: failure.reason };
    return;
  }

  if (input.signal?.aborted) {
    yield aborted;
    return;
  }

  // A stream that never produced a validated object is a failure, not a
  // half-answer: the client discards the partial text and offers Retry.
  const validated = input.agent.outputSchema.safeParse(stream.finalOutput);

  if (!validated.success) {
    yield {
      type: "error",
      message: "The AI returned an unexpected response. Please try again.",
      reason: "invalid_output",
    };
    return;
  }

  yield { type: "done", value: validated.data };
}

// ---------------------------------------------------------------------------
// Progressive rendering of one field out of a structured stream
// ---------------------------------------------------------------------------

/**
 * Read one string field out of a JSON object that is still being streamed.
 *
 * Structured output arrives as a JSON document, so raw deltas are JSON
 * fragments rather than prose. The reader finds the named field's opening
 * quote and returns the decoded value so far, which is what lets the answer
 * text appear while the metadata is still being written.
 *
 * The reader is display-only. The persisted value always comes from the
 * validated `done` frame, so a mis-read here can never reach storage.
 */
export function createPartialJsonFieldReader(field: string) {
  const needle = `"${field}"`;
  let raw = "";
  let exhausted = false;

  return {
    push(chunk: string): string {
      if (exhausted) {
        return "";
      }

      raw += chunk;

      const keyAt = raw.indexOf(needle);

      if (keyAt === -1) {
        // The key has not been written yet; keep buffering.
        return "";
      }

      const afterKey = raw.slice(keyAt + needle.length);
      const opening = afterKey.match(/^\s*:\s*"/);

      if (!opening) {
        // Present but not a plain string — stop trying rather than misread.
        if (/^\s*:\s*[^"\s]/.test(afterKey)) {
          exhausted = true;
        }
        return "";
      }

      const read = readStringPrefix(afterKey.slice(opening[0].length - 1));

      if (read.closed) {
        exhausted = true;
      }

      return read.value;
    },
  };
}

/** Decode the leading JSON string in `text`, stopping at its closing quote. */
function readStringPrefix(text: string): { value: string; closed: boolean } {
  let out = "";
  let index = 0;

  for (; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      return { value: out, closed: true };
    }

    if (char !== "\\") {
      out += char;
      continue;
    }

    const escape = text[index + 1];

    if (escape === undefined) {
      // A half-written escape sequence: stop here, the rest arrives later.
      return { value: out, closed: false };
    }

    out += decodeEscape(escape, text, index);
    index += escape.length === 4 ? 5 : 1;
  }

  return { value: out, closed: false };
}

function decodeEscape(escape: string, text: string, index: number): string {
  switch (escape) {
    case "n":
      return "\n";
    case "t":
      return "\t";
    case "r":
      return "\r";
    case "b":
      return "\b";
    case "f":
      return "\f";
    case '"':
      return '"';
    case "\\":
      return "\\";
    case "/":
      return "/";
    case "u": {
      const hex = text.slice(index + 2, index + 6);

      if (hex.length < 4) {
        return "";
      }

      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    default:
      return escape;
  }
}
