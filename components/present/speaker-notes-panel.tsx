"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  Cancel01Icon,
  EditIcon,
  RetryIcon,
  SparklesIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { RenderSlide } from "@/lib/deck/render-model";

/**
 * Speaker notes.
 *
 * Two things matter here and they pull in opposite directions:
 *
 *   1. Notes are **authored**, not transcribed. `lib/ai/speaker-notes.ts` writes
 *      what the founder *says* — the argument, the caveat, the bridge into the
 *      next slide — and its prompt forbids echoing slide text. This panel must
 *      not weaken that, so it shows the structured parts the AI returns rather
 *      than a read-aloud of the bullets.
 *   2. Notes are **the founder's**, so they stay editable. Edits save through the
 *      existing slide PATCH route; generating replaces the draft but never
 *      auto-saves over work a founder has written.
 *
 * The stored value is plain text (see `formatSpeakerNotes`), so the panel parses
 * the labelled sections back out for display and writes straight through on save.
 */

type NoteSection = {
  key: string;
  label: string;
  text: string;
};

/** Section labels, matched against what `formatSpeakerNotes` writes. */
const SECTION_LABELS: Record<string, string> = {
  "key message": "Key message",
  "supporting context": "Supporting context",
  "call out": "Metric to call out",
  say: "Say it like this",
  transition: "Transition",
};

/** The order the sections are presented in, regardless of source order. */
const SECTION_ORDER = ["Key message", "Supporting context", "Metric to call out", "Say it like this", "Transition"];

export function parseSpeakerNotes(raw: string): {
  sections: NoteSection[];
  preamble: string;
} {
  const preamble: string[] = [];
  const collected = new Map<string, string[]>();

  let currentKey: string | null = null;

  /** Get-or-create: a labelled line opens its section even when it is empty. */
  const bucketFor = (key: string): string[] => {
    const existing = collected.get(key);

    if (existing) {
      return existing;
    }

    const created: string[] = [];
    collected.set(key, created);
    return created;
  };

  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z][A-Za-z ]{2,20}):\s*(.*)$/.exec(line);

    if (match && match[1] && SECTION_LABELS[match[1].trim().toLowerCase()]) {
      currentKey = SECTION_LABELS[match[1].trim().toLowerCase()] ?? null;

      if (currentKey !== null && match[2]) {
        bucketFor(currentKey).push(match[2]);
      }

      continue;
    }

    if (currentKey === null) {
      if (line.trim().length > 0) {
        preamble.push(line.trim());
      }

      continue;
    }

    if (line.trim().length > 0) {
      bucketFor(currentKey).push(line.trim());
    }
  }

  const sections = [...collected.entries()]
    .filter(([, lines]) => lines.length > 0)
    .map(([key, lines]) => ({ key, label: key, text: lines.join(" ") }))
    .sort(
      (a, b) =>
        SECTION_ORDER.indexOf(a.label) - SECTION_ORDER.indexOf(b.label),
    );

  return { sections, preamble: preamble.join("\n\n") };
}

