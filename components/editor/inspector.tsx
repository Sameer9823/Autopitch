"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { InspectorAiTab } from "@/components/editor/inspector-ai-tab";
import { InspectorContentTab } from "@/components/editor/inspector-content-tab";
import { InspectorDesignTab } from "@/components/editor/inspector-design-tab";
import { MagicWand01Icon, PencilIcon, Settings01Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EditorSlide } from "@/lib/editor/use-deck-editor";
import type { SlideTheme } from "@/lib/deck/theme";
import type { EditorialAction, SlideBlock } from "@/lib/schemas/slide";

/**
 * Right column: the primary editing surface.
 *
 * Three tabs, each answering one question:
 *   Design  — how does this slide look?
 *   Content — what does this slide say?
 *   AI      — what else could this slide say?
 *
 * The inspector owns no state of its own; it edits the slide the editor hook
 * hands it, so the navigator, the canvas and the inspector can never disagree.
 */

export type InspectorProps = {
  slide: EditorSlide | null;
  slideCount: number;
  theme: SlideTheme | null;
  brandKitName: string | null;

  onFieldChange: (patch: Partial<EditorSlide>, label: string) => void;
  onBlocksChange: (blocks: SlideBlock[]) => void;
  onLayoutChange: (layout: EditorSlide["layout"]) => void;
  onAddSlide: () => void;

  pendingAction: EditorialAction | null;
  aiErrors: Partial<Record<EditorialAction, string>>;
  onRunAction: (action: EditorialAction) => void;
  onDismissAiError: (action: EditorialAction) => void;

  imageBusy: boolean;
  imageError: string | null;
  onPromptChange: (prompt: string) => void;
  onGenerateImage: () => void;
  onRetryImage: () => void;
  onRegenerateVisual: () => void;
  onUsePlaceholder: () => void;
};

export function Inspector(props: InspectorProps) {
  const { slide, slideCount } = props;

  if (!slide) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <HugeiconsIcon
          icon={Settings01Icon}
          className="size-6 text-subtle-foreground"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">
          {slideCount === 0
            ? "This deck has no slides yet. Add one to start editing."
            : "Select a slide to edit it."}
        </p>
        <Button size="sm" onClick={props.onAddSlide}>
          Add a slide
        </Button>
      </div>
    );
  }

  return (
    <Tabs defaultValue="content" className="flex h-full min-h-0 flex-col gap-0">
      <div className="border-b border-border px-3 py-2.5">
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="design">
            <HugeiconsIcon icon={Settings01Icon} className="size-4" aria-hidden />
            Design
          </TabsTrigger>
          <TabsTrigger value="content">
            <HugeiconsIcon icon={PencilIcon} className="size-4" aria-hidden />
            Content
          </TabsTrigger>
          <TabsTrigger value="ai">
            <HugeiconsIcon icon={MagicWand01Icon} className="size-4" aria-hidden />
            AI
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="design" className="min-h-0 flex-1 overflow-y-auto p-4">
        <InspectorDesignTab
          slide={slide}
          theme={props.theme}
          brandKitName={props.brandKitName}
          imageBusy={props.imageBusy}
          imageError={props.imageError}
          onLayoutChange={props.onLayoutChange}
          onLabelChange={(label) => props.onFieldChange({ label }, "Label")}
          onCaptionChange={(caption) => props.onFieldChange({ caption }, "Caption")}
          onPromptChange={props.onPromptChange}
          onGenerateImage={props.onGenerateImage}
          onRetryImage={props.onRetryImage}
          onRegenerateVisual={props.onRegenerateVisual}
          onUsePlaceholder={props.onUsePlaceholder}
        />
      </TabsContent>

      <TabsContent value="content" className="min-h-0 flex-1 overflow-y-auto p-4">
        <InspectorContentTab
          slide={slide}
          onFieldChange={props.onFieldChange}
          onBlocksChange={props.onBlocksChange}
        />
      </TabsContent>

      <TabsContent value="ai" className="min-h-0 flex-1 overflow-y-auto p-4">
        <InspectorAiTab
          slide={slide}
          pendingAction={props.pendingAction}
          errors={props.aiErrors}
          onRun={props.onRunAction}
          onDismissError={props.onDismissAiError}
        />
      </TabsContent>
    </Tabs>
  );
}
