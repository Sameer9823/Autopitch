"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import {
  ChartBarLineIcon,
  EditIcon,
  FlashIcon,
  Image01Icon,
  MagicWand01Icon,
  Mic01Icon,
  RetryIcon,
  SparklesIcon,
  Target01Icon,
  ZapIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { EditorSlide } from "@/lib/editor/use-deck-editor";
import type { EditorialAction } from "@/lib/schemas/slide";

/**
 * AI tab: one button per editorial action.
 *
 * Every action runs against THIS slide only. Each button owns its loading state
 * and its own error, so one failed action never blocks the rest, and a failure
 * is always retryable.
 *
 * The four actions that change meaning rather than wording — Generate Visual,
 * Generate Chart, Speaker Notes and Regenerate Slide — are grouped separately
 * from the copy refinements, because they replace content rather than polish it.
 */

export type InspectorAiTabProps = {
  slide: EditorSlide;
  /** The action currently running, or null. */
  pendingAction: EditorialAction | null;
  /** Action -> failure message. Cleared when the action is retried. */
  errors: Partial<Record<EditorialAction, string>>;
  onRun: (action: EditorialAction) => void;
  onDismissError: (action: EditorialAction) => void;
};

const COPY_ACTIONS: {
  action: EditorialAction;
  label: string;
  hint: string;
  icon: typeof SparklesIcon;
}[] = [
  {
    action: "improve",
    label: "Improve",
    hint: "Tighten the wording without changing the claims",
    icon: SparklesIcon,
  },
  {
    action: "rewrite",
    label: "Rewrite",
    hint: "Same facts, fresh framing",
    icon: EditIcon,
  },
  {
    action: "shorten",
    label: "Shorten",
    hint: "Cut to roughly half the length",
    icon: ZapIcon,
  },
  {
    action: "expand",
    label: "Expand",
    hint: "Add substance without padding",
    icon: FlashIcon,
  },
  {
    action: "investor_focused",
    label: "Make investor-focused",
    hint: "Lead with proof and answer the obvious objection",
    icon: Target01Icon,
  },
  {
    action: "headline",
    label: "Generate headline",
    hint: "Rewrite only the title",
    icon: MagicWand01Icon,
  },
];

const STRUCTURAL_ACTIONS: {
  action: EditorialAction;
  label: string;
  hint: string;
  icon: typeof SparklesIcon;
  destructive?: boolean;
}[] = [
  {
    action: "chart",
    label: "Generate chart",
    hint: "Add a chart built from numbers already in the deck",
    icon: ChartBarLineIcon,
  },
  {
    action: "speaker_notes",
    label: "Speaker notes",
    hint: "Write what you will say out loud — never a copy of the slide",
    icon: Mic01Icon,
  },
  {
    action: "visual",
    label: "Generate visual",
    hint: "New art direction, then generate the image for this slide",
    icon: Image01Icon,
  },
  {
    action: "regenerate",
    label: "Regenerate slide",
    hint: "A complete new version of this slide. Other slides are untouched.",
    icon: RetryIcon,
    destructive: true,
  },
];

export function InspectorAiTab({
  slide,
  pendingAction,
  errors,
  onRun,
  onDismissError,
}: InspectorAiTabProps) {
  const busy = pendingAction !== null;

  return (
    <div className="flex flex-col gap-6">
      {slide.userEdited ? (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          You have hand-edited this slide. AI suggestions preserve your wording and
          are shown side by side before anything is replaced.
        </p>
      ) : null}

      <ActionGroup
        title="Refine the copy"
        actions={COPY_ACTIONS}
        pendingAction={pendingAction}
        errors={errors}
        onRun={onRun}
        onDismissError={onDismissError}
      />

      <ActionGroup
        title="Rebuild this slide"
        actions={STRUCTURAL_ACTIONS}
        pendingAction={pendingAction}
        errors={errors}
        onRun={onRun}
        onDismissError={onDismissError}
      />

      {busy ? (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Spinner className="size-3.5" />
          Working on slide {slide.order} only. Other slides are not touched.
        </p>
      ) : null}
    </div>
  );
}

function ActionGroup({
  title,
  actions,
  pendingAction,
  errors,
  onRun,
  onDismissError,
}: {
  title: string;
  actions: {
    action: EditorialAction;
    label: string;
    hint: string;
    icon: typeof SparklesIcon;
    destructive?: boolean;
  }[];
  pendingAction: EditorialAction | null;
  errors: Partial<Record<EditorialAction, string>>;
  onRun: (action: EditorialAction) => void;
  onDismissError: (action: EditorialAction) => void;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>

      <ul className="flex flex-col gap-2">
        {actions.map((item) => {
          const pending = pendingAction === item.action;
          const error = errors[item.action];

          return (
            <li key={item.action} className="flex flex-col gap-1.5">
              <Button
                variant={item.destructive ? "outline" : "secondary"}
                size="sm"
                className="h-auto w-full justify-start gap-2 py-2 text-left"
                disabled={pendingAction !== null}
                onClick={() => onRun(item.action)}
              >
                {pending ? (
                  <Spinner className="size-4 shrink-0" />
                ) : (
                  <HugeiconsIcon icon={item.icon} className="size-4 shrink-0" aria-hidden />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
              </Button>

              {error ? (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
                >
                  <span className="min-w-0 flex-1">{error}</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0 text-destructive"
                    onClick={() => onRun(item.action)}
                  >
                    Retry
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0 text-destructive"
                    onClick={() => onDismissError(item.action)}
                  >
                    Dismiss
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
