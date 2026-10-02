"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { SlideCanvas } from "@/components/deck/slide-canvas";
import { diffSlideProposal, mergeProposal, toCanvasSlide } from "@/components/editor/helpers";
import {
  Alert02Icon,
  Cancel01Icon,
  CheckIcon,
  InformationCircleIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { EditorSlide } from "@/lib/editor/use-deck-editor";
import type { SlideTheme } from "@/lib/deck/theme";
import type { EditorialAction } from "@/lib/schemas/slide";
import type { SlideProposal } from "@/components/editor/helpers";

/**
 * Compare a slide against an AI proposal before anything changes.
 *
 * "Keep Current" and "Use New Version" are the only two exits. Until one of them
 * is pressed, the live slide is untouched — the proposal lives in a PENDING
 * `SlideRevision`, and this dialog is just a view over it.
 *
 * Both sides are rendered with the same `<SlideCanvas>` as the editor, so what
 * the founder approves is exactly what they will present.
 */

export type RegenerationDialogProps = {
  open: boolean;
  slide: EditorSlide | null;
  proposal: SlideProposal | null;
  action: EditorialAction | null;
  theme: SlideTheme | null;
  resolving: boolean;
  error: string | null;
  onKeepCurrent: () => void;
  onUseNewVersion: () => void;
  onClose: () => void;
  onRetry: () => void;
};

export function RegenerationDialog({
  open,
  slide,
  proposal,
  action,
  theme,
  resolving,
  error,
  onKeepCurrent,
  onUseNewVersion,
  onClose,
  onRetry,
}: RegenerationDialogProps) {
  const [side, setSide] = useState<"current" | "proposal">("proposal");

  const changes =
    slide && proposal ? diffSlideProposal(slide, proposal.slide) : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !resolving) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-[min(72rem,calc(100%-2rem))] gap-4 sm:max-w-[min(72rem,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>
            {action ? `${ACTION_LABEL[action]} — slide ${slide?.order ?? ""}` : "AI suggestion"}
          </DialogTitle>
          <DialogDescription>
            {proposal?.summary ??
              "Compare the current version with the new one before anything changes."}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{error}</span>
            <Button variant="ghost" size="xs" className="text-destructive" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : null}

        {proposal && proposal.dataNeeded.length > 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden
            />
            <span>
              <span className="text-foreground">Data needed: </span>
              {proposal.dataNeeded.join(" · ")}
            </span>
          </p>
        ) : null}

        {slide && proposal ? (
          <>
            <div
              role="tablist"
              aria-label="Version to inspect"
              className="flex gap-1 rounded-2xl border border-border bg-surface-2 p-1 sm:hidden"
            >
              {(["proposal", "current"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={side === value}
                  onClick={() => setSide(value)}
                  className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    side === value
                      ? "bg-background text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {value === "proposal" ? "New AI version" : "Current version"}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <VersionPanel
                heading="Current Version"
                slide={slide}
                theme={theme}
                className={side === "current" ? undefined : "hidden sm:block"}
              />
              <VersionPanel
                heading="New AI Version"
                slide={mergeProposal(slide, proposal.slide)}
                theme={theme}
                isNew
                className={side === "proposal" ? undefined : "hidden sm:block"}
              />
            </div>

            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {changes.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  The AI returned this slide unchanged.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {changes.map((change) => (
                    <li key={change.field} className="px-3 py-2.5">
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {change.label}
                      </p>
                      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                        <p className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
                          {change.before ?? "—"}
                        </p>
                        <p className="rounded-lg border border-brand/40 bg-brand-soft/10 px-2.5 py-2 text-xs whitespace-pre-wrap">
                          {change.after ?? "—"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
          >
            <Spinner className="size-4" />
            Building the new version…
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={resolving}
            onClick={() => {
              onKeepCurrent();
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} aria-hidden />
            Keep current
          </Button>
          <Button disabled={resolving || !proposal} onClick={onUseNewVersion}>
            {resolving ? <Spinner className="size-4" /> : <HugeiconsIcon icon={CheckIcon} aria-hidden />}
            Use new version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionPanel({
  heading,
  slide,
  theme,
  isNew,
  className,
}: {
  heading: string;
  slide: EditorSlide;
  theme: SlideTheme | null;
  isNew?: boolean;
  className?: string;
}) {
  return (
    <section aria-label={heading} className={className}>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {isNew ? (
          <HugeiconsIcon icon={CheckIcon} className="size-3.5 text-brand" aria-hidden />
        ) : null}
        {heading}
      </h3>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="aspect-video w-full">
          <SlideCanvas slide={toCanvasSlide(slide)} theme={theme} />
        </div>
      </div>
    </section>
  );
}

const ACTION_LABEL: Record<EditorialAction, string> = {
  improve: "Improve slide",
  rewrite: "Rewrite slide",
  shorten: "Shorten slide",
  expand: "Expand slide",
  investor_focused: "Investor-focused slide",
  headline: "New headline",
  visual: "New visual direction",
  chart: "Generated chart",
  speaker_notes: "New speaker notes",
  regenerate: "Regenerate slide",
};
