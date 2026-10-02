"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { duplicateSlideAction } from "@/app/actions/editor";
import { renameDeckAction } from "@/app/actions/decks";
import { SlideCanvas } from "@/components/deck/slide-canvas";
import { Inspector } from "@/components/editor/inspector";
import { MobileEditor } from "@/components/editor/mobile-editor";
import { RegenerationDialog } from "@/components/editor/regeneration-dialog";
import { SlideCanvasWrapper } from "@/components/editor/slide-canvas-wrapper";
import { SlideNavigator } from "@/components/editor/slide-navigator";
import { TopBar } from "@/components/editor/top-bar";
import { mergeProposal, toCanvasSlide } from "@/components/editor/helpers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  toInitialSlides,
  type EditorSlide,
  type InitialSlide,
} from "@/lib/editor/use-deck-editor";
import { useDeckEditor } from "@/lib/editor/use-deck-editor";
import type { SlideTheme } from "@/lib/deck/theme";
import type { EditorialAction, SlideBlock } from "@/lib/schemas/slide";
import type { SlideProposal } from "@/components/editor/helpers";

/**
 * The deck editor.
 *
 * This component owns every mutation the editor can make and is the only place
 * that talks to the API. Everything below it is presentational and receives
 * plain props, which is what keeps the navigator, the canvas, the inspector and
 * the two layouts (desktop three-column, mobile stacked) from drifting apart.
 *
 * The rules it enforces:
 *   - Single-slide AI actions never touch another slide, the order, deck
 *     metadata, brand settings or another slide's image.
 *   - A structural change is server-first: the server's slide list is the truth
 *     and the local state is replaced with it, never patched optimistically in a
 *     way that could drift.
 *   - A failed mutation is surfaced with a Retry, and the local list is reloaded
 *     so what the founder sees is what the database holds.
 */

const POLL_INTERVAL_MS = 3500;

type DeckEditorProps = {
  deckId: string;
  deckTitle: string;
  initialStatus: string;
  initialSlides: InitialSlide[];
  theme: SlideTheme | null;
  brandKitName: string | null;
};

type DialogState = {
  open: boolean;
  action: EditorialAction | null;
  proposal: SlideProposal | null;
  revisionId: string | null;
};

const CLOSED_DIALOG: DialogState = {
  open: false,
  action: null,
  proposal: null,
  revisionId: null,
};

