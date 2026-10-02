"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { SlideCanvas } from "@/components/deck/slide-canvas";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  InformationCircleIcon,
  PresentIcon,
  ViewIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SpeakerNotesPanel } from "@/components/present/speaker-notes-panel";
import type { RenderSlide } from "@/lib/deck/render-model";
import type { SlideTheme } from "@/lib/deck/theme";

/**
 * Presentation mode.
 *
 * The screen a founder actually presents from, so the priorities are different
 * from the rest of the app: nothing may steal focus, nothing may be hard to
 * dismiss, and the slide must stay the only bright thing on screen.
 *
 * - Keyboard: ← →, PageUp/PageDown, Space (next, Shift+Space previous),
 *   Home/End, Escape to leave. Shortcuts are suppressed while the speaker-notes
 *   textarea has focus, so editing notes never advances the deck.
 * - Fullscreen is requested on entry, but browsers require a user gesture, so
 *   a visible "Enter fullscreen" control is always there as the fallback.
 * - Motion is a single 0.16s crossfade, and it is disabled entirely when the
 *   viewer prefers reduced motion.
 */

export type PresentationModeProps = {
  deckId: string;
  deckTitle: string;
  slides: RenderSlide[];
  theme?: SlideTheme | null;
};

/** Elements that legitimately consume arrow keys and Space. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();

  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

export function PresentationMode({
  deckId,
  deckTitle,
  slides,
  theme = null,
}: PresentationModeProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [index, setIndex] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenBlocked, setFullscreenBlocked] = useState(false);
  const requestedFullscreen = useRef(false);

  const total = slides.length;
  const clampedIndex = total === 0 ? 0 : Math.min(index, total - 1);
  const slide = slides[clampedIndex];

  const goTo = useCallback(
    (next: number) => {
      setIndex(() => Math.max(0, Math.min(next, total - 1)));
    },
    [total],
  );

  const next = useCallback(() => goTo(clampedIndex + 1), [clampedIndex, goTo]);
  const previous = useCallback(
    () => goTo(clampedIndex - 1),
    [clampedIndex, goTo],
  );

  const exit = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }

    router.push(`/decks/${deckId}/editor`);
  }, [deckId, router]);

  // Entering the page should present fullscreen. Browsers only honour this from
  // a user gesture, so a rejection is normal and simply reveals the button.
  useEffect(() => {
    if (requestedFullscreen.current) {
      return;
    }

    requestedFullscreen.current = true;

    const enter = async () => {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        setFullscreenBlocked(true);
      }
    };

    void enter();
  }, []);

  useEffect(() => {
    const onChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);

      if (active) {
        setFullscreenBlocked(false);
      }
    };

    document.addEventListener("fullscreenchange", onChange);
    onChange();

    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setFullscreenBlocked(true);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return;
      }

      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
          event.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          previous();
          break;
        case " ":
        case "Spacebar":
          event.preventDefault();
          if (event.shiftKey) {
            previous();
          } else {
            next();
          }
          break;
        case "Home":
          event.preventDefault();
          goTo(0);
          break;
        case "End":
          event.preventDefault();
          goTo(total - 1);
          break;
        case "Escape":
          event.preventDefault();
          exit();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exit, goTo, next, previous, total]);

  const duration = reduceMotion ? 0 : 0.16;

  if (total === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <HugeiconsIcon
          icon={PresentIcon}
          className="size-8 text-subtle-foreground"
          aria-hidden
        />
        <h1 className="font-heading text-lg font-medium">Nothing to present yet</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This deck has no slides. Add slides in the editor, then come back.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" onClick={() => router.refresh()}>
            <HugeiconsIcon icon={ViewIcon} aria-hidden />
            Retry
          </Button>
          <Button onClick={() => router.push(`/decks/${deckId}/editor`)}>
            Open the editor
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 sm:px-4">
        <p className="min-w-0 truncate font-heading text-sm font-medium">
          {deckTitle}
        </p>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNotesOpen((open) => !open)}
            aria-pressed={notesOpen}
            aria-controls="speaker-notes-panel"
          >
            <HugeiconsIcon icon={InformationCircleIcon} aria-hidden />
            <span className="hidden sm:inline">Notes</span>
          </Button>

          {!isFullscreen ? (
            <Button variant="ghost" size="sm" onClick={() => void toggleFullscreen()}>
              <HugeiconsIcon icon={PresentIcon} aria-hidden />
              <span className="hidden sm:inline">Enter fullscreen</span>
            </Button>
          ) : null}

          <Button variant="ghost" size="sm" onClick={exit}>
            <HugeiconsIcon icon={Cancel01Icon} aria-hidden />
            <span className="hidden sm:inline">Exit</span>
          </Button>
        </div>
      </header>

      {fullscreenBlocked ? (
        <p
          role="status"
          className="border-b border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground sm:px-4"
        >
          Your browser blocked fullscreen. Use “Enter fullscreen” above, or keep
          presenting in this tab — every keyboard shortcut still works.
        </p>
      ) : null}

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-4">
        <section
          tabIndex={0}
          role="region"
          aria-roledescription="slide"
          aria-label={`Slide ${clampedIndex + 1} of ${total}: ${slide?.title ?? ""}`}
          className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface-1 [--chrome:10rem] outline-offset-4 md:[--chrome:5rem]"
          style={{
            width: "min(100%, calc((100dvh - var(--chrome)) * 16 / 9))",
          }}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={slide?.id ?? clampedIndex}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration, ease: "linear" }}
            >
              {slide ? (
                <SlideCanvas slide={slide} theme={theme} showImageState={false} />
              ) : null}
            </motion.div>
          </AnimatePresence>

          {/* Tap zones — thumb-reachable on touch, and hidden from the tab order
              on desktop where the labelled controls below do the same job. */}
          <button
            type="button"
            onClick={previous}
            disabled={clampedIndex === 0}
            aria-label="Previous slide"
            className="absolute inset-y-0 left-0 w-1/4 cursor-pointer disabled:cursor-default sm:hidden"
          />
          <button
            type="button"
            onClick={next}
            disabled={clampedIndex === total - 1}
            aria-label="Next slide"
            className="absolute inset-y-0 right-0 w-1/4 cursor-pointer disabled:cursor-default sm:hidden"
          />
        </section>

        <SpeakerNotesPanel
          id="speaker-notes-panel"
          open={notesOpen}
          onClose={() => setNotesOpen(false)}
          deckId={deckId}
          slide={slide ?? null}
        />
      </div>

      <nav
        aria-label="Presentation controls"
        className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 sm:px-4"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={previous}
          disabled={clampedIndex === 0}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </Button>

        {/* One live region for the whole stage (below) so the counter and the
            slide title are announced together, not as two competing updates. */}
        <p className="text-sm tabular-nums text-muted-foreground">
          {clampedIndex + 1} / {total}
        </p>

        <Button
          variant="outline"
          size="sm"
          onClick={next}
          disabled={clampedIndex === total - 1}
        >
          <span className="hidden sm:inline">Next</span>
          <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden />
        </Button>
      </nav>

      <p className="sr-only" aria-live="polite">
        Showing slide {clampedIndex + 1} of {total}: {slide?.title}
      </p>
    </div>
  );
}