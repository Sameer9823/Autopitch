import { NextResponse } from "next/server";
import { z } from "zod";

import { HttpError, resolveShareToken } from "@/lib/api/guards";
import { resolveSlideTheme } from "@/lib/deck/theme";
import { toRenderSlide } from "@/lib/deck/to-render-model";
import { prisma } from "@/lib/db";
import { exportFileBaseName, toExportErrorBody } from "@/lib/export/errors";
import { buildDeckPdf } from "@/lib/export/pdf";
import { buildDeckPptx } from "@/lib/export/pptx";
import { resolveExportDeck } from "@/lib/export/layout";

/**
 * Public download for a shared deck.
 *
 *   GET /api/share/[token]/download?format=pdf|pptx
 *
 * Unauthenticated, but ONLY for links whose permission is `VIEW_DOWNLOAD` —
 * a `VIEW` link is a view-only invitation and must not be downloadable. The
 * `VIEW_DOWNLOAD` toggle on the owner's share page is only meaningful if this
 * route actually enforces it.
 *
 * Like the owner export route this returns a binary attachment, so it does not
 * use `withErrorHandling` (which yields a `NextResponse`).
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type DownloadParams = { params: Promise<{ token: string }> };

const QuerySchema = z.object({
  format: z.enum(["pdf", "pptx"]).default("pdf"),
});

export async function GET(request: Request, { params }: DownloadParams) {
  try {
    const { token } = await params;
    const url = new URL(request.url);

    const parsed = QuerySchema.safeParse({
      format: url.searchParams.get("format") ?? undefined,
    });

    if (!parsed.success) {
      throw new HttpError(400, "Unsupported download format.", "invalid_query");
    }

    // Throws 404 for a missing, revoked or expired link.
    const share = await resolveShareToken(token);

    if (share.permission !== "VIEW_DOWNLOAD") {
      throw new HttpError(
        403,
        "Downloads are disabled for this link. Ask the owner to enable them.",
        "download_disabled",
      );
    }

    const deck = share.deck;

    if (deck.slides.length === 0) {
      throw new HttpError(400, "This deck has no slides yet.", "no_slides");
    }

    // Same Brand Kit resolution as the editor, share viewer and owner export.
    const brandKit = await prisma.brandKit.findFirst({
      where: { userId: deck.userId },
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

    const model = resolveExportDeck(
      {
        title: deck.title,
        startupName: deck.startupName,
        slides: deck.slides.map(toRenderSlide),
      },
      resolveSlideTheme(brandKit),
    );

    const deckTitle = deck.title ?? deck.startupName ?? null;
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

    return new Response(body as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${baseName}.${parsed.data.format}"`,
        "Content-Length": String(body.byteLength),
        // Shared decks are private fundraising material — never cache.
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

    console.error("[api] share download failed", error);
    const { body, status } = toExportErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
