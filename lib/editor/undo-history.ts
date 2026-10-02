"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Dependency-free undo/redo history for the editor.
 *
 * Two details make this usable in a text-heavy editor rather than a toy:
 *
 *  1. COALESCING. Typing in one field produces a state per keystroke. Entries
 *     recorded within `coalesceWindowMs` of the previous one, for the same
 *     target, are merged into the previous entry instead of stacked. So one
 *     sentence typed into the title is a single undo step, not forty.
 *
 *  2. BRANCHING. A new edit after an undo discards the redo tail, which is what
 *     every text editor does.
 *
 * The history holds plain snapshots of the state being edited (the slide list),
 * so it stays small and serialisable. `undo` and `redo` deliberately return
 * nothing: the caller reacts to the new `present` value, which keeps the whole
 * hook a pure function of state.
 */

const MAX_ENTRIES = 50;
const COALESCE_WINDOW_MS = 700;

export type HistoryEntry<T> = {
  /** Snapshot of the state AFTER this change. */
  state: T;
  /** Coalesce key — equal keys within the window merge into one entry. */
  key: string;
  /** Human-readable description, e.g. "Title". */
  label: string;
  /** Epoch ms when this entry was recorded. */
  at: number;
};

export type HistoryMeta = { key: string; label: string };

type HistoryState<T> = {
  entries: HistoryEntry<T>[];
  index: number;
};

export type UndoHistory<T> = {
  /** The state the editor should render. */
  present: T;
  /** Record a new state. Reuse the same key to coalesce rapid edits. */
  record: (state: T, meta: HistoryMeta) => void;
  /** Replace the current state without creating a history entry. */
  reset: (state: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Human-readable description of the next undo step, for a tooltip. */
  undoLabel: string | null;
  redoLabel: string | null;
};

const INITIAL_KEY = "__init__";

export function useUndoHistory<T>(initial: T): UndoHistory<T> {
  const [history, setHistory] = useState<HistoryState<T>>(() => ({
    entries: [{ state: initial, key: INITIAL_KEY, label: "Open deck", at: 0 }],
    index: 0,
  }));

  const record = useCallback((state: T, meta: HistoryMeta) => {
    setHistory((current) => {
      const head = current.entries[current.index];

      // Identical state: nothing to remember, and no extra network write.
      if (head && shallowEqual(head.state, state)) {
        return current;
      }

      // Coalesce a rapid follow-up edit to the same target into the head entry,
      // so a burst of keystrokes in one input undoes as one step.
      if (
        head &&
        head.key === meta.key &&
        meta.key !== INITIAL_KEY &&
        Date.now() - head.at < COALESCE_WINDOW_MS
      ) {
        const entries = current.entries.slice(0, current.index + 1);
        entries[current.index] = {
          state,
          key: meta.key,
          label: meta.label,
          at: Date.now(),
        };
        return { entries, index: current.index };
      }

      // A new edit after an undo drops the redo tail.
      const entries = current.entries.slice(0, current.index + 1);
      entries.push({
        state,
        key: meta.key,
        label: meta.label,
        at: Date.now(),
      });

      const trimmed =
        entries.length > MAX_ENTRIES
          ? entries.slice(entries.length - MAX_ENTRIES)
          : entries;

      return { entries: trimmed, index: trimmed.length - 1 };
    });
  }, []);

  const reset = useCallback((state: T) => {
    setHistory({
      entries: [{ state, key: INITIAL_KEY, label: "Open deck", at: 0 }],
      index: 0,
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) =>
      current.index <= 0 ? current : { ...current, index: current.index - 1 },
    );
  }, []);

  const redo = useCallback(() => {
    setHistory((current) =>
      current.index >= current.entries.length - 1
        ? current
        : { ...current, index: current.index + 1 },
    );
  }, []);

  return useMemo(
    () => ({
      present: history.entries[history.index]?.state as T,
      record,
      reset,
      undo,
      redo,
      canUndo: history.index > 0,
      canRedo: history.index < history.entries.length - 1,
      undoLabel:
        history.index > 0 ? (history.entries[history.index]?.label ?? null) : null,
      redoLabel:
        history.index < history.entries.length - 1
          ? (history.entries[history.index + 1]?.label ?? null)
          : null,
    }),
    [history, record, redo, reset, undo],
  );
}

/**
 * Global Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (plus Ctrl+Y) shortcuts.
 *
 * A plain undo inside a text field is left to the field, so a caret in the title
 * input still behaves like a normal text input. The explicit undo/redo buttons
 * always go through the hook.
 */
export function useHistoryShortcuts(
  history: Pick<UndoHistory<unknown>, "undo" | "redo" | "canUndo" | "canRedo">,
) {
  const { undo, redo, canUndo, canRedo } = history;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (!modifier || (key !== "z" && key !== "y")) {
        return;
      }

      const isRedo = key === "y" || event.shiftKey;
      const target = event.target as HTMLElement | null;
      const inTextField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if (inTextField && !isRedo) {
        return;
      }

      if (isRedo ? canRedo : canUndo) {
        event.preventDefault();
        if (isRedo) {
          redo();
        } else {
          undo();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canRedo, canUndo, redo, undo]);
}

/**
 * Structural equality good enough for editor state: slide content is either a
 * primitive, an array of plain objects, or a nested plain object. Using this
 * instead of `JSON.stringify` keeps keystroke-rate comparisons cheap and stable
 * (key order is irrelevant).
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => shallowEqual(item, b[index]));
  }

  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const leftKeys = Object.keys(left);

    if (leftKeys.length !== Object.keys(right).length) {
      return false;
    }

    return leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        shallowEqual(left[key], right[key]),
    );
  }

  return false;
}
