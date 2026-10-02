import { z } from "zod";

import { prisma } from "@/lib/db";
import { parseSlideBlocks, SlideLayoutSchema } from "@/lib/schemas/slide";

/**
 * Deck version history.
 *
 * History is append-only. Restoring never deletes or rewrites an existing
 * version — it snapshots the restored state as a NEW version whose
 * `isRestoredFrom` points at the version that was restored.
 */

export const DeckSnapshotSlideSchema = z.object({
  order: z.number().int(),
  title: z.string(),
  subtitle: z.string().nullable(),
  content: z.string(),
  layout: z.string(),
  caption: z.string().nullable(),
  label: z.string().nullable(),
  imagePrompt: z.string(),
  imageUrl: z.string().nullable(),
  blocks: z.array(z.unknown()),
  speakerNotes: z.string().nullable(),
});

export const DeckSnapshotSchema = z.object({
  deck: z.object({
    title: z.string().nullable(),
    startupName: z.string().nullable(),
    stage: z.string(),
    deckType: z.string(),
    askAmount: z.string().nullable(),
    idea: z.string(),
  }),
  slides: z.array(DeckSnapshotSlideSchema),
});

export type DeckSnapshot = z.infer<typeof DeckSnapshotSchema>;

type SlideForSnapshot = {
  order: number;
  title: string;
  subtitle: string | null;
  content: string;
  layout: string;
  caption: string | null;
  label: string | null;
  imagePrompt: string;
  imageUrl: string | null;
  blocks: unknown;
  speakerNotes: string | null;
};

type DeckForSnapshot = {
  title: string | null;
  startupName: string | null;
  stage: string;
  deckType: string;
  askAmount: string | null;
  idea: string;
  slides: SlideForSnapshot[];
};

export function buildSnapshot(deck: DeckForSnapshot): DeckSnapshot {
  return {
    deck: {
      title: deck.title,
      startupName: deck.startupName,
      stage: deck.stage,
      deckType: deck.deckType,
      askAmount: deck.askAmount,
      idea: deck.idea,
    },
    slides: [...deck.slides]
      .sort((a, b) => a.order - b.order)
      .map((slide) => ({
        order: slide.order,
        title: slide.title,
        subtitle: slide.subtitle,
        content: slide.content,
        layout: SlideLayoutSchema.catch("CONTENT").parse(slide.layout),
        caption: slide.caption,
        label: slide.label,
        imagePrompt: slide.imagePrompt,
        imageUrl: slide.imageUrl,
        blocks: parseSlideBlocks(slide.blocks) as unknown[],
        speakerNotes: slide.speakerNotes,
      })),
  };
}

export function parseSnapshot(input: unknown): DeckSnapshot {
  return DeckSnapshotSchema.parse(input);
}

