"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  Analytics01Icon,
  ArrowLeft01Icon,
  DownloadIcon,
  EyeIcon,
  PencilIcon,
  PresentIcon,
  RetryIcon,
  Share01Icon,
  SparklesIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { saveStateLabel, type SaveState } from "@/lib/editor/use-deck-editor";

/**
 * Editor top bar.
 *
 * Everything here is about confidence while editing: the deck is named, the save
 * state is always visible, history is one keystroke away, and the ways out of
 * the editor (review, share, export, present) are in the same place.
 *
 * A failed save never disappears quietly — it turns into an inline error with a
 * Retry, and the founder's edit stays in the editor until it lands.
 */

export type TopBarProps = {
  deckId: string;
  deckTitle: string;
  onRename: (title: string) => void;
  saveState: SaveState;
  saveError: string | null;
  onRetrySave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  onUndo: () => void;
  onRedo: () => void;
  hasSlides: boolean;
  onPreview: () => void;
  onPresent: () => void;
};

export function TopBar({
  deckId,
  deckTitle,
  onRename,
  saveState,
  saveError,
  onRetrySave,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  hasSlides,
  onPreview,
  onPresent,
}: TopBarProps) {
  const [draft, setDraft] = useState(deckTitle);
  const [editingName, setEditingName] = useState(false);
  const [knownTitle, setKnownTitle] = useState(deckTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-sync the draft when the deck name changes underneath us (a rename from
  // elsewhere, or a reload). Adjusting during render avoids a cascading effect.
  if (knownTitle !== deckTitle) {
    setKnownTitle(deckTitle);
    setDraft(deckTitle);
  }

  useEffect(() => {
    if (editingName) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingName]);

  function commitName() {
    const next = draft.trim();
    setEditingName(false);

    if (next.length === 0) {
      setDraft(deckTitle);
      return;
    }

    if (next !== deckTitle) {
      onRename(next);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface-1/95 px-3 backdrop-blur-md lg:px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Back to my decks"
        render={<Link href="/decks" />}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden />
      </Button>

      <div className="flex min-w-0 items-center gap-2">
        {editingName ? (
          <Input
            ref={inputRef}
            value={draft}
            maxLength={200}
            aria-label="Deck name"
            className="h-8 w-56 text-sm"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitName();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(deckTitle);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="group/name flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="truncate font-heading text-sm font-medium">
              {deckTitle}
            </span>
            <HugeiconsIcon
              icon={PencilIcon}
              className="size-3.5 shrink-0 text-subtle-foreground opacity-0 transition-opacity group-hover/name:opacity-100"
              aria-hidden
            />
            <span className="sr-only">Rename deck</span>
          </button>
        )}
      </div>

      <SaveIndicator
        saveState={saveState}
        saveError={saveError}
        onRetry={onRetrySave}
      />

      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex items-center gap-0.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      undoLabel ? `Undo ${undoLabel}` : "Undo — nothing to undo yet"
                    }
                    disabled={!canUndo}
                    onClick={onUndo}
                  />
                }
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden />
              </TooltipTrigger>
              <TooltipContent>
                {undoLabel ? `Undo ${undoLabel}` : "Nothing to undo"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      redoLabel ? `Redo ${redoLabel}` : "Redo — nothing to redo yet"
                    }
                    disabled={!canRedo}
                    onClick={onRedo}
                  />
                }
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="rotate-180" aria-hidden />
              </TooltipTrigger>
              <TooltipContent>
                {redoLabel ? `Redo ${redoLabel}` : "Nothing to redo"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          disabled={!hasSlides}
          onClick={onPreview}
        >
          <HugeiconsIcon icon={EyeIcon} aria-hidden />
          Preview
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          disabled={!hasSlides}
          onClick={onPresent}
        >
          <HugeiconsIcon icon={PresentIcon} aria-hidden />
          Present
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="hidden lg:inline-flex"
          render={<Link href={`/decks/${deckId}/review`} />}
        >
          <HugeiconsIcon icon={Analytics01Icon} aria-hidden />
          AI Review
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden lg:inline-flex"
          aria-label="Share this deck"
          render={<Link href={`/decks/${deckId}/share`} />}
        >
          <HugeiconsIcon icon={Share01Icon} aria-hidden />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="default" size="sm" className="gap-1.5">
                <HugeiconsIcon icon={DownloadIcon} aria-hidden />
                <span className="hidden sm:inline">Export</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Export this deck</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={<a href={`/api/decks/${deckId}/export?format=pdf`} />}
            >
              <HugeiconsIcon icon={DownloadIcon} aria-hidden />
              PDF document
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<a href={`/api/decks/${deckId}/export?format=pptx`} />}
            >
              <HugeiconsIcon icon={DownloadIcon} aria-hidden />
              PowerPoint (PPTX)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={<Link href={`/decks/${deckId}/review`} />}
            >
              <HugeiconsIcon icon={SparklesIcon} aria-hidden />
              Run an AI review first
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function SaveIndicator({
  saveState,
  saveError,
  onRetry,
}: {
  saveState: SaveState;
  saveError: string | null;
  onRetry: () => void;
}) {
  if (saveState === "error") {
    return (
      <div
        role="alert"
        className="flex min-w-0 items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs text-destructive"
      >
        <HugeiconsIcon icon={RetryIcon} className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{saveError ?? "Could not save changes."}</span>
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0 text-destructive hover:bg-destructive/15"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (saveState === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        {saveStateLabel(saveState)}
      </span>
    );
  }

  return (
    <span className="hidden items-center gap-1.5 text-xs text-subtle-foreground sm:flex">
      {saveStateLabel(saveState)}
    </span>
  );
}