export type SpeakerNotesPanelProps = {
  /** Matches the `aria-controls` of the toggle button. */
  id: string;
  open: boolean;
  onClose: () => void;
  deckId: string;
  slide: RenderSlide | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type GenerateState = "idle" | "loading" | "error";

export function SpeakerNotesPanel({
  id,
  open,
  onClose,
  deckId,
  slide,
}: SpeakerNotesPanelProps) {
  const headingId = useId();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generateState, setGenerateState] = useState<GenerateState>("idle");
const [generateError, setGenerateError] = useState<string | null>(null);
const skipDirtySync = useRef(false);

  /**
   * Notes saved in this session, keyed by slide id.
   *
   * Presentation mode receives its slides from the server once, so a save cannot
   * round-trip back through the parent. Without this the panel would appear to
   * revert to the old notes the moment the founder navigated away and back.
   */
  const [saved, setSaved] = useState<Record<string, string>>({});

  const stored = (slide ? saved[slide.id] : undefined) ?? slide?.speakerNotes ?? "";

  // Follow the presented slide unless the founder is mid-edit: overwriting a
  // draft because the arrow key moved the deck would lose their words.
  useEffect(() => {
    if (skipDirtySync.current) {
      skipDirtySync.current = false;
      return;
    }

    setDraft(stored);
    setEditing(false);
    setSaveState("idle");
    setSaveError(null);
  }, [stored, slide?.id]);

  const save = useCallback(async () => {
    if (!slide) {
      return;
    }

    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await fetch(
        `/api/decks/${deckId}/slides/${slide.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speakerNotes: draft }),
        },
      );

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : "We couldn't save your notes.";

        setSaveState("error");
        setSaveError(message);
        return;
      }

      setSaveState("saved");
      setSaved((current) => ({ ...current, [slide.id]: draft }));
      setEditing(false);
    } catch {
      setSaveState("error");
      setSaveError("We couldn't reach the server to save your notes.");
    }
  }, [deckId, draft, slide]);

  const generate = useCallback(async () => {
    if (!slide) {
      return;
    }

    setGenerateState("loading");
    setGenerateError(null);

    try {
      const response = await fetch(
        `/api/decks/${deckId}/slides/${slide.id}/speaker-notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : "Speaker notes could not be generated right now.";

        setGenerateState("error");
        setGenerateError(message);
        return;
      }

      const body: unknown = await response.json().catch(() => null);
      const notes =
        body && typeof body === "object"
          ? ("notes" in body
              ? (body as { notes: unknown }).notes
              : ("speakerNotes" in body
                  ? (body as { speakerNotes: unknown }).speakerNotes
                  : null))
          : null;

      if (typeof notes !== "string" || notes.trim().length === 0) {
        setGenerateState("error");
        setGenerateError("Speaker notes could not be generated right now.");
        return;
      }

      skipDirtySync.current = true;
      setDraft(notes);
      setEditing(true);
      setSaveState("idle");
      setGenerateState("idle");
    } catch {
      setGenerateState("error");
      setGenerateError(
        "Speaker notes are unavailable right now. You can still write them yourself below.",
      );
    }
  }, [deckId, slide]);

  const parsed = parseSpeakerNotes(draft);

  if (!open) {
    return null;
  }

  return (
    <aside
      id={id}
      aria-labelledby={headingId}
      className="absolute inset-x-0 bottom-0 flex max-h-[70%] flex-col rounded-t-2xl border border-border bg-surface-1 sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-96 sm:rounded-none sm:rounded-l-2xl"
      onKeyDown={(event) => {
        // Escape inside the panel closes the panel, never the whole deck.
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 id={headingId} className="font-heading text-sm font-medium">
          Speaker notes
        </h2>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close speaker notes"
            onClick={onClose}
          >
            <HugeiconsIcon icon={Cancel01Icon} aria-hidden />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!slide ? (
          <p className="text-sm text-muted-foreground">No slide selected.</p>
        ) : editing ? (
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`${id}-textarea`}
              className="text-xs font-medium text-muted-foreground"
            >
              Your script for this slide
            </label>
            <Textarea
              id={`${id}-textarea`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={14}
              maxLength={8000}
              placeholder="Key message: …"
            />
            <p className="text-xs text-subtle-foreground">
              Write what you will say out loud — not the slide text again.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {parsed.preamble ? (
              <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
                {parsed.preamble}
              </p>
            ) : null}

            {parsed.sections.length === 0 && parsed.preamble.length === 0 ? (
              <div
                className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-3"
                role="status"
              >
                <p className="text-sm text-muted-foreground">
                  No notes for this slide yet. Generate a starting point, or
                  write your own.
                </p>
              </div>
            ) : null}

            {parsed.sections.map((section) => (
              <section key={section.key} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium tracking-wide text-brand uppercase">
                  {section.label}
                </h3>
                <p className="text-sm leading-relaxed text-foreground">
                  {section.text}
                </p>
              </section>
            ))}
          </div>
        )}

        {saveError ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 text-sm text-destructive"
          >
            <HugeiconsIcon
              icon={RetryIcon}
              className="mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <span>{saveError}</span>
          </p>
        ) : null}

        {generateError ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 text-sm text-destructive"
          >
            <HugeiconsIcon
              icon={RetryIcon}
              className="mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <span>{generateError}</span>
          </p>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        {editing ? (
          <>
            <Button size="sm" onClick={() => void save()} disabled={saveState === "saving"}>
              {saveState === "saving" ? <Spinner /> : null}
              {saveState === "saving" ? "Saving…" : "Save notes"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(stored);
                setEditing(false);
                setSaveState("idle");
                setSaveError(null);
              }}
              disabled={saveState === "saving"}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={!slide}
          >
            <HugeiconsIcon icon={EditIcon} aria-hidden />
            Edit notes
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => void generate()}
          disabled={generateState === "loading" || !slide}
        >
          {generateState === "loading" ? (
            <Spinner />
          ) : (
            <HugeiconsIcon icon={SparklesIcon} aria-hidden />
          )}
          {generateState === "loading" ? "Writing…" : "Generate notes"}
        </Button>

        {saveState === "saved" && !editing ? (
          <span className="text-xs text-muted-foreground" role="status">
            Saved
          </span>
        ) : null}
      </footer>
    </aside>
  );
}