async function nextVersionNumber(deckId: string): Promise<number> {
  const latest = await prisma.deckVersion.findFirst({
    where: { deckId },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  return (latest?.number ?? 0) + 1;
}

/** Append a new version. Never mutates or removes existing versions. */
export async function createVersion(input: {
  deckId: string;
  deck: DeckForSnapshot;
  summary: string;
  createdById?: string | null;
  isRestoredFrom?: number | null;
}) {
  const number = await nextVersionNumber(input.deckId);

  return prisma.deckVersion.create({
    data: {
      deckId: input.deckId,
      number,
      summary: input.summary,
      createdById: input.createdById ?? null,
      snapshot: buildSnapshot(input.deck) as unknown as object,
      isRestoredFrom: input.isRestoredFrom ?? null,
    },
  });
}

/** Overwrite the live deck with a snapshot's content. Caller must have authorized. */
export async function applySnapshot(deckId: string, snapshot: DeckSnapshot) {
  await prisma.$transaction(async (tx) => {
    await tx.slide.deleteMany({ where: { deckId } });

    for (const slide of snapshot.slides) {
      await tx.slide.create({
        data: {
          deckId,
          order: slide.order,
          title: slide.title,
          subtitle: slide.subtitle,
          content: slide.content,
          layout: slide.layout,
          caption: slide.caption,
          label: slide.label,
          imagePrompt: slide.imagePrompt,
          imageUrl: slide.imageUrl,
          blocks: (slide.blocks ?? []) as object,
          speakerNotes: slide.speakerNotes,
          imageStatus: slide.imageUrl ? "READY" : "NONE",
        },
      });
    }

    await tx.deck.update({
      where: { id: deckId },
      data: {
        title: snapshot.deck.title,
        startupName: snapshot.deck.startupName,
        stage: snapshot.deck.stage as never,
        deckType: snapshot.deck.deckType as never,
        askAmount: snapshot.deck.askAmount,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Version comparison
// ---------------------------------------------------------------------------

export type SlideDiff = {
  status: "added" | "removed" | "changed" | "unchanged";
  order: number | null;
  title: string;
  changes: {
    field: string;
    label: string;
    before: string | null;
    after: string | null;
  }[];
};

export type VersionDiff = {
  addedSlides: number;
  removedSlides: number;
  changedSlides: number;
  slides: SlideDiff[];
  metaChanges: {
    field: string;
    label: string;
    before: string | null;
    after: string | null;
  }[];
};

const COMPARED_FIELDS = [
  { field: "title", label: "Title" },
  { field: "subtitle", label: "Subtitle" },
  { field: "content", label: "Body text" },
  { field: "layout", label: "Layout" },
  { field: "caption", label: "Caption" },
  { field: "imagePrompt", label: "Visual prompt" },
  { field: "speakerNotes", label: "Speaker notes" },
] as const;

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Diff two snapshots. Text changes are reported per-field; blocks (bullets,
 * metrics, charts) are compared as serialized JSON so a changed metric shows up
 * as a changed "Metrics & charts" row rather than being silently ignored.
 */
export function diffSnapshots(before: DeckSnapshot, after: DeckSnapshot): VersionDiff {
  const metaChanges: VersionDiff["metaChanges"] = [];
  const metaFields = [
    { field: "title", label: "Deck title" },
    { field: "startupName", label: "Startup name" },
    { field: "stage", label: "Fundraising stage" },
    { field: "deckType", label: "Deck type" },
    { field: "askAmount", label: "Fundraising ask" },
  ] as const;

  for (const { field, label } of metaFields) {
    const b = before.deck[field] ?? null;
    const a = after.deck[field] ?? null;
    if (b !== a) metaChanges.push({ field, label, before: b, after: a });
  }

  const beforeByOrder = new Map(before.slides.map((s) => [s.order, s]));
  const afterByOrder = new Map(after.slides.map((s) => [s.order, s]));
  const orders = [
    ...new Set([...beforeByOrder.keys(), ...afterByOrder.keys()]),
  ].sort((a, b) => a - b);

  const slides: SlideDiff[] = [];

  for (const order of orders) {
    const b = beforeByOrder.get(order);
    const a = afterByOrder.get(order);

    if (!b && a) {
      slides.push({
        status: "added",
        order,
        title: a.title,
        changes: [],
      });
      continue;
    }

    if (b && !a) {
      slides.push({
        status: "removed",
        order,
        title: b.title,
        changes: [],
      });
      continue;
    }

    if (!b || !a) continue;

    const changes: SlideDiff["changes"] = [];

    for (const { field, label } of COMPARED_FIELDS) {
      const beforeValue = stringify(b[field as keyof typeof b]);
      const afterValue = stringify(a[field as keyof typeof a]);
      if (beforeValue !== afterValue) {
        changes.push({
          field: String(field),
          label,
          before: beforeValue,
          after: afterValue,
        });
      }
    }

    const beforeBlocks = stringify(b.blocks);
    const afterBlocks = stringify(a.blocks);
    if (beforeBlocks !== afterBlocks) {
      changes.push({
        field: "blocks",
        label: "Metrics, bullets & charts",
        before: beforeBlocks,
        after: afterBlocks,
      });
    }

    if (b.imageUrl !== a.imageUrl) {
      changes.push({
        field: "imageUrl",
        label: "Visual",
        before: b.imageUrl,
        after: a.imageUrl,
      });
    }

    slides.push({
      status: changes.length > 0 ? "changed" : "unchanged",
      order,
      title: a.title,
      changes,
    });
  }

  return {
    addedSlides: slides.filter((s) => s.status === "added").length,
    removedSlides: slides.filter((s) => s.status === "removed").length,
    changedSlides: slides.filter((s) => s.status === "changed").length,
    slides: slides.filter((s) => s.status !== "unchanged"),
    metaChanges,
  };
}
