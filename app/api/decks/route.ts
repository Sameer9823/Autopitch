import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, withErrorHandling } from "@/lib/api/guards";
import { trackUsage } from "@/lib/analytics/usage";
import { prisma } from "@/lib/db";
import { DeckStatus } from "@/lib/generated/prisma/client";
import { inngest } from "@/lib/inngest/client";

const createDeckSchema = z.object({
  idea: z
    .string()
    .trim()
    .min(20, "Project idea must be at least 20 characters.")
    .max(8000),
  startupName: z.string().trim().max(160).optional(),
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
});

/** List the current user's decks, newest first. */
export const GET = withErrorHandling<[]>(async () => {
  const user = await requireUser();

  const decks = await prisma.deck.findMany({
    where: { userId: user.id, workspaceId: user.workspaceId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { slides: true, views: true } },
    },
  });

  return NextResponse.json(
    decks.map((deck) => ({
      id: deck.id,
      idea: deck.idea,
      title: deck.title,
      startupName: deck.startupName,
      deckType: deck.deckType,
      stage: deck.stage,
      status: deck.status,
      errorMessage: deck.errorMessage,
      pitchScore: deck.pitchScore,
      completion: deck.completion,
      slideCount: deck._count.slides,
      viewCount: deck._count.views,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
    })),
  );
});

/** Create a deck owned by the current user and start background generation. */
export const POST = withErrorHandling<[Request]>(async (request) => {
  const user = await requireUser();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createDeckSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const deck = await prisma.deck.create({
    data: {
      idea: parsed.data.idea,
      startupName: parsed.data.startupName ?? null,
      stage: parsed.data.stage ?? "UNKNOWN",
      deckType: parsed.data.deckType ?? "PITCH_DECK",
      status: DeckStatus.PENDING,
      userId: user.id,
      workspaceId: user.workspaceId,
    },
  });

  await inngest.send({
    name: "deck/generate",
    data: { deckId: deck.id, userId: user.id, workspaceId: user.workspaceId },
  });

  trackUsage({
    type: "DECK_GENERATED",
    userId: user.id,
    workspaceId: user.workspaceId,
    deckId: deck.id,
  });

  return NextResponse.json({ id: deck.id, status: deck.status }, { status: 201 });
});
