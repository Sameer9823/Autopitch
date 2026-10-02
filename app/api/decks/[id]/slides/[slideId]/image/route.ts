import { NextResponse } from "next/server";
import { z } from "zod";

import { trackUsage } from "@/lib/analytics/usage";
import {
  HttpError,
  requireDeck,
  requireSlide,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import {
  fallbackPrompt,
  runSlideImagePipeline,
  truncateImageError,
  truncatePrompt,
} from "@/lib/editor/image-pipeline";

/**
 * Per-slide visual generation.
 *
 *   action "generate"     — generate (or replace) this slide's image
 *   action "retry"        — same, clearing the previous failure
 *   action "placeholder"  — drop back to a neutral placeholder
 *
 * The image pipeline is per slide on purpose: one failed visual never blocks the
 * deck, and a finished slide stays viewable while another is still rendering.
 * `<SlideCanvas>` owns the rendering of every state, so this route only ever has
 * to keep `imageStatus`, `imageUrl` and `imageError` truthful.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

type SlideParams = { params: Promise<{ id: string; slideId: string }> };

const imageActionSchema = z.object({
  action: z.enum(["generate", "retry", "placeholder"]),
  /**
   * Optional prompt override — used when the founder just accepted a new
   * "Generate Visual" direction and wants the image produced from it.
   */
  prompt: z.string().max(1000).optional(),
});

export const POST = withErrorHandling<[Request, SlideParams]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id, slideId } = await params;
    await requireDeck(id, user.id);
    const slide = await requireSlide(slideId, user.id);

    if (slide.deckId !== id) {
      throw new HttpError(404, "Slide not found.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = imageActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
    }

    const { action } = parsed.data;

    // --- Back to a neutral placeholder ---------------------------------------
    if (action === "placeholder") {
      const cleared = await prisma.slide.update({
        where: { id: slide.id },
        data: { imageUrl: null, imageStatus: "NONE", imageError: null },
        select: { id: true, imageUrl: true, imageStatus: true, imageError: true },
      });

      return NextResponse.json({ action, slide: cleared });
    }

    // --- Generate / retry ----------------------------------------------------
    // Mark GENERATING first so any concurrent render of this slide shows the
    // progress state rather than a stale "no visual" panel.
    await prisma.slide.update({
      where: { id: slide.id },
      data: { imageStatus: "GENERATING", imageError: null },
    });

    const prompt = parsed.data.prompt
      ? truncatePrompt(parsed.data.prompt)
      : truncatePrompt(slide.imagePrompt) || fallbackPrompt(slide.title);

    const result = await runSlideImagePipeline({
      prompt,
      title: slide.title,
      fileName: `deck-${id}-slide-${slide.order}-${Date.now()}.png`,
    });

    if (!result.ok) {
      const failed = await prisma.slide.update({
        where: { id: slide.id },
        data: {
          imageStatus: "FAILED",
          imageError: truncateImageError(result.error),
        },
        select: { id: true, imageUrl: true, imageStatus: true, imageError: true },
      });

      return NextResponse.json({ action, slide: failed }, { status: 502 });
    }

    const ready = await prisma.slide.update({
      where: { id: slide.id },
      data: {
        imageUrl: result.imageUrl,
        imageStatus: "READY",
        imageError: null,
        imagePrompt: result.imagePrompt,
      },
      select: { id: true, imageUrl: true, imageStatus: true, imageError: true },
    });

    trackUsage({
      type: "IMAGE_GENERATION",
      userId: user.id,
      workspaceId: user.workspaceId,
      deckId: id,
      quantity: 1,
      bytes: result.bytes,
      meta: { slideId: slide.id, action },
    });
    trackUsage({
      type: "STORAGE",
      userId: user.id,
      workspaceId: user.workspaceId,
      deckId: id,
      quantity: 1,
      bytes: result.bytes,
      meta: { slideId: slide.id },
    });

    return NextResponse.json({ action, slide: ready });
  },
);
