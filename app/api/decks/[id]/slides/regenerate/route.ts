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
import {
  runEditorialAction,
  type SlideProposal,
} from "@/lib/ai/slide-generation";
import { toDeckContext } from "@/lib/ai/deck-context";
import { prisma } from "@/lib/db";
import {
  EDITORIAL_ACTIONS,
  EditableSlideSchema,
  EditorialActionSchema,
} from "@/lib/schemas/slide";
import { createVersion } from "@/lib/versions/snapshot";

/**
 * Single-slide AI regeneration.
 *
 * This route can ONLY ever touch one slide. It reads the deck for grounding,
 * runs the action against exactly the requested slide, and stores the result as
 * a PENDING `SlideRevision`. The live slide is not modified here — the founder
 * compares the proposal against the current version in the Regeneration dialog
 * and only then accepts or discards it.
 *
 * Nothing in the accept path writes to another slide, to any slide's `order`, to
 * deck metadata, to brand settings, or to another slide's image. The only write
 * to the live slide is `prisma.slide.update({ where: { id: slide.id } })` with an
 * explicit field list that excludes `imageUrl`, `imageStatus` and `imageError`.
 *
 *   POST  — { slideId, action } → creates a PENDING revision, returns the proposal
 *   PATCH — { revisionId, decision: "accept" | "discard" }
 */

export const runtime = "nodejs";
export const maxDuration = 60;

type DeckParams = { params: Promise<{ id: string }> };

const regenerateSchema = z.object({
  slideId: z.string().min(1),
  action: EditorialActionSchema,
});

const decisionSchema = z.object({
  revisionId: z.string().min(1),
  decision: z.enum(["accept", "discard"]),
});

/** The shape stored in `SlideRevision.snapshot` for every proposal. */
const revisionSnapshotSchema = z.object({
  action: EditorialActionSchema,
  summary: z.string(),
  dataNeeded: z.array(z.string()).default([]),
  slide: EditableSlideSchema,
});

const revisionStatusSchema = z.enum(["PENDING", "ACCEPTED", "DISCARDED"]);

function toSlidePayload(slide: {
  id: string;
  order: number;
  title: string;
  subtitle: string | null;
  content: string;
  layout: string;
  blocks: unknown;
  caption: string | null;
  label: string | null;
  imagePrompt: string;
  speakerNotes: string | null;
  notes: string | null;
  imageUrl: string | null;
  imageStatus: string;
  imageError: string | null;
  userEdited: boolean;
}) {
  return {
    id: slide.id,
    order: slide.order,
    title: slide.title,
    subtitle: slide.subtitle,
    content: slide.content,
    layout: slide.layout,
    blocks: slide.blocks,
    caption: slide.caption,
    label: slide.label,
    imagePrompt: slide.imagePrompt,
    speakerNotes: slide.speakerNotes,
    notes: slide.notes,
    imageUrl: slide.imageUrl,
    imageStatus: slide.imageStatus,
    imageError: slide.imageError,
    userEdited: slide.userEdited,
  };
}

