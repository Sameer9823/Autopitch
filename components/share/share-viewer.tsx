"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { SlideCanvas } from "@/components/deck/slide-canvas";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  DownloadIcon,
  PresentIcon,
} from "@/components/icons";
import { EngagementTracker } from "@/components/share/engagement-tracker";
import { Button } from "@/components/ui/button";
import type { SharePayload } from "@/lib/share/payload";

/**
 * The public investor viewer.
 *
 * Unauthenticated, no editor controls, rendered only from the whitelisted share
 * payload. The deck is the product here — the application chrome stays quiet.
 */
export function ShareViewer({
  deck,
  slides,
  permission,
  totalSlides,
  token,
}: {
  deck: SharePayload["deck"];
  slides: SharePayload["slides"];
  permission: SharePayload["share"]["permission"];
  totalSlides: number;
  token: string;
}) {
  const [index, setIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const goNext = useCallback(() => {
    setIndex((current) => Math.min(current + 1, totalSlides - 1));
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setIndex((current) => Math.max(current - 1, 0));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
      }
    } catch {
      // Browsers can refuse fullscreen (permissions policy, iframe sandbox).
      // The viewer is fully usable without it, so this is not an error state.
    }
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Ignore shortcuts while the user is typing anywhere.
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          event.preventDefault();
          goNext();
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          goPrev();
          break;
        case "Home":
          event.preventDefault();
          setIndex(0);
          break;
        case "End":
          event.preventDefault();
          setIndex(Math.max(totalSlides - 1, 0));
          break;
        case "f":
        case "F":
          event.preventDefault();
          void toggleFullscreen();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, toggleFullscreen, totalSlides]);

  const slide = slides[index];
  const label = deck.startupName ?? deck.title ?? "Pitch deck";
  const canDownload = permission === "VIEW_DOWNLOAD";

  return (
    <div
      ref={containerRef}
      className="flex min-h-dvh flex-col bg-background"
      role="region"
      aria-label={`${label} presentation`}
    >
      <EngagementTracker
        token={token}
        totalSlides={totalSlides}
        slideOrder={index + 1}
      />

      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <p className="min-w-0 truncate text-sm font-medium">{label}</p>

        <div className="flex shrink-0 items-center gap-2">
          {canDownload ? (
            <Button
              variant="outline"
              size="sm"
              render={<a href={`/api/share/${token}/download`} />}
            >
              <HugeiconsIcon icon={DownloadIcon} aria-hidden />
              <span className="hidden sm:inline">Download</span>
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={() => void toggleFullscreen()}
          >
            <HugeiconsIcon icon={PresentIcon} aria-hidden />
            <span className="hidden sm:inline">
              {isFullscreen ? "Exit" : "Present"}
            </span>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 sm:p-6">
        <button
          type="button"
          onClick={goNext}
          disabled={index >= totalSlides - 1}
          aria-label="Next slide"
          className="block w-full max-w-6xl cursor-pointer overflow-hidden rounded-lg border border-border text-left"
        >
          <div className="aspect-video w-full">
            {slide ? (
              <SlideCanvas
                slide={slide}
                theme={deck.theme}
                showImageState={false}
              />
            ) : null}
          </div>
        </button>

        <div className="flex w-full max-w-6xl items-center justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={index === 0}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {index + 1} / {totalSlides}
          </p>

          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={index >= totalSlides - 1}
          >
            <span className="hidden sm:inline">Next</span>
            <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden />
          </Button>
        </div>

        <p className="text-xs text-subtle-foreground">
          Use ← → to navigate, F for fullscreen.
        </p>
      </main>
    </div>
  );
}
