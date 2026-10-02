"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { SlideCanvas } from "@/components/deck/slide-canvas";
import { toCanvasSlide } from "@/components/editor/helpers";
import {
  Alert02Icon,
  Copy02Icon,
  Folder01Icon,
  Menu01Icon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { EditorSlide } from "@/lib/editor/use-deck-editor";
import type { SlideTheme } from "@/lib/deck/theme";

/**
 * Left column: the deck's slides as thumbnails.
 *
 * Thumbnails are the SAME `<SlideCanvas>` the editor canvas, the share viewer and
 * both exporters use, scaled by a fixed aspect-ratio box. Because SlideCanvas
 * sizes everything in container-query units, one component is correct at 176px
 * and at 1280px — so a thumbnail can never disagree with the real slide.
 *
 * Reordering is optimistic: the list moves on drop and the new order is then
 * persisted in a single transaction. A failed reorder is rolled back to the
 * server's order and surfaced with a Retry, never left half-applied.
 */

type SlideNavigatorProps = {
  slides: EditorSlide[];
  activeSlideId: string | null;
  theme: SlideTheme | null;
  onSelect: (slideId: string) => void;
  onReorder: (slideIds: string[]) => void;
  onAdd: () => void;
  onDuplicate: (slideId: string) => void;
  onRequestDelete: (slideId: string) => void;
  busySlideId: string | null;
  actionError: string | null;
  onRetryAction: () => void;
};

export function SlideNavigator({
  slides,
  activeSlideId,
  theme,
  onSelect,
  onReorder,
  onAdd,
  onDuplicate,
  onRequestDelete,
  busySlideId,
  actionError,
  onRetryAction,
}: SlideNavigatorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const ids = slides.map((slide) => slide.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));

    if (from < 0 || to < 0) {
      return;
    }

    const next = [...ids];
    const [moved] = next.splice(from, 1);
    if (moved !== undefined) {
      next.splice(to, 0, moved);
    }

    onReorder(next);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 className="font-heading text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Slides · {slides.length}
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Add a slide after the current one"
          disabled={busySlideId !== null}
          onClick={onAdd}
        >
          <HugeiconsIcon icon={PlusIcon} aria-hidden />
        </Button>
      </div>

      {actionError ? (
        <div
          role="alert"
          className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
        >
          <HugeiconsIcon icon={Alert02Icon} className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{actionError}</span>
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0 text-destructive"
            onClick={onRetryAction}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {slides.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <HugeiconsIcon
            icon={Folder01Icon}
            className="size-6 text-subtle-foreground"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            This deck has no slides yet. Add one to start shaping the story.
          </p>
          <Button size="sm" onClick={onAdd}>
            <HugeiconsIcon icon={PlusIcon} aria-hidden />
            Add a slide
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={slides.map((slide) => slide.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
              {slides.map((slide, index) => (
                <SortableThumbnail
                  key={slide.id}
                  slide={slide}
                  index={index}
                  isActive={slide.id === activeSlideId}
                  isBusy={slide.id === busySlideId}
                  theme={theme}
                  onSelect={onSelect}
                  onDuplicate={onDuplicate}
                  onRequestDelete={onRequestDelete}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableThumbnail({
  slide,
  index,
  isActive,
  isBusy,
  theme,
  onSelect,
  onDuplicate,
  onRequestDelete,
}: {
  slide: EditorSlide;
  index: number;
  isActive: boolean;
  isBusy: boolean;
  theme: SlideTheme | null;
  onSelect: (slideId: string) => void;
  onDuplicate: (slideId: string) => void;
  onRequestDelete: (slideId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slide.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : undefined}
    >
      <div
        className={`group/thumb relative overflow-hidden rounded-lg border bg-surface-2 transition-colors ${
          isActive
            ? "border-brand ring-1 ring-brand/40"
            : "border-border hover:border-muted-foreground/40"
        }`}
      >
        <button
          type="button"
          onClick={() => onSelect(slide.id)}
          aria-current={isActive ? "true" : undefined}
          aria-label={`Slide ${index + 1}: ${slide.title || "Untitled slide"}`}
          className="block w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="block aspect-video w-full">
            <SlideCanvas slide={toCanvasSlide(slide)} theme={theme} />
          </span>
        </button>

        <span className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1.5 bg-gradient-to-b from-black/70 to-transparent p-1.5">
          <span className="rounded-md bg-black/50 px-1.5 py-0.5 text-[0.625rem] font-medium tabular-nums text-white">
            {index + 1}
          </span>
          {slide.imageStatus === "GENERATING" || slide.imageStatus === "QUEUED" ? (
            <span className="flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[0.625rem] text-white">
              <Spinner className="size-2.5" />
              Visual
            </span>
          ) : slide.imageStatus === "FAILED" ? (
            <span className="flex items-center gap-1 rounded-md bg-destructive/80 px-1.5 py-0.5 text-[0.625rem] text-white">
              <HugeiconsIcon icon={Alert02Icon} className="size-2.5" aria-hidden />
              No visual
            </span>
          ) : null}
          {slide.userEdited ? (
            <span className="ml-auto rounded-md bg-black/50 px-1.5 py-0.5 text-[0.625rem] text-white">
              Edited
            </span>
          ) : null}
        </span>

        <span className="absolute right-1.5 bottom-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/thumb:opacity-100 group-focus-within/thumb:opacity-100">
          <Button
            variant="secondary"
            size="icon-xs"
            aria-label={`Reorder slide ${index + 1}`}
            {...attributes}
            {...listeners}
          >
            <HugeiconsIcon icon={Menu01Icon} className="size-3" aria-hidden />
          </Button>
          <Button
            variant="secondary"
            size="icon-xs"
            aria-label={`Duplicate slide ${index + 1}`}
            disabled={isBusy}
            onClick={() => onDuplicate(slide.id)}
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3" aria-hidden />
          </Button>
          <Button
            variant="secondary"
            size="icon-xs"
            aria-label={`Delete slide ${index + 1}`}
            disabled={isBusy}
            onClick={() => onRequestDelete(slide.id)}
          >
            <HugeiconsIcon icon={TrashIcon} className="size-3" aria-hidden />
          </Button>
        </span>
      </div>
    </li>
  );
}
