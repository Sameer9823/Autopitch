"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  shallowEqual,
  useHistoryShortcuts,
  useUndoHistory,
} from "@/lib/editor/undo-history";
import {
  parseSlideBlocks,
  SlideLayoutSchema,
  SlidePatchSchema,
  type SlideBlock,
  type SlideLayout,
} from "@/lib/schemas/slide";

/**
 * The deck editor's state machine.
 *
 * Responsibilities, in order of importance:
 *
 *  1. OWNERSHIP OF SLIDE STATE. Slides are held in one place so the navigator,
 *     canvas and inspector can never disagree about what a slide contains.
 *  2. OPTIMISTIC, DEBOUNCED AUTOSAVE. Every edit lands in local state
 *     immediately, then coalesces into a single PATCH per slide after
 *     `AUTOSAVE_DEBOUNCE_MS`. Only fields that actually differ from the last
 *     server-confirmed value are sent, so typing does not produce a write per
 *     keystroke, and re-selecting a slide without changing it writes nothing.
 *  3. NEVER LOSING AN EDIT. If a PATCH fails, the local value is kept, the top
 *     bar shows the error, and Retry re-sends. Nothing is reverted under the
 *     founder's cursor.
 *  4. UNDO/REDO that re-saves. The history snapshots the slide list; a restored
 *     snapshot is diffed against the live list and exactly the slides whose
 *     content changed are PATCHed.
 *
 * Structural changes (add / duplicate / delete / reorder) and AI proposals are
 * server operations, so they reset the history rather than pushing an entry —
 * undoing them would have to resurrect a deleted database row. The Regenerate
 * dialog's "Keep Current" button is the undo for an AI proposal.
 */

const AUTOSAVE_DEBOUNCE_MS = 800;

/** Every field the editor is allowed to write. `order` and `deckId` are not here. */
const EDITABLE_FIELDS = [
  "title",
  "subtitle",
  "content",
  "layout",
  "blocks",
  "caption",
  "label",
  "imagePrompt",
  "speakerNotes",
  "notes",
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

export type SlideImageState = "NONE" | "QUEUED" | "GENERATING" | "READY" | "FAILED";

/** The editor's view of one slide. */
export type EditorSlide = {
  id: string;
  order: number;
  title: string;
  subtitle: string | null;
  content: string;
  layout: SlideLayout;
  blocks: SlideBlock[];
  caption: string | null;
  label: string | null;
  imagePrompt: string;
  speakerNotes: string | null;
  notes: string | null;
  imageUrl: string | null;
  imageStatus: SlideImageState;
  imageError: string | null;
  userEdited: boolean;
};

export type SaveState = "saved" | "saving" | "error";

/** The wording the top bar shows. Kept beside the type so they never drift. */
export function saveStateLabel(state: SaveState): string {
  switch (state) {
    case "saving":
      return "Saving…";
    case "error":
      return "Not saved";
    case "saved":
      return "Saved";
  }
}

/** The server shape the editor page hands to the client. */
export type InitialSlide = {
  id: string;
  order: number;
  title: string;
  subtitle: string | null;
  content: string | null;
  layout: string | null;
  blocks: unknown;
  caption: string | null;
  label: string | null;
  imagePrompt: string;
  speakerNotes: string | null;
  notes: string | null;
  imageUrl: string | null;
  imageStatus: string | null;
  imageError: string | null;
  userEdited: boolean;
};

export function toEditorSlide(row: InitialSlide): EditorSlide {
  return {
    id: row.id,
    order: row.order,
    title: row.title,
    subtitle: row.subtitle ?? null,
    content: row.content ?? "",
    layout: SlideLayoutSchema.catch("CONTENT").parse(row.layout),
    blocks: parseSlideBlocks(row.blocks),
    caption: row.caption ?? null,
    label: row.label ?? null,
    imagePrompt: row.imagePrompt ?? "",
    speakerNotes: row.speakerNotes ?? null,
    notes: row.notes ?? null,
    imageUrl: row.imageUrl ?? null,
    imageStatus: (row.imageStatus as SlideImageState) ?? "NONE",
    imageError: row.imageError ?? null,
    userEdited: row.userEdited,
  };
}

export function toInitialSlides(rows: InitialSlide[]): EditorSlide[] {
  return [...rows].sort((a, b) => a.order - b.order).map(toEditorSlide);
}

type Patch = Partial<Pick<EditorSlide, EditableField>>;

/** The last server-confirmed value of each editable field, per slide. */
type FieldSnapshot = Record<EditableField, unknown>;

function snapshot(slide: EditorSlide): FieldSnapshot {
  return {
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
  };
}

/**
 * The minimal PATCH for turning `from` into `to`.
 *
 * Comparing against the last CONFIRMED value (not the previous keystroke) is
 * what makes coalescing work: three keystrokes inside the debounce window
 * produce one PATCH carrying only the field the founder is typing in.
 */
function diffFields(from: FieldSnapshot, to: FieldSnapshot): Patch {
  const patch: Record<string, unknown> = {};

  for (const field of EDITABLE_FIELDS) {
    if (!shallowEqual(from[field], to[field])) {
      patch[field] = to[field];
    }
  }

  return patch as Patch;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // A non-JSON body means a proxy or platform error; never surface it raw.
  }
  return fallback;
}