export const POST = withErrorHandling<[Request, DeckParams]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    const deck = await requireDeck(id, user.id);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = regenerateSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ??
          `Action must be one of: ${EDITORIAL_ACTIONS.join(", ")}.`,
      );
    }

    const { slideId, action } = parsed.data;
    const slide = await requireSlide(slideId, user.id);

    if (slide.deckId !== deck.id) {
      throw new HttpError(404, "Slide not found.");
    }

    const proposal: SlideProposal = await runEditorialAction({
      context: toDeckContext(deck),
      slide: {
        order: slide.order,
        title: slide.title,
        subtitle: slide.subtitle,
        content: slide.content,
        layout: slide.layout,
        caption: slide.caption,
        label: slide.label,
        imagePrompt: slide.imagePrompt,
        speakerNotes: slide.speakerNotes,
        blocks: slide.blocks,
        userEdited: slide.userEdited,
      },
      action,
    });

    const revision = await prisma.slideRevision.create({
      data: {
        slideId: slide.id,
        deckId: deck.id,
        status: "PENDING",
        summary: proposal.summary,
        snapshot: {
          action,
          summary: proposal.summary,
          dataNeeded: proposal.dataNeeded,
          slide: proposal.slide,
        } as object,
      },
      select: { id: true },
    });

    trackUsage({
      type: "AI_GENERATION",
      userId: user.id,
      workspaceId: user.workspaceId,
      deckId: deck.id,
      meta: { operation: "slide_regeneration", action },
    });
    trackUsage({
      type: "SLIDE_GENERATED",
      userId: user.id,
      workspaceId: user.workspaceId,
      deckId: deck.id,
      quantity: 1,
      meta: { action, scope: "single_slide" },
    });

    return NextResponse.json({
      revisionId: revision.id,
      action,
      proposal: {
        summary: proposal.summary,
        dataNeeded: proposal.dataNeeded,
        slide: proposal.slide,
      },
      /** Echoed so the dialog can label the "Current Version" side. */
      current: toSlidePayload(slide),
    });
  },
);

export const PATCH = withErrorHandling<[Request, DeckParams]>(
  async (request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    await requireDeck(id, user.id);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Choose either the new version or the current one.");
    }

    const { revisionId, decision } = parsed.data;

    const revision = await prisma.slideRevision.findFirst({
      where: { id: revisionId, deckId: id },
      select: { id: true, slideId: true, status: true, snapshot: true },
    });

    if (!revision) {
      throw new HttpError(404, "That suggestion is no longer available.");
    }

    const currentStatus = revisionStatusSchema.catch("PENDING").parse(revision.status);

    if (currentStatus !== "PENDING") {
      throw new HttpError(400, "That suggestion has already been resolved.");
    }

    if (decision === "discard") {
      await prisma.slideRevision.update({
        where: { id: revision.id },
        data: { status: "DISCARDED" },
      });

      return NextResponse.json({ status: "DISCARDED" as const, slide: null });
    }

    const snapshot = revisionSnapshotSchema.safeParse(revision.snapshot);
    if (!snapshot.success) {
      throw new HttpError(400, "That suggestion could not be read. Please regenerate.");
    }

    const { slide: proposed } = snapshot.data;

    /**
     * The single write of the whole regeneration flow.
     *
     * An explicit field list — `imageUrl`, `imageStatus`, `imageError`, `order`,
     * `deckId` and `userEdited` are intentionally absent, so accepting a
     * proposal can never clobber an image or move the slide.
     */
    const updated = await prisma.slide.update({
      where: { id: revision.slideId },
      data: {
        title: proposed.title,
        subtitle: proposed.subtitle ?? null,
        content: proposed.content,
        layout: proposed.layout,
        blocks: (proposed.blocks ?? []) as object,
        caption: proposed.caption ?? null,
        label: proposed.label ?? null,
        imagePrompt: proposed.imagePrompt,
        speakerNotes: proposed.speakerNotes ?? null,
      },
    });

    await prisma.slideRevision.update({
      where: { id: revision.id },
      data: { status: "ACCEPTED" },
    });

    // A full `regenerate` is a substantive deck change, so it is recorded in
    // version history. Narrower editorial actions stay out of the timeline.
    if (snapshot.data.action === "regenerate") {
      const withSlides = await prisma.deck.findFirst({
        where: { id, userId: user.id },
        include: { slides: { orderBy: { order: "asc" } } },
      });

      if (withSlides) {
        await createVersion({
          deckId: id,
          deck: withSlides,
          summary: `Regenerated slide ${updated.order}: ${updated.title}`,
          createdById: user.id,
        });
      }
    }

    return NextResponse.json({
      status: "ACCEPTED" as const,
      action: snapshot.data.action,
      summary: snapshot.data.summary,
      dataNeeded: snapshot.data.dataNeeded,
      slide: toSlidePayload(updated),
    });
  },
);
