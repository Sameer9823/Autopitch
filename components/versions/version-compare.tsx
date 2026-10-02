import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import { AddCircleIcon, Cancel01Icon, PencilIcon } from "@/components/icons";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import type {
  SlideDiff,
  VersionDiff,
} from "@/lib/versions/snapshot";

export type VersionCompareProps = {
  diff: VersionDiff;
  beforeLabel: string;
  afterLabel: string;
};

const STATUS_CONFIG: Record<
  SlideDiff["status"],
  { label: string; icon: IconSvgElement; className: string }
> = {
  added: {
    label: "Added",
    icon: AddCircleIcon,
    className:
      "border-success/40 bg-success/10 text-success",
  },
  removed: {
    label: "Removed",
    icon: Cancel01Icon,
    className:
      "border-destructive/40 bg-destructive/10 text-destructive",
  },
  changed: {
    label: "Changed",
    icon: PencilIcon,
    className:
      "border-brand/40 bg-brand/10 text-brand",
  },
  unchanged: {
    label: "Unchanged",
    icon: PencilIcon,
    className: "border-border bg-surface-2 text-muted-foreground",
  },
};

/**
 * Side-by-side version comparison.
 *
 * Uses the structured diff from `diffSnapshots` and renders added / removed /
 * changed slides with both icons AND labels (never colour alone) so the
 * treatment is accessible. Text changes are shown inline with before/after.
 */
export function VersionCompare({ diff, beforeLabel, afterLabel }: VersionCompareProps) {
  const hasChanges =
    diff.addedSlides > 0 ||
    diff.removedSlides > 0 ||
    diff.changedSlides > 0 ||
    diff.metaChanges.length > 0;

  if (!hasChanges) {
    return (
      <Empty className="rounded-lg border border-dashed border-border bg-surface-1">
        <EmptyHeader>
          <EmptyTitle>No differences</EmptyTitle>
          <EmptyDescription>
            {beforeLabel} and {afterLabel} are identical.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className={cn("rounded px-1.5 py-0.5", STATUS_CONFIG.added.className)}>
          <HugeiconsIcon
            icon={STATUS_CONFIG.added.icon}
            className="mr-1 inline size-3 align-text-bottom"
            aria-hidden
          />
          {diff.addedSlides} added
        </span>
        <span className={cn("rounded px-1.5 py-0.5", STATUS_CONFIG.removed.className)}>
          <HugeiconsIcon
            icon={STATUS_CONFIG.removed.icon}
            className="mr-1 inline size-3 align-text-bottom"
            aria-hidden
          />
          {diff.removedSlides} removed
        </span>
        <span className={cn("rounded px-1.5 py-0.5", STATUS_CONFIG.changed.className)}>
          <HugeiconsIcon
            icon={STATUS_CONFIG.changed.icon}
            className="mr-1 inline size-3 align-text-bottom"
            aria-hidden
          />
          {diff.changedSlides} changed
        </span>
      </div>

      {diff.metaChanges.length > 0 ? (
        <section aria-label="Deck meta changes">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Deck-level changes
          </h3>
          <ul className="flex flex-col gap-2">
            {diff.metaChanges.map((change) => (
              <li
                key={change.field}
                className="flex flex-col gap-1 rounded-lg border border-border bg-surface-1 p-3 text-sm"
              >
                <span className="font-medium">{change.label}</span>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground line-through">
                    {change.before ?? "—"}
                  </span>
                  <HugeiconsIcon
                    icon={PencilIcon}
                    className="size-3 text-brand"
                    aria-hidden
                  />
                  <span className="text-foreground">
                    {change.after ?? "—"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {diff.slides.length > 0 ? (
        <section aria-label="Slide changes">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Slide changes
          </h3>
          <ul className="flex flex-col gap-3">
            {diff.slides.map((slide) => (
              <li key={slide.order ?? slide.title}>
                <div
                  className={cn(
                    "rounded-lg border p-4",
                    STATUS_CONFIG[slide.status].className,
                  )}
                >
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon
                      icon={STATUS_CONFIG[slide.status].icon}
                      className="size-4"
                      aria-hidden
                    />
                    <span className="font-medium">
                      {STATUS_CONFIG[slide.status].label}{" "}
                      {slide.order !== null ? `· Slide ${slide.order}` : ""}{" "}
                      · {slide.title}
                    </span>
                  </div>

                  {slide.changes.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3">
                      {slide.changes.map((change) => (
                        <li
                          key={change.field}
                          className="flex flex-col gap-1 text-sm"
                        >
                          <span className="font-medium text-foreground/90">
                            {change.label}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="max-w-[24rem] truncate text-muted-foreground line-through">
                              {change.before ?? "—"}
                            </span>
                            <HugeiconsIcon
                              icon={PencilIcon}
                              className="size-3 shrink-0 text-brand"
                              aria-hidden
                            />
                            <span className="max-w-[24rem] truncate text-foreground">
                              {change.after ?? "—"}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}