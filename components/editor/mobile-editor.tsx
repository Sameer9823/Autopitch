"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { SlideCanvasWrapper } from "@/components/editor/slide-canvas-wrapper";
import { Inspector } from "@/components/editor/inspector";
import { SlideNavigator } from "@/components/editor/slide-navigator";
import { Folder01Icon, PlusIcon, Settings01Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { InspectorProps } from "@/components/editor/inspector";
import type { EditorSlide } from "@/lib/editor/use-deck-editor";
import type { SlideTheme } from "@/lib/deck/theme";

/**
 * Small-screen editor.
 *
 * The three-column desktop layout is not squeezed into a phone. Instead the
 * canvas comes first at full width, and the navigator and the inspector move
 * into two sheets. Both sheets host the SAME components the desktop layout uses,
 * so the two layouts can never diverge in behaviour.
 */

/** The state the sheets hand to the shared navigator and inspector. */
type SharedEditingProps = Omit<InspectorProps, "slide" | "slideCount" | "onAddSlide"> & {
  slides: EditorSlide[];
  activeSlide: EditorSlide | null;
  onSelect: (slideId: string) => void;
  onReorder: (slideIds: string[]) => void;
  onDuplicate: (slideId: string) => void;
  onRequestDelete: (slideId: string) => void;
  busySlideId: string | null;
  actionError: string | null;
  onRetryAction: () => void;
};

type MobileEditorProps = SharedEditingProps & {
  theme: SlideTheme | null;
  isLoading: boolean;
  loadError: string | null;
  onRetryLoad: () => void;
  onTitleChange: (value: string) => void;
  onTitleBlur: () => void;
  onAddSlide: () => void;
};

export function MobileEditor({
  slides,
  activeSlide,
  theme,
  isLoading,
  loadError,
  onRetryLoad,
  onTitleChange,
  onTitleBlur,
  onAddSlide,
  onSelect,
  onReorder,
  onDuplicate,
  onRequestDelete,
  busySlideId,
  actionError,
  onRetryAction,
  ...inspector
}: MobileEditorProps) {
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Sheet open={navigatorOpen} onOpenChange={setNavigatorOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                aria-label="Open the slide list"
              />
            }
          >
            <HugeiconsIcon icon={Folder01Icon} aria-hidden />
            Slides
            <span className="text-xs tabular-nums text-muted-foreground">
              {activeSlide ? activeSlide.order : 0}/{slides.length}
            </span>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85dvh] border-t">
            <SheetHeader>
              <SheetTitle>Slides</SheetTitle>
              <SheetDescription>
                Drag to reorder, or duplicate and remove a slide.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 border-t border-border">
              <SlideNavigator
                slides={slides}
                activeSlideId={activeSlide?.id ?? null}
                theme={theme}
                onSelect={(slideId) => {
                  onSelect(slideId);
                  setNavigatorOpen(false);
                }}
                onReorder={onReorder}
                onAdd={onAddSlide}
                onDuplicate={onDuplicate}
                onRequestDelete={onRequestDelete}
                busySlideId={busySlideId}
                actionError={actionError}
                onRetryAction={onRetryAction}
              />
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                aria-label="Open the slide inspector"
              />
            }
          >
            <HugeiconsIcon icon={Settings01Icon} aria-hidden />
            Edit slide
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85dvh] border-t">
            <SheetHeader>
              <SheetTitle>Edit slide {activeSlide?.order ?? ""}</SheetTitle>
              <SheetDescription>
                Design, content and AI actions for this slide.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
              <Inspector
                {...inspector}
                slide={activeSlide}
                slideCount={slides.length}
                theme={theme}
                onAddSlide={onAddSlide}
              />
            </div>
          </SheetContent>
        </Sheet>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Add a slide after the current one"
          onClick={onAddSlide}
        >
          <HugeiconsIcon icon={PlusIcon} aria-hidden />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <SlideCanvasWrapper
          slide={activeSlide}
          theme={theme}
          isLoading={isLoading}
          loadError={loadError}
          onRetryLoad={onRetryLoad}
          onTitleChange={onTitleChange}
          onTitleBlur={onTitleBlur}
          onAddSlide={onAddSlide}
          slideCount={slides.length}
        />
      </div>
    </div>
  );
}
