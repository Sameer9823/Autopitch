import { NextResponse } from "next/server";
import { z } from "zod";

import { HttpError, requireDeck, requireUser } from "@/lib/api/guards";
import { trackUsage } from "@/lib/analytics/usage";
import { resolveSlideTheme } from "@/lib/deck/theme";
import { toRenderSlide } from "@/lib/deck/to-render-model";
import { prisma } from "@/lib/db";
import { exportFileBaseName, toExportErrorBody } from "@/lib/export/errors";
import { buildDeckPdf } from "@/lib/export/pdf";
import { buildDeckPptx } from "@/lib/export/pptx";
import { resolveExportDeck } from "@/lib/export/layout";

/**
 * Deck export.
 *
 *   GET /api/decks/[id]/export?format=pdf&slides=1,2,3
 *   GET /api/decks/[id]/export?format=pptx
 *
 * `format` is `pdf` (default) or `pptx`. `slides` is optional and selects a
 * subset for "Export Selected Slides": a comma-separated list of 1-based slide
 * *orders* (slide ids are also accepted so a caller holding ids need not map
 * them). Omitting it exports the whole deck in slide order.
 *
 * The response is a binary attachment, so this handler deliberately does NOT use
 * `withErrorHandling` — that wrapper returns a `NextResponse`, which cannot
 * carry an arbitrary binary body cleanly. The try/catch below does the same job
 * for both the auth layer and the encoder, and `toExportErrorBody` guarantees no
 * library error string ever reaches the client.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ExportParams = { params: Promise<{ id: string }> };

const MAX_EXPORT_SLIDES = 60;

const QuerySchema = z.object({
  format: z.enum(["pdf", "pptx"]).default("pdf"),
  slides: z.string().max(2000).optional(),
});

/**
 * Resolve the `slides` parameter against the deck.
 *
 * A token matches a slide by its 1-based order or by its id, so both a UI
 * checkbox grid (which has orders) and a caller holding ids work. Unknown
 * tokens are an error rather than a silent omission: quietly exporting 3 of 5
 * requested slides is worse than saying no.
 */
function selectSlides<T extends { id: string; order: number }>(
  slides: T[],
  raw: string | undefined,
): T[] {
  const tokens = (raw ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return slides;
  }

  if (tokens.length > MAX_EXPORT_SLIDES) {
    throw new HttpError(
      400,
      `You can export at most ${MAX_EXPORT_SLIDES} slides at a time.`,
      "too_many_slides",
    );
  }

  const byOrder = new Map(slides.map((slide) => [String(slide.order), slide]));
  const byId = new Map(slides.map((slide) => [slide.id, slide]));

  const selected: T[] = [];
  const seen = new Set<string>();
  const unknown: string[] = [];

  for (const token of tokens) {
    const match = byOrder.get(token) ?? byId.get(token);

    if (!match) {
      unknown.push(token);
      continue;
    }

    if (seen.has(match.id)) {
      continue;
    }

    seen.add(match.id);
    selected.push(match);
  }

  if (unknown.length > 0) {
    throw new HttpError(
      400,
      `This deck has no slide matching ${unknown.join(", ")}.`,
      "unknown_slide",
    );
  }

  // Preserve deck order regardless of the order the tokens were written in.
  return selected.sort((a, b) => a.order - b.order);
}

export async function GET(request: Request, { params }: ExportParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    // 404 for anything the caller does not own — never 403.
    const deck = await requireDeck(id, user.id);

    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      format: url.searchParams.get("format") ?? undefined,
      slides: url.searchParams.get("slides") ?? undefined,
    });

    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid export request.",
        "invalid_query",
      );
    }

    const slides = selectSlides(deck.slides, parsed.data.slides);

    if (slides.length === 0) {
      throw new HttpError(
        400,
        "This deck has no slides to export yet.",
        "no_slides",
      );
    }

    // Same Brand Kit resolution the editor and the share viewer use, so an
    // export always carries the brand the founder actually set up.
    const brandKit = await prisma.brandKit.findFirst({
      where: {
        OR: [{ userId: user.id }, { workspaceId: user.workspaceId }],
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: {
        name: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        headingFont: true,
        bodyFont: true,
      },
    });

    const theme = resolveSlideTheme(brandKit);
    const deckTitle = deck.title ?? deck.startupName ?? null;

    const model = resolveExportDeck(
      { title: deck.title, startupName: deck.startupName, slides: slides.map(toRenderSlide) },
      theme,
    );

    const baseName = exportFileBaseName(deckTitle);

    let body: Uint8Array;
    let contentType: string;

    if (parsed.data.format === "pptx") {
      body = await buildDeckPptx(model, {
        title: deckTitle,
        company: brandKit?.name ?? null,
        subject: deck.startupName
          ? `${deck.startupName} — investor pitch deck`
          : null,
      });
      contentType =
        "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    } else {
      body = await buildDeckPdf(model, { title: deckTitle });
      contentType = "application/pdf";
    }

    trackUsage({
      type: "EXPORT",
      userId: user.id,
      workspaceId: user.workspaceId,
      deckId: deck.id,
      quantity: slides.length,
      bytes: body.byteLength,
      meta: {
        format: parsed.data.format,
        slides: slides.length,
        totalSlides: deck.slides.length,
        subset: slides.length !== deck.slides.length,
      },
    });

    return new Response(body as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${baseName}.${parsed.data.format}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    // The real failure is logged in the exporter; the client gets a sentence.
    console.error("[api] deck export failed", error);

    const { body, status } = toExportErrorBody(error);

    return NextResponse.json(body, { status });
  }
}