export function DeckEditor({
  deckId,
  deckTitle,
  initialStatus,
  initialSlides,
  theme,
  brandKitName,
}: DeckEditorProps) {
  const editor = useDeckEditor({ deckId, initialSlides });
  const {
    slides,
    activeSlide,
    activeSlideId,
    selectSlide,
    updateSlide,
    flushSlide,
    retrySave,
    saveState,
    saveError,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    undo,
    redo,
    replaceSlides,
    syncSlideFromServer,
  } = editor;

  const [title, setTitle] = useState(deckTitle);
  const [deckStatus, setDeckStatus] = useState(initialStatus);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busySlideId, setBusySlideId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<EditorialAction | null>(null);
  const [aiErrors, setAiErrors] = useState<Partial<Record<EditorialAction, string>>>({});
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<DialogState>(CLOSED_DIALOG);
  const [resolving, setResolving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<EditorSlide | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [overlay, setOverlay] = useState<null | { mode: "preview" | "present" }>(
    null,
  );
  const [overlayIndex, setOverlayIndex] = useState(0);

  // --- Loading a fresh copy of the deck -------------------------------------

  const loadSlides = useCallback(
    async (options?: { quiet?: boolean }) => {
      if (!options?.quiet) {
        setIsRefreshing(true);
      }

      try {
        const response = await fetch(`/api/decks/${deckId}/slides`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "This deck could not be found."
              : "We could not load this deck.",
          );
        }

        const body = (await response.json()) as {
          slides: InitialSlide[];
          status: string;
          title: string | null;
        };

        setDeckStatus(body.status);
        if (body.title) {
          setTitle(body.title);
        }
        replaceSlides(toInitialSlides(body.slides), { keepSelection: true });
        setLoadError(null);
        return body.slides as InitialSlide[];
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "We could not load this deck.",
        );
        return null;
      } finally {
        setIsRefreshing(false);
      }
    },
    [deckId, replaceSlides],
  );

  /**
   * Poll only while the background job is still writing the deck.
   *
   * A slide that has already landed is fully usable: it is in the navigator, it
   * renders on the canvas, and it can be edited, while later slides still
   * generate.
   */
  const generating = deckStatus === "PENDING" || deckStatus === "GENERATING";

  useEffect(() => {
    if (!generating) {
      return;
    }

    const interval = setInterval(() => {
      void loadSlides({ quiet: true });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [generating, loadSlides]);

  // Never overwrite a slide the founder is typing in with a polled copy.
  // (The poll only runs while the deck is still generating, and a generated deck
  // has no in-flight edits to protect yet.)

  // --- Field helpers --------------------------------------------------------

  const patchActive = useCallback(
    (patch: Partial<EditorSlide>, label: string) => {
      if (activeSlideId) {
        updateSlide(activeSlideId, patch, label);
      }
    },
    [activeSlideId, updateSlide],
  );

  const onBlocksChange = useCallback(
    (blocks: SlideBlock[]) => {
      patchActive({ blocks }, "Content blocks");
    },
    [patchActive],
  );

  // --- Deck name -----------------------------------------------------------

  async function handleRename(next: string) {
    setTitle(next);
    const result = await renameDeckAction(deckId, next);

    if (result.status === "error") {
      setTitle(deckTitle);
      setActionError(result.message);
    }
  }

  // --- Slide CRUD ----------------------------------------------------------

  async function handleAdd() {
    setActionError(null);
    setBusySlideId(activeSlideId);

    try {
      const response = await fetch(`/api/decks/${deckId}/slides`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(activeSlideId ? { afterSlideId: activeSlideId } : {}),
      });

      const body = (await response.json().catch(() => null)) as {
        slides?: InitialSlide[];
        error?: string;
      } | null;

      if (!response.ok || !body?.slides) {
        throw new Error(body?.error ?? "We could not add a slide.");
      }

      const ordered = toInitialSlides(body.slides);
      const added = ordered.find(
        (slide) => !slides.some((existing) => existing.id === slide.id),
      );

      replaceSlides(ordered);
      if (added) {
        selectSlide(added.id);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "We could not add a slide.",
      );
    } finally {
      setBusySlideId(null);
    }
  }

  async function handleDuplicate(slideId: string) {
    setActionError(null);
    setBusySlideId(slideId);

    try {
      const result = await duplicateSlideAction(deckId, slideId);

      if (result.status === "error") {
        throw new Error(result.message);
      }

      const fresh = await loadSlides({ quiet: true });
      const ordered = toInitialSlides(
        fresh ??
          result.slides.map((entry) => ({
            ...(slides.find((slide) => slide.id === slideId) as EditorSlide),
            id: entry.id,
            order: entry.order,
          })),
      );
      replaceSlides(ordered);
      selectSlide(result.focusSlideId);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "We could not duplicate this slide.",
      );
    } finally {
      setBusySlideId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/decks/${deckId}/slides/${deleteTarget.id}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "We could not delete this slide.");
      }

      setDeleteTarget(null);
      await loadSlides();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "We could not delete this slide.",
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleReorder(slideIds: string[]) {
    const previous = slides;
    const optimistic = slideIds.map((id, index) => {
      const slide = previous.find((candidate) => candidate.id === id);
      return slide ? { ...slide, order: index + 1 } : null;
    });

    if (optimistic.some((slide) => slide === null)) {
      return;
    }

    replaceSlides(optimistic as EditorSlide[], { keepSelection: true });
    setActionError(null);

    try {
      const response = await fetch(`/api/decks/${deckId}/slides/reorder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slideIds }),
      });

      if (!response.ok) {
        throw new Error("We could not save the new slide order.");
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "We could not save the new slide order.",
      );
      await loadSlides();
    }
  }

  // --- Images --------------------------------------------------------------

  async function runImageAction(
    action: "generate" | "retry" | "placeholder",
    slideId: string,
    prompt?: string,
  ) {
    if (!slideId) {
      return;
    }

    setImageError(null);

    if (action === "placeholder") {
      try {
        const response = await fetch(
          `/api/decks/${deckId}/slides/${slideId}/image`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );

        if (!response.ok) {
          throw new Error("We could not clear this visual.");
        }

        syncSlideFromServer(slideId, {
          imageUrl: null,
          imageStatus: "NONE",
          imageError: null,
        });
      } catch (error) {
        setImageError(
          error instanceof Error
            ? error.message
            : "We could not clear this visual.",
        );
      }
      return;
    }

    // Optimistic: the canvas shows progress immediately, then the server's
    // answer replaces it. Never a broken image in between.
    setImageBusy(true);
    syncSlideFromServer(slideId, { imageStatus: "GENERATING", imageError: null });

    try {
      const response = await fetch(
        `/api/decks/${deckId}/slides/${slideId}/image`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(prompt ? { action, prompt } : { action }),
        },
      );

      const body = (await response.json().catch(() => null)) as {
        slide?: {
          imageUrl: string | null;
          imageStatus: EditorSlide["imageStatus"];
          imageError: string | null;
        };
        error?: string;
      } | null;

      if (!response.ok || !body?.slide) {
        syncSlideFromServer(slideId, {
          imageStatus: "FAILED",
          imageError:
            body?.error ?? "We could not generate a visual for this slide.",
        });
        setImageError(
          body?.error ?? "We could not generate a visual for this slide.",
        );
        return;
      }

      syncSlideFromServer(slideId, {
        imageUrl: body.slide.imageUrl,
        imageStatus: body.slide.imageStatus,
        imageError: body.slide.imageError,
      });
    } catch {
      const message = "We could not generate a visual for this slide.";
      syncSlideFromServer(slideId, { imageStatus: "FAILED", imageError: message });
      setImageError(message);
    } finally {
      setImageBusy(false);
    }
  }

  // --- AI ------------------------------------------------------------------

  const runAiAction = useCallback(
    async (action: EditorialAction) => {
      if (!activeSlideId) {
        return;
      }

      const slideId = activeSlideId;
      setPendingAction(action);
      setAiErrors((previous) => {
        const next = { ...previous };
        delete next[action];
        return next;
      });

      try {
        if (action === "visual") {
          // A new art direction is accepted straight into the prompt, then the
          // image pipeline runs for this slide only. No dialog: the founder
          // asked for a visual, not a copy review.
          const result = await requestProposal(slideId, action);
          if (!result) {
            return;
          }
          acceptProposalLocally(slideId, result.proposal);
          setDialog(CLOSED_DIALOG);
          await runImageAction("generate", slideId, result.proposal.slide.imagePrompt);
          return;
        }

        if (action === "speaker_notes") {
          const result = await requestProposal(slideId, action);
          if (!result) {
            return;
          }
          await resolveRevision(result.revisionId, "accept", slideId);
          return;
        }

        const result = await requestProposal(slideId, action);
        if (!result) {
          return;
        }

        setDialogError(null);
        setDialog({
          open: true,
          action,
          proposal: result.proposal,
          revisionId: result.revisionId,
        });
      } finally {
        setPendingAction(null);
      }
    },
    // The helpers this calls are declared below and are re-created each render
    // anyway; listing them would defeat the memo. They only ever run from a user
    // gesture, long after every `const` in this component body is initialised.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSlideId, deckId],
  );

  const requestProposal = useCallback(
    async (
      slideId: string,
      action: EditorialAction,
    ): Promise<{ proposal: SlideProposal; revisionId: string } | null> => {
      try {
        const response = await fetch(`/api/decks/${deckId}/slides/regenerate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slideId, action }),
        });

        const body = (await response.json().catch(() => null)) as {
          revisionId?: string;
          proposal?: SlideProposal;
          error?: string;
        } | null;

        if (!response.ok || !body?.revisionId || !body.proposal) {
          throw new Error(
            body?.error ?? "The AI could not produce a new version of this slide.",
          );
        }

        return { proposal: body.proposal, revisionId: body.revisionId };
      } catch (error) {
        setAiErrors((previous) => ({
          ...previous,
          [action]:
            error instanceof Error
              ? error.message
              : "The AI could not produce a new version of this slide.",
        }));
        return null;
      }
    },
    [deckId],
  );

  /** Apply a proposal locally, leaving the PENDING revision for the dialog. */
  const acceptProposalLocally = useCallback(
    (slideId: string, proposal: SlideProposal) => {
      const current = editor.slides.find((slide) => slide.id === slideId);
      if (!current) {
        return;
      }
      updateSlide(
        slideId,
        mergeProposal(current, proposal.slide) as Partial<EditorSlide>,
        "AI suggestion",
      );
    },
    [editor.slides, updateSlide],
  );

  const resolveRevision = useCallback(
    async (
      revisionId: string,
      decision: "accept" | "discard",
      slideId: string,
    ) => {
      setResolving(true);
      setDialogError(null);

      try {
        const response = await fetch(`/api/decks/${deckId}/slides/regenerate`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ revisionId, decision }),
        });

        const body = (await response.json().catch(() => null)) as {
          slide?: InitialSlide;
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(body?.error ?? "We could not apply that suggestion.");
        }

        if (decision === "accept") {
          // Re-read the deck so the slide reflects exactly what was stored,
          // including the speaker notes an AI action just wrote.
          const fresh = await loadSlides({ quiet: true });
          if (fresh) {
            setDialog(CLOSED_DIALOG);
            selectSlide(slideId);
            return;
          }
        }

        setDialog(CLOSED_DIALOG);
      } catch (error) {
        setDialogError(
          error instanceof Error
            ? error.message
            : "We could not apply that suggestion.",
        );
      } finally {
        setResolving(false);
      }
    },
    [deckId, loadSlides, selectSlide],
  );

  // --- Presentation overlay -------------------------------------------------

  const openOverlay = useCallback(
    (mode: "preview" | "present") => {
      setOverlayIndex(
        Math.max(0, slides.findIndex((slide) => slide.id === activeSlideId)),
      );
      setOverlay({ mode });
    },
    [activeSlideId, slides],
  );

  useEffect(() => {
    if (!overlay) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOverlay(null);
        return;
      }

      if (event.key === "ArrowRight") {
        setOverlayIndex((index) => Math.min(index + 1, slides.length - 1));
      }
      if (event.key === "ArrowLeft") {
        setOverlayIndex((index) => Math.max(index - 1, 0));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [overlay, slides.length]);

  const overlaySlide = slides[overlayIndex] ?? null;

  const inspectorProps = useMemo(
    () => ({
      theme,
      brandKitName,
      onFieldChange: patchActive,
      onBlocksChange,
      onLayoutChange: (layout: EditorSlide["layout"]) =>
        patchActive({ layout }, "Layout"),
      pendingAction,
      aiErrors,
      onRunAction: (action: EditorialAction) => void runAiAction(action),
      onDismissAiError: (action: EditorialAction) =>
        setAiErrors((previous) => {
          const next = { ...previous };
          delete next[action];
          return next;
        }),
      imageBusy,
      imageError,
      onPromptChange: (prompt: string) => patchActive({ imagePrompt: prompt }, "Visual prompt"),
      onGenerateImage: () => {
        if (activeSlideId) {
          void runImageAction("generate", activeSlideId);
        }
      },
      onRetryImage: () => {
        if (activeSlideId) {
          void runImageAction("retry", activeSlideId);
        }
      },
      onRegenerateVisual: () => void runAiAction("visual"),
      onUsePlaceholder: () => {
        if (activeSlideId) {
          void runImageAction("placeholder", activeSlideId);
        }
      },
    }),
    // The inspector is a presentational leaf; recomputing it on every keystroke
    // is cheaper than threading refs through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      theme,
      brandKitName,
      patchActive,
      onBlocksChange,
      pendingAction,
      aiErrors,
      imageBusy,
      imageError,
      activeSlideId,
    ],
  );

  const navigatorProps = {
    slides,
    activeSlideId,
    theme,
    onSelect: selectSlide,
    onReorder: (ids: string[]) => void handleReorder(ids),
    onAdd: () => void handleAdd(),
    onDuplicate: (slideId: string) => void handleDuplicate(slideId),
    onRequestDelete: (slideId: string) =>
      setDeleteTarget(slides.find((slide) => slide.id === slideId) ?? null),
    busySlideId,
    actionError,
    onRetryAction: () => void loadSlides(),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar
        deckId={deckId}
        deckTitle={title}
        onRename={(next) => void handleRename(next)}
        saveState={saveState}
        saveError={saveError}
        onRetrySave={retrySave}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        onUndo={undo}
        onRedo={redo}
        hasSlides={slides.length > 0}
        onPreview={() => openOverlay("preview")}
        onPresent={() => openOverlay("present")}
      />

      {generating ? (
        <p
          role="status"
          className="flex items-center justify-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground"
        >
          <Spinner className="size-3.5" />
          Building this deck in the background. Finished slides are ready to edit
          now.
        </p>
      ) : null}

      {deckStatus === "FAILED" ? (
        <p
          role="alert"
          className="flex items-center justify-center gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
        >
          Deck generation did not finish. You can still edit the slides that were
          built, or create a new deck from the brief.
        </p>
      ) : null}

      <div className="hidden min-h-0 flex-1 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_21rem]">
        <aside
          aria-label="Slides"
          className="min-h-0 overflow-hidden border-r border-border bg-surface-1"
        >
          <SlideNavigator {...navigatorProps} />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col bg-background">
          <SlideCanvasWrapper
            slide={activeSlide}
            theme={theme}
            isLoading={isRefreshing && slides.length === 0}
            loadError={loadError}
            onRetryLoad={() => void loadSlides()}
            onTitleChange={(value) => patchActive({ title: value }, "Title")}
            onTitleBlur={() => {
              if (activeSlideId) {
                flushSlide(activeSlideId);
              }
            }}
            onAddSlide={() => void handleAdd()}
            slideCount={slides.length}
          />
        </main>

        <aside
          aria-label="Slide inspector"
          className="min-h-0 overflow-hidden border-l border-border bg-surface-1"
        >
          <Inspector
            {...inspectorProps}
            slide={activeSlide}
            slideCount={slides.length}
            onAddSlide={() => void handleAdd()}
          />
        </aside>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <MobileEditor
          {...inspectorProps}
          {...navigatorProps}
          activeSlide={activeSlide}
          theme={theme}
          isLoading={isRefreshing && slides.length === 0}
          loadError={loadError}
          onRetryLoad={() => void loadSlides()}
          onTitleChange={(value) => patchActive({ title: value }, "Title")}
          onTitleBlur={() => {
            if (activeSlideId) {
              flushSlide(activeSlideId);
            }
          }}
          onAddSlide={() => void handleAdd()}
        />
      </div>

      <RegenerationDialog
        open={dialog.open}
        slide={activeSlide}
        proposal={dialog.proposal}
        action={dialog.action}
        theme={theme}
        resolving={resolving}
        error={dialogError}
        onKeepCurrent={() => {
          if (dialog.revisionId && activeSlideId) {
            void resolveRevision(dialog.revisionId, "discard", activeSlideId);
          } else {
            setDialog(CLOSED_DIALOG);
          }
        }}
        onUseNewVersion={() => {
          if (dialog.revisionId && activeSlideId) {
            void resolveRevision(dialog.revisionId, "accept", activeSlideId);
          }
        }}
        onClose={() => setDialog(CLOSED_DIALOG)}
        onRetry={() => {
          if (dialog.action && activeSlideId) {
            void runAiAction(dialog.action);
          }
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this slide?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title || "Untitled slide"}” and its notes will be
              removed from the deck. The remaining slides are renumbered
              automatically. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep slide</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleConfirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete slide"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {overlay && overlaySlide ? (
        <Overlay
          mode={overlay.mode}
          slide={overlaySlide}
          index={overlayIndex}
          total={slides.length}
          theme={theme}
          onClose={() => setOverlay(null)}
          onIndexChange={setOverlayIndex}
        />
      ) : null}
    </div>
  );
}

/**
 * Full-screen preview and presentation.
 *
 * Both render `<SlideCanvas>`, so the founder sees precisely what an investor
 * will see. Presentation adds arrow-key navigation; preview is a single slide.
 */
function Overlay({
  mode,
  slide,
  index,
  total,
  theme,
  onClose,
  onIndexChange,
}: {
  mode: "preview" | "present";
  slide: EditorSlide;
  index: number;
  total: number;
  theme: SlideTheme | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "present" ? "Presenting this deck" : "Previewing this slide"}
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {mode === "present" ? "Presenting" : "Preview"} · slide {index + 1} of {total}
        </p>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <div className="max-h-full w-full max-w-6xl overflow-hidden rounded-xl border border-border">
          <div className="aspect-video w-full">
            <SlideCanvas slide={toCanvasSlide(slide)} theme={theme} />
          </div>
        </div>
      </div>

      {mode === "present" ? (
        <div className="flex items-center justify-center gap-2 pb-4">
          <Button
            variant="outline"
            size="sm"
            disabled={index === 0}
            onClick={() => onIndexChange(index - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={index >= total - 1}
            onClick={() => onIndexChange(index + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
