"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useMemo, useState } from "react";

import {
  CheckIcon,
  DownloadIcon,
  PdfIcon,
  PresentIcon as PptxIcon,
  RetryIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";

/**
 * Export dialog.
 *
 * One place that knows the export URL contract:
 *
 *   GET /api/decks/{deckId}/export?format={pdf|pptx}[&slides={orders}]
 *
 * The direct "Export PDF / Export PPTX" links elsewhere in the app point at the
 * same endpoint without `slides`, so a plain link and this dialog produce
 * byte-identical output — the dialog only adds progress, a subset picker and a
 * real error surface.
 *
 * The file is fetched rather than linked so that a failed export can be reported
 * and retried instead of navigating the tab to a JSON error body. Response bytes
 * are streamed into a Blob with a progress readout, which is also why a large
 * deck never appears to hang.
 */

export type ExportDialogSlide = {
  id: string;
  order: number;
  title: string;
};

export type ExportFormat = "pdf" | "pptx";

export type ExportDialogProps = {
  deckId: string;
  slides: ExportDialogSlide[];
  /** Used for the downloaded file name. Falls back to the first slide's title. */
  deckTitle?: string | null;
  defaultFormat?: ExportFormat;
  /** Replace the default trigger button entirely. */
  trigger?: React.ReactNode;
  className?: string;
};

type Phase =
  | { kind: "idle" }
  | { kind: "working"; label: string; progress: number }
  | { kind: "done"; fileName: string }
  | { kind: "error"; message: string };

const FORMAT_LABEL: Record<ExportFormat, string> = {
  pdf: "PDF document",
  pptx: "PowerPoint (PPTX)",
};

function fileBaseName(title: string | undefined): string {
  return (
    (title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "raisevia-deck"
  );
}

/** Build the one URL both this dialog and the direct links use. */
export function exportUrl(
  deckId: string,
  format: ExportFormat,
  orders: number[],
): string {
  const params = new URLSearchParams({ format });

  if (orders.length > 0) {
    params.set("slides", orders.join(","));
  }

  return `/api/decks/${deckId}/export?${params.toString()}`;
}

export function ExportDialog({
  deckId,
  slides,
  deckTitle,
  defaultFormat = "pdf",
  trigger,
  className,
}: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>(defaultFormat);
  const [subset, setSubset] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(slides.map((slide) => slide.id)),
  );
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const orderedSlides = useMemo(
    () => [...slides].sort((a, b) => a.order - b.order),
    [slides],
  );

  const chosenOrders = useMemo(
    () =>
      subset
        ? orderedSlides
            .filter((slide) => selected.has(slide.id))
            .map((slide) => slide.order)
        : [],
    [orderedSlides, selected, subset],
  );

  const busy = phase.kind === "working";
  const canExport = !busy && (subset ? chosenOrders.length > 0 : slides.length > 0);

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const run = useCallback(async () => {
    if (!canExport) {
      return;
    }

    const url = exportUrl(deckId, format, chosenOrders);

    setPhase({ kind: "working", label: "Preparing…", progress: 0 });

    try {
      const response = await fetch(url);

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : "That export could not be created.";

        setPhase({ kind: "error", message });
        return;
      }

      const declared = Number(response.headers.get("Content-Length") ?? "0");
      const total = Number.isFinite(declared) && declared > 0 ? declared : 0;
      const contentType = response.headers.get("Content-Type") ?? "";
      const extension = contentType.includes("pdf") ? "pdf" : "pptx";
      const fileName = `${fileBaseName(deckTitle ?? orderedSlides[0]?.title)}.${extension}`;

      const blob = await (async () => {
        if (!response.body || total === 0) {
          return response.blob();
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        // Progress is reported as bytes arrive, which is honest for a stream and
        // keeps the dialog from sitting on an indeterminate spinner.
        for (;;) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          chunks.push(value);
          received += value.byteLength;
          setPhase({
            kind: "working",
            label: "Downloading…",
            progress: Math.min(0.99, received / total),
          });
        }

        return new Blob(chunks as BlobPart[], {
          type: contentType || "application/octet-stream",
        });
      })();

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setPhase({ kind: "done", fileName });
    } catch {
      setPhase({
        kind: "error",
        message: "We couldn't reach the export service. Check your connection and retry.",
      });
    }
  }, [canExport, chosenOrders, deckId, deckTitle, format, orderedSlides]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        if (!next) {
          setPhase({ kind: "idle" });
        }
      }}
    >
      {trigger ?? (
        <DialogTrigger
          render={
            <Button size="sm" className={className}>
              <HugeiconsIcon icon={DownloadIcon} aria-hidden />
              <span className="hidden sm:inline">Export</span>
            </Button>
          }
        />
      )}

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export this deck</DialogTitle>
          <DialogDescription>
            PDF for sending, PPTX for editing in PowerPoint or Keynote. Speaker
            notes travel with the PowerPoint file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Format</legend>
            <RadioGroup
              value={format}
              onValueChange={(value: unknown) => {
                if (value === "pdf" || value === "pptx") {
                  setFormat(value);
                }
              }}
              className="grid grid-cols-2 gap-2"
              disabled={busy}
            >
              <Label className="rv-surface flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <RadioGroupItem value="pdf" />
                <HugeiconsIcon icon={PdfIcon} className="size-4" aria-hidden />
                {FORMAT_LABEL.pdf}
              </Label>
              <Label className="rv-surface flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <RadioGroupItem value="pptx" />
                <HugeiconsIcon icon={PptxIcon} className="size-4" aria-hidden />
                {FORMAT_LABEL.pptx}
              </Label>
            </RadioGroup>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Slides</legend>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={subset ? "outline" : "default"}
                size="sm"
                onClick={() => setSubset(false)}
                aria-pressed={!subset}
                disabled={busy}
              >
                Full deck
              </Button>
              <Button
                variant={subset ? "default" : "outline"}
                size="sm"
                onClick={() => setSubset(true)}
                aria-pressed={subset}
                disabled={busy || slides.length === 0}
              >
                Selected slides
              </Button>

              {subset ? (
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setSelected(new Set(slides.map((slide) => slide.id)))}
                    disabled={busy}
                  >
                    Select all
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setSelected(new Set())}
                    disabled={busy}
                  >
                    Clear
                  </Button>
                </div>
              ) : null}
            </div>

            {subset ? (
              <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
                {orderedSlides.map((slide) => (
                  <Label
                    key={slide.id}
                    className="flex min-w-0 cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 text-sm"
                  >
                    <Checkbox
                      checked={selected.has(slide.id)}
                      onCheckedChange={() => toggle(slide.id)}
                      disabled={busy}
                      aria-label={`Slide ${slide.order}`}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-subtle-foreground tabular-nums">
                        Slide {slide.order}
                      </span>
                      <span className="block truncate">{slide.title}</span>
                    </span>
                  </Label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                All {orderedSlides.length} slides, in order.
              </p>
            )}
          </fieldset>

          {phase.kind === "working" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span>{phase.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(phase.progress * 100)}%
                </span>
              </div>
              <Progress
                value={Math.round(phase.progress * 100)}
                aria-label={`Exporting ${FORMAT_LABEL[format]}`}
              />
              <p className="text-xs text-subtle-foreground">
                A large deck can take a few seconds. Keep this tab open.
              </p>
            </div>
          ) : null}

          {phase.kind === "done" ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <HugeiconsIcon icon={CheckIcon} className="size-4 text-brand" aria-hidden />
              Saved {phase.fileName} to your downloads.
            </p>
          ) : null}

          {phase.kind === "error" ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <HugeiconsIcon icon={RetryIcon} className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{phase.message}</span>
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            {phase.kind === "done" ? "Done" : "Cancel"}
          </Button>

          {phase.kind === "error" ? (
            <Button onClick={() => void run()} disabled={!canExport}>
              <HugeiconsIcon icon={RetryIcon} aria-hidden />
              Retry
            </Button>
          ) : (
            <Button onClick={() => void run()} disabled={!canExport || busy}>
              {busy ? <Spinner /> : <HugeiconsIcon icon={DownloadIcon} aria-hidden />}
              {busy ? "Exporting…" : `Export ${format.toUpperCase()}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}