export type DeckEditorApi = {
  slides: EditorSlide[];
  activeSlide: EditorSlide | null;
  activeSlideId: string | null;
  selectSlide: (slideId: string) => void;

  /** Optimistic, autosaving edit. `label` is used for undo coalescing. */
  updateSlide: (slideId: string, patch: Patch, label: string) => void;
  /** Send any pending edit for a slide right now (input blur, dialog close). */
  flushSlide: (slideId: string) => void;
  /** Re-send every failed slide. Bound to the top bar's Retry. */
  retrySave: () => void;

  saveState: SaveState;
  saveError: string | null;

  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undo: () => void;
  redo: () => void;

  /** Replace the slide list wholesale (after an AI proposal or a refresh). */
  replaceSlides: (slides: EditorSlide[], options?: { keepSelection?: boolean }) => void;
  /** Patch one slide's server-owned state (image status) without a write. */
  syncSlideFromServer: (slideId: string, patch: Partial<EditorSlide>) => void;
};

export function useDeckEditor(config: {
  deckId: string;
  initialSlides: InitialSlide[];
  initialActiveId?: string | null;
}): DeckEditorApi {
  const { deckId, initialSlides, initialActiveId } = config;

  // The seed never changes for a mounted editor, so it lives in state rather
  // than a ref that would have to be read during render.
  const [seed] = useState<EditorSlide[]>(() => toInitialSlides(initialSlides));
  const history = useUndoHistory<EditorSlide[]>(seed);
  const slides = history.present;

  const [activeSlideId, setActiveSlideId] = useState<string | null>(
    () => initialActiveId ?? seed[0]?.id ?? null,
  );

  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Which slides the founder has hand-edited.
   *
   * Kept OUT of the undo snapshots on purpose: it is server-owned metadata (the
   * server sets `userEdited` on every accepted patch), not founder-entered
   * content, so it must never appear as an undoable step.
   */
  const [handEdited, setHandEdited] = useState<ReadonlySet<string>>(
    () => new Set(seed.filter((slide) => slide.userEdited).map((slide) => slide.id)),
  );

  /** The last server-confirmed field values, per slide. */
  const confirmedRef = useRef(
    new Map(seed.map((slide) => [slide.id, snapshot(slide)])),
  );
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dirtyRef = useRef(new Set<string>());
  const inflightRef = useRef(new Set<string>());
  const errorRef = useRef<string | null>(null);

  /**
   * The live slide list for event handlers and timers.
   *
   * Writers update it synchronously; the effect below keeps it aligned with
   * whatever the history last produced, so an undo/redo restore is visible to the
   * next read without this file ever writing a ref during render.
   */
  const slidesRef = useRef(slides);
  /** Set by undo/redo so the restore effect knows to re-save immediately. */
  const restoreRef = useRef(false);

  const refreshSaveState = useCallback(() => {
    if (errorRef.current) {
      setSaveState("error");
      return;
    }

    if (dirtyRef.current.size > 0 || inflightRef.current.size > 0) {
      setSaveState("saving");
      return;
    }

    setSaveState("saved");
  }, []);

  const clearTimer = useCallback((slideId: string) => {
    const timer = timersRef.current.get(slideId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(slideId);
    }
  }, []);

  const send = useCallback(
    async (slide: EditorSlide): Promise<boolean> => {
      const confirmed = confirmedRef.current.get(slide.id) ?? snapshot(slide);
      const patch = diffFields(confirmed, snapshot(slide));

      if (Object.keys(patch).length === 0) {
        dirtyRef.current.delete(slide.id);
        errorRef.current = null;
        setSaveError(null);
        refreshSaveState();
        return true;
      }

      const parsed = SlidePatchSchema.safeParse({ ...patch, id: slide.id });

      if (!parsed.success) {
        // The edit stays in local state — nothing is dropped. The founder sees
        // what is wrong and the next valid edit saves on its own.
        const issue = parsed.error.issues[0];
        const message =
          issue?.path[0] === "title" && issue?.code === "too_small"
            ? "This slide needs a title before it can be saved."
            : (issue?.message ?? "This slide could not be saved.");
        errorRef.current = message;
        setSaveError(message);
        setSaveState("error");
        return false;
      }

      inflightRef.current.add(slide.id);
      errorRef.current = null;
      setSaveError(null);
      setSaveState("saving");

      try {
        const response = await fetch(`/api/decks/${deckId}/slides/${slide.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        });

        if (!response.ok) {
          throw new Error(await readError(response, "We could not save this slide."));
        }

        confirmedRef.current.set(slide.id, snapshot(slide));
        dirtyRef.current.delete(slide.id);
        errorRef.current = null;
        setSaveError(null);

        // The server flags a hand-edited slide so later AI regeneration knows to
        // preserve the founder's wording.
        if (!slide.userEdited) {
          setHandEdited((previous) => {
            if (previous.has(slide.id)) {
              return previous;
            }
            const next = new Set(previous);
            next.add(slide.id);
            return next;
          });
        }

        return true;
      } catch (error) {
        // Keep the slide dirty so Retry (or the next edit) can retry it.
        dirtyRef.current.add(slide.id);
        errorRef.current =
          error instanceof Error ? error.message : "We could not save this slide.";
        setSaveError(errorRef.current);
        return false;
      } finally {
        inflightRef.current.delete(slide.id);
        refreshSaveState();
      }
    },
    [deckId, refreshSaveState],
  );

  const flushSlide = useCallback(
    (slideId: string) => {
      clearTimer(slideId);
      const slide = slidesRef.current.find((candidate) => candidate.id === slideId);

      if (!slide || inflightRef.current.has(slideId)) {
        return;
      }

      void send(slide);
    },
    [clearTimer, send],
  );

  const updateSlide = useCallback(
    (slideId: string, patch: Patch, label: string) => {
      const current = slidesRef.current;
      let changed = false;

      const next = current.map((slide) => {
        if (slide.id !== slideId) {
          return slide;
        }
        const merged = { ...slide, ...patch };
        if (shallowEqual(slide, merged)) {
          return slide;
        }
        changed = true;
        return merged;
      });

      if (!changed) {
        return;
      }

      slidesRef.current = next;
      history.record(next, { key: `${slideId}:${label}`, label });

      dirtyRef.current.add(slideId);
      clearTimer(slideId);
      timersRef.current.set(
        slideId,
        setTimeout(() => {
          timersRef.current.delete(slideId);
          const latest = slidesRef.current.find((slide) => slide.id === slideId);
          if (latest) {
            void send(latest);
          }
        }, AUTOSAVE_DEBOUNCE_MS),
      );

      refreshSaveState();
    },
    [clearTimer, history, refreshSaveState, send],
  );

  const replaceSlides = useCallback(
    (incoming: EditorSlide[], options?: { keepSelection?: boolean }) => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
      dirtyRef.current.clear();
      inflightRef.current.clear();
      errorRef.current = null;
      restoreRef.current = false;
      setSaveError(null);

      const ordered = [...incoming].sort((a, b) => a.order - b.order);
      confirmedRef.current = new Map(
        ordered.map((slide) => [slide.id, snapshot(slide)]),
      );
      setHandEdited(
        new Set(ordered.filter((slide) => slide.userEdited).map((slide) => slide.id)),
      );
      history.reset(ordered);
      slidesRef.current = ordered;

      if (!options?.keepSelection) {
        setActiveSlideId(ordered[0]?.id ?? null);
      }

      refreshSaveState();
    },
    [history, refreshSaveState],
  );

  const syncSlideFromServer = useCallback(
    (slideId: string, patch: Partial<EditorSlide>) => {
      const next = slidesRef.current.map((slide) =>
        slide.id === slideId ? { ...slide, ...patch } : slide,
      );
      slidesRef.current = next;
      history.record(next, { key: `${slideId}:visual`, label: "Visual" });
    },
    [history],
  );

  const retrySave = useCallback(() => {
    for (const slideId of [...dirtyRef.current]) {
      clearTimer(slideId);
      const slide = slidesRef.current.find((candidate) => candidate.id === slideId);
      if (slide) {
        void send(slide);
      }
    }
  }, [clearTimer, send]);

  const undo = useCallback(() => {
    restoreRef.current = true;
    history.undo();
  }, [history]);

  const redo = useCallback(() => {
    restoreRef.current = true;
    history.redo();
  }, [history]);

  useHistoryShortcuts(history);

  // --- Keep the handler-visible list aligned with the history ----------------
  useEffect(() => {
    const next = history.present;
    const previous = slidesRef.current;

    if (shallowEqual(previous, next)) {
      return;
    }

    slidesRef.current = next;

    if (!restoreRef.current) {
      // A normal edit already scheduled its own debounced save.
      return;
    }

    // A restored snapshot re-saves immediately: undo is an explicit act, and the
    // founder should never have to wait out a debounce to see it stick.
    restoreRef.current = false;
    const before = new Map(previous.map((slide) => [slide.id, slide]));
    const touched: string[] = [];

    for (const slide of next) {
      const prior = before.get(slide.id);
      if (!prior || !shallowEqual(prior, slide)) {
        touched.push(slide.id);
        confirmedRef.current.set(slide.id, snapshot(slide));
      }
    }

    for (const slideId of touched) {
      const slide = next.find((candidate) => candidate.id === slideId);
      if (!slide) {
        continue;
      }
      dirtyRef.current.add(slideId);
      clearTimer(slideId);
      // Deferred so the write lands after the render that produced it.
      const timer = setTimeout(() => void send(slide), 0);
      timersRef.current.set(slideId, timer);
    }
  }, [clearTimer, history.present, send]);

  // --- Lifecycle ------------------------------------------------------------

  /**
   * Flush on unmount with `keepalive`, so an edit made in the last few hundred
   * milliseconds before navigating is not lost.
   */
  useEffect(() => {
    const liveSlides = slidesRef;
    const timers = timersRef;
    const confirmed = confirmedRef;
    const inflight = inflightRef;
    const clear = clearTimer;

    return () => {
      for (const slideId of [...timers.current.keys()]) {
        clear(slideId);
        const slide = liveSlides.current.find((candidate) => candidate.id === slideId);
        if (!slide || inflight.current.has(slideId)) {
          continue;
        }

        const known = confirmed.current.get(slide.id) ?? snapshot(slide);
        const patch = diffFields(known, snapshot(slide));
        if (Object.keys(patch).length === 0) {
          continue;
        }

        const parsed = SlidePatchSchema.safeParse({ ...patch, id: slide.id });
        if (!parsed.success) {
          continue;
        }

        void fetch(`/api/decks/${deckId}/slides/${slide.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
          keepalive: true,
        });
      }
    };
  }, [clearTimer, deckId]);

  const renderedSlides = useMemo(
    () =>
      slides.map((slide) =>
        slide.userEdited || !handEdited.has(slide.id)
          ? slide
          : { ...slide, userEdited: true },
      ),
    [handEdited, slides],
  );

  const activeSlide = useMemo(
    () =>
      renderedSlides.find((slide) => slide.id === activeSlideId) ??
      renderedSlides[0] ??
      null,
    [activeSlideId, renderedSlides],
  );

  const selectSlide = useCallback(
    (slideId: string) => {
      // Never leave a debounced edit behind when moving between slides.
      for (const id of [...timersRef.current.keys()]) {
        clearTimer(id);
        const slide = slidesRef.current.find((candidate) => candidate.id === id);
        if (slide) {
          void send(slide);
        }
      }
      setActiveSlideId(slideId);
    },
    [clearTimer, send],
  );

  return {
    slides: renderedSlides,
    activeSlide,
    activeSlideId: activeSlide?.id ?? null,
    selectSlide,

    updateSlide,
    flushSlide,
    retrySave,

    saveState,
    saveError,

    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoLabel: history.undoLabel,
    redoLabel: history.redoLabel,
    undo,
    redo,

    replaceSlides,
    syncSlideFromServer,
  };
}
