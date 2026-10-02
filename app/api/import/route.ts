import { NextResponse } from "next/server";

import {
  analyzeExistingDeck,
  analyzeSourceText,
} from "@/lib/ai/import-analysis";
import { HttpError, requireUser, withErrorHandling } from "@/lib/api/guards";
import { trackUsage } from "@/lib/analytics/usage";
import {
  assertImportSize,
  extractPdfText,
  extractPlainText,
  extractPptxText,
  extractUrlText,
} from "@/lib/import/extract";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TEXT_CHARS = 400_000;

/**
 * POST /api/import
 *
 * Accepts plain text, a website URL, an uploaded PDF/PPTX, or an existing deck
 * id, and returns a structured startup brief.
 *
 * Fields the source does not cover come back as `null` and are listed in
 * `missingFields` — they are never guessed.
 */
export const POST = withErrorHandling<[Request]>(async (request) => {
  const user = await requireUser();

  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  let text: string;

  if (isMultipart) {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new HttpError(400, "No file was uploaded.");
    }

    assertImportSize(file.size);

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name.toLowerCase();

    if (filename.endsWith(".pdf") || file.type === "application/pdf") {
      text = await extractPdfText(buffer);
    } else if (
      filename.endsWith(".pptx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ) {
      text = await extractPptxText(buffer);
    } else if (filename.endsWith(".txt") || filename.endsWith(".md")) {
      text = extractPlainText(buffer.toString("utf8"));
    } else {
      throw new HttpError(
        400,
        "Unsupported file type. Upload a PDF, PPTX, TXT or MD file.",
      );
    }
  } else {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const record = (body ?? {}) as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const deckId = typeof record.deckId === "string" ? record.deckId.trim() : "";
    const rawText =
      typeof record.text === "string" ? record.text.trim().slice(0, MAX_TEXT_CHARS) : "";

    if (deckId) {
      const analysis = await analyzeExistingDeck(deckId, user.id);

      trackUsage({
        type: "AI_GENERATION",
        userId: user.id,
        workspaceId: user.workspaceId,
        deckId,
        meta: { operation: "import_existing_deck" },
      });

      return NextResponse.json(analysis);
    }

    if (url) {
      text = await extractUrlText(url);
    } else if (rawText) {
      text = extractPlainText(rawText);
    } else {
      throw new HttpError(
        400,
        "Provide text, a website URL, a file, or a deck id to import.",
      );
    }
  }

  const analysis = await analyzeSourceText(text);

  trackUsage({
    type: "AI_GENERATION",
    userId: user.id,
    workspaceId: user.workspaceId,
    meta: { operation: "import_analysis" },
  });

  return NextResponse.json(analysis);
});
