"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { ImageStatus } from "@/components/editor/image-status";
import { LAYOUT_OPTIONS } from "@/components/editor/helpers";
import { CheckIcon, Layers01Icon } from "@/components/icons";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EditorSlide } from "@/lib/editor/use-deck-editor";
import { DEFAULT_SLIDE_THEME, type SlideTheme } from "@/lib/deck/theme";

/**
 * Design tab: how this slide looks.
 *
 * The layout picker is the load-bearing control here — it decides the visual
 * grammar of the slide. Brand kit colours and fonts are shown as a read-only
 * preview because they belong to the deck, not to an individual slide: changing
 * them here would silently re-skin every slide and break the deck's consistency.
 */

export type InspectorDesignTabProps = {
  slide: EditorSlide;
  theme: SlideTheme | null;
  brandKitName: string | null;
  imageBusy: boolean;
  imageError: string | null;
  onLayoutChange: (layout: EditorSlide["layout"]) => void;
  onLabelChange: (label: string) => void;
  onCaptionChange: (caption: string) => void;
  onPromptChange: (prompt: string) => void;
  onGenerateImage: () => void;
  onRetryImage: () => void;
  onRegenerateVisual: () => void;
  onUsePlaceholder: () => void;
};

export function InspectorDesignTab({
  slide,
  theme,
  brandKitName,
  imageBusy,
  imageError,
  onLayoutChange,
  onLabelChange,
  onCaptionChange,
  onPromptChange,
  onGenerateImage,
  onRetryImage,
  onRegenerateVisual,
  onUsePlaceholder,
}: InspectorDesignTabProps) {
  const active = theme ?? DEFAULT_SLIDE_THEME;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="layout-heading" className="flex flex-col gap-3">
        <h3
          id="layout-heading"
          className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          <HugeiconsIcon icon={Layers01Icon} className="size-3.5" aria-hidden />
          Layout
        </h3>

        <ul
          role="radiogroup"
          aria-label="Slide layout"
          className="grid grid-cols-2 gap-2"
        >
          {LAYOUT_OPTIONS.map((option) => {
            const selected = slide.layout === option.value;

            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onLayoutChange(option.value)}
                  className={cn(
                    "flex h-full w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    selected
                      ? "border-brand bg-brand-soft/10"
                      : "border-border bg-surface-2 hover:border-muted-foreground/40 hover:bg-surface-3",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {selected ? (
                      <HugeiconsIcon
                        icon={CheckIcon}
                        className="size-3.5 text-brand"
                        aria-hidden
                      />
                    ) : null}
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="label-heading" className="flex flex-col gap-3">
        <h3
          id="label-heading"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Labels & caption
        </h3>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slide-label">Eyebrow label</Label>
          <input
            id="slide-label"
            value={slide.label ?? ""}
            maxLength={80}
            placeholder="e.g. Traction"
            className="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onChange={(event) => onLabelChange(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slide-caption">Caption</Label>
          <input
            id="slide-caption"
            value={slide.caption ?? ""}
            maxLength={400}
            placeholder="Small print under the slide"
            className="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onChange={(event) => onCaptionChange(event.target.value)}
          />
        </div>
      </section>

      <section
        aria-labelledby="brand-heading"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3"
      >
        <h3
          id="brand-heading"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {brandKitName ? `Brand kit · ${brandKitName}` : "Brand kit · product default"}
        </h3>

        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex flex-col gap-1.5">
            <dt className="text-muted-foreground">Accent</dt>
            <dd className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-5 rounded-md border border-border"
                style={{ backgroundColor: active.accent }}
              />
              <span className="font-mono text-[0.625rem] uppercase">
                {active.accent}
              </span>
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="text-muted-foreground">Surface</dt>
            <dd className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-5 rounded-md border border-border"
                style={{ backgroundColor: active.surface }}
              />
              <span className="font-mono text-[0.625rem] uppercase">
                {active.surface}
              </span>
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="text-muted-foreground">Text</dt>
            <dd className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-5 rounded-md border border-border"
                style={{ backgroundColor: active.foreground }}
              />
              <span className="font-mono text-[0.625rem] uppercase">
                {active.foreground}
              </span>
            </dd>
          </div>
        </dl>

        <p className="text-xs text-subtle-foreground">
          Headings use {active.headingFont}; body copy uses {active.bodyFont}. Brand
          settings apply to every slide in the deck.
        </p>
      </section>

      <ImageStatus
        slide={slide}
        busy={imageBusy}
        error={imageError}
        onPromptChange={onPromptChange}
        onGenerate={onGenerateImage}
        onRetry={onRetryImage}
        onRegenerateVisual={onRegenerateVisual}
        onUsePlaceholder={onUsePlaceholder}
      />
    </div>
  );
}
