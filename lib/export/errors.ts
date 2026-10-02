/**
 * Export error handling.
 *
 * Export routes run real file-encoding libraries (pdf-lib, pptxgenjs, an HTTP
 * fetch per remote image). Those libraries throw errors whose messages contain
 * internals — font table offsets, ZIP entry names, upstream CDN URLs — that must
 * never reach the client. Everything that leaves this module for the wire is a
 * short, human sentence; the original error is logged and kept as `cause`.
 */

export class ExportError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    message: string,
    code = "export_failed",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ExportError";
    this.status = status;
    this.code = code;
  }
}

/**
 * The single message shown for any failure the user could not have caused.
 * Deliberately vague: it must not reveal whether a private image URL, a font
 * name or a database field was involved.
 */
export const GENERIC_EXPORT_ERROR =
  "We couldn't finish that export. Please try again.";

/** Shape of the JSON body the export route returns on failure. */
export type ExportErrorBody = {
  error: string;
  code: string;
};

/**
 * Map any thrown value onto a safe client response.
 *
 * `ExportError` instances are authored here, so their message and status are
 * safe to forward. Everything else — including errors thrown by pdf-lib,
 * pptxgenjs and `fetch` — collapses to a generic 500.
 */
export function toExportErrorBody(error: unknown): {
  body: ExportErrorBody;
  status: number;
} {
  if (error instanceof ExportError) {
    return {
      body: { error: error.message, code: error.code },
      status: error.status,
    };
  }

  return {
    body: { error: GENERIC_EXPORT_ERROR, code: "internal_error" },
    status: 500,
  };
}

/**
 * Build a filesystem-safe download name from a deck title.
 *
 * Falls back to a stable product default so the `Content-Disposition` header is
 * never empty. Non-ASCII titles are transliterated where we can and dropped
 * otherwise, because the header is a bare token.
 */
export function exportFileBaseName(
  title: string | null | undefined,
  fallback = "raisevia-deck",
): string {
  const ascii = (title ?? "")
    .normalize("NFKD")
    // Drop combining marks left behind by NFKD (é -> e).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  return ascii.length > 0 ? ascii : fallback;
}