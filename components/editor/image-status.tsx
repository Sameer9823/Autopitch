"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { IMAGE_STATUS_LABEL } from "@/components/editor/helpers";
import {
  Alert02Icon,
  CheckIcon,
  Image01Icon,
  RetryIcon,
  ShuffleIcon,
  SparklesIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { EditorSlide } from "@/lib/editor/use-deck-editor";

/**
 * Per-slide visual controls.
 *
 * `<SlideCanvas>` already renders every image state — it never draws a broken
 * image — so this panel's job is only to explain the state and offer the three
 * ways out of a failure: Retry the same prompt, Regenerate with a fresh
 * direction, or fall back to a neutral placeholder.
 *
 * The buttons are disabled while a generation is in flight, so a founder can
 * never stack three image jobs onto the same slide.
 */

export type ImageStatusProps = {
  slide: EditorSlide;
  busy: boolean;
  error: string | null;
  onPromptChange: (prompt: string) => void;
  onGenerate: () => void;
  onRetry: () => void;
  onRegenerateVisual: () => void;
  onUsePlaceholder: () => void;
};

export function ImageStatus({
  slide,
  busy,
  error,
  onPromptChange,
  onGenerate,
  onRetry,
  onRegenerateVisual,
  onUsePlaceholder,
}: ImageStatusProps) {
  const inFlight = busy || slide.imageStatus === "GENERATING" || slide.imageStatus === "QUEUED";

  return (
    <section aria-labelledby="visual-status-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3
          id="visual-status-heading"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Visual
        </h3>
        <StatusPill status={slide.imageStatus} />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Visual prompt</span>
        <textarea
          value={slide.imagePrompt}
          rows={3}
          maxLength={1000}
          placeholder="Describe the illustration you want here."
          aria-label="Visual prompt"
          className="w-full resize-y rounded-xl border border-input bg-input/30 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={(event) => onPromptChange(event.target.value)}
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      {slide.imageStatus === "FAILED" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-start gap-2 text-xs text-destructive">
            <HugeiconsIcon
              icon={Alert02Icon}
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden
            />
            This slide’s visual failed. Retry it, take a new direction, or use a
            neutral placeholder.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="outline" disabled={inFlight} onClick={onRetry}>
              <HugeiconsIcon icon={RetryIcon} aria-hidden />
              Retry
            </Button>
            <Button size="xs" variant="outline" disabled={inFlight} onClick={onRegenerateVisual}>
              <HugeiconsIcon icon={ShuffleIcon} aria-hidden />
              Regenerate
            </Button>
            <Button size="xs" variant="ghost" disabled={inFlight} onClick={onUsePlaceholder}>
              Use placeholder
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="xs" variant="outline" disabled={inFlight} onClick={onGenerate}>
            {inFlight ? (
              <Spinner className="size-3" />
            ) : (
              <HugeiconsIcon icon={SparklesIcon} aria-hidden />
            )}
            {slide.imageUrl ? "Replace visual" : "Generate visual"}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={inFlight || !slide.imageUrl}
            onClick={onRegenerateVisual}
          >
            <HugeiconsIcon icon={ShuffleIcon} aria-hidden />
            New direction
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={inFlight || slide.imageStatus === "NONE"}
            onClick={onUsePlaceholder}
          >
            Use placeholder
          </Button>
        </div>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: EditorSlide["imageStatus"] }) {
  const icon =
    status === "READY" ? (
      <HugeiconsIcon icon={CheckIcon} aria-hidden />
    ) : status === "FAILED" ? (
      <HugeiconsIcon icon={Alert02Icon} aria-hidden />
    ) : status === "GENERATING" || status === "QUEUED" ? (
      <Spinner className="size-3" />
    ) : (
      <HugeiconsIcon icon={Image01Icon} aria-hidden />
    );

  const tone =
    status === "FAILED"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : status === "READY"
        ? "border-success/40 bg-success/10 text-success"
        : "border-border bg-secondary text-muted-foreground";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${tone}`}
    >
      {icon}
      {IMAGE_STATUS_LABEL[status]}
    </span>
  );
}
