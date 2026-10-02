import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HttpError,
  requireDeck,
  requireUser,
  withErrorHandling,
} from "@/lib/api/guards";
import { prisma } from "@/lib/db";

type DeckParams = { params: Promise<{ id: string }> };

const renameSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  startupName: z.string().trim().max(160).nullish(),
  stage: z
    .enum([
      "BOOTSTRAP",
      "PRE_SEED",
      "SEED",
      "SERIES_A",
      "SERIES_B",
      "GROWTH",
      "LATER",
      "UNKNOWN",
    ])
    .optional(),
  deckType: z
    .enum(["PITCH_DECK", "ONE_PAGER", "DATA_ROOM", "UPDATE"])
    .optional(),
  askAmount: z.string().trim().max(120).nullish(),
  idea: z.string().trim().min(20).max(8000).optional(),
});

/** Get one deck with its slides (ordered). Ownership enforced server-side. */
export const GET = withErrorHandling<[Request, DeckParams]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    const deck = await requireDeck(id, user.id);

    return NextResponse.json({
      id: deck.id,
      idea: deck.idea,
      title: deck.title,
      startupName: deck.startupName,
      deckType: deck.deckType,
      stage: deck.stage,
      askAmount: deck.askAmount,
      status: deck.status,
      errorMessage: deck.errorMessage,
      pitchScore: deck.pitchScore,
      completion: deck.completion,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      slides: deck.slides,
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

    // Accept either a bare rename or a full metadata patch.
    const renameParsed = renameSchema.safeParse(body);
    if (renameParsed.success) {
      const deck = await prisma.deck.update({
        where: { id },
        data: { title: renameParsed.data.title },
      });
      return NextResponse.json({ id: deck.id, title: deck.title });
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid request",
      );
    }

    const deck = await prisma.deck.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined
          ? { title: parsed.data.title }
          : {}),
        ...(parsed.data.startupName !== undefined
          ? { startupName: parsed.data.startupName }
          : {}),
        ...(parsed.data.stage !== undefined
          ? { stage: parsed.data.stage }
          : {}),
        ...(parsed.data.deckType !== undefined
          ? { deckType: parsed.data.deckType }
          : {}),
        ...(parsed.data.askAmount !== undefined
          ? { askAmount: parsed.data.askAmount }
          : {}),
        ...(parsed.data.idea !== undefined ? { idea: parsed.data.idea } : {}),
      },
    });

    return NextResponse.json({ id: deck.id, title: deck.title });
  },
);

export const DELETE = withErrorHandling<[Request, DeckParams]>(
  async (_request, { params }) => {
    const user = await requireUser();
    const { id } = await params;
    // Slides, revisions, versions, shares, views, reviews, questions,
    // attempts, chat messages and assets all cascade.
    await requireDeck(id, user.id);
    await prisma.deck.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  },
);