"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useRef } from "react";

import { SlideCanvas } from "@/components/deck/slide-canvas";
import { toCanvasSlide } from "@/components/editor/helpers";
import { Alert02Icon, PlusIcon, RetryIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { EditorSlide } from "@/lib/editor/use-deck-editor";
import type { SlideTheme } from "@/lib/deck/theme";

/**
 * Centre column: the slide itself.
 *
 * The slide is always drawn by `<SlideCanvas>` — the same component the
 * thumbnails, the share viewer, the presentation mode and both exporters use.
 * This wrapper only provides the frame around it: the 16:9 stage, a quick title
 * field, and the click-to-edit affordance over the canvas heading.
 *
 * The inspector remains the primary editing surface; the title is duplicated
 * here because it is the one field a founder expects to be able to type into
 * directly on the slide.
 */

type SlideCanvasWrapperProps = {
  slide: EditorSlide | null;
  theme: SlideTheme | null;
  isLoading: boolean;
  loadError: string | null;
  onRetryLoad: () => void;
  onTitleChange: (value: string) => void;
  onTitleBlur: () => void;
  onAddSlide: () => void;
  slideCount: number;
};

export function SlideCanvasWrapper({
  slide,
  theme,
  isLoading,
  loadError,
  onRetryLoad,
  onTitleChange,
  onTitleBlur,
  onAddSlide,
  slideCount,
}: SlideCanvasWrapperProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <div
        role="status"
        className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <Spinner className="size-4" />
        Loading your deck…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div
          role="alert"
          className="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center"
        >
          <HugeiconsIcon
            icon={Alert02Icon}
            className="size-6 text-destructive"
            aria-hidden
          />
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={onRetryLoad}>
            <HugeiconsIcon icon={RetryIcon} aria-hidden />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!slide) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            This deck has no slides yet. Add one to start shaping the story.
          </p>
          <Button size="sm" onClick={onAddSlide}>
            <HugeiconsIcon icon={PlusIcon} aria-hidden />
            Add a slide
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 lg:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label
            htmlFor="quick-slide-title"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            Slide {slide.order} of {slideCount} · title
          </label>
          <Input
            id="quick-slide-title"
            ref={inputRef}
            value={slide.title}
            maxLength={200}
            placeholder="Name this slide"
            className="h-9 max-w-xl"
            onChange={(event) => onTitleChange(event.target.value)}
            onBlur={onTitleBlur}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="rv-surface-raised h-full overflow-hidden">
          <SlideCanvas slide={toCanvasSlide(slide)} theme={theme} />
        </div>

        {/*
          A transparent hit area over the canvas heading. The canvas draws the
          title with container-query units, so it is not a node we can attach a
          handler to. Overlaying the header region gives a click-anywhere-on-the-
          heading affordance and keeps a single renderer intact.
        */}
        <button
          type="button"
          onClick={() => {
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
          aria-label="Edit the slide title"
          className="absolute inset-x-0 top-0 h-[26%] rounded-md border border-transparent text-left transition-colors hover:border-brand/40 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="sr-only">Edit the slide title</span>
        </button>
      </div>
    </div>
  );
}
