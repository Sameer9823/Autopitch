import { HugeiconsIcon } from "@hugeicons/react";

import { SlideCanvas } from "@/components/deck/slide-canvas";
import { Alert02Icon, CheckmarkCircle01Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import type { SlideVerdict } from "@/lib/ai/investor-review";
import type { RenderSlide } from "@/lib/deck/render-model";
import type { SlideTheme } from "@/lib/deck/theme";
import { cn } from "@/lib/utils";

/**
 * Strongest and weakest slides, shown as the slides themselves.
 *
 * A verdict is only credible if the founder can see what it is about, so every
 * entry renders the actual slide through the same `<SlideCanvas>` the editor and
 * the share viewer use. If the deck is re-laid-out later, this panel follows it
 * automatically rather than showing a stale thumbnail.
 *
 * Verdicts that cite a slide number the deck does not have are dropped rather
 * than rendered as an empty frame.
 */

const TONES = {
  strong: {
    label: "Strong",
    badge: "border-success/40 bg-success/10 text-success",
    icon: CheckmarkCircle01Icon,
  },
  weak: {
    label: "Weak",
    badge: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: Alert02Icon,
  },
} as const;

function VerdictCard({
  verdict,
  slide,
  theme,
  tone,
}: {
  verdict: SlideVerdict;
  slide: RenderSlide | undefined;
  theme: SlideTheme | null;
  tone: keyof typeof TONES;
}) {
  const toneInfo = TONES[tone];

  return (
    <li className="rv-surface flex flex-col gap-3 overflow-hidden">
      <div className="border-b border-border">
        <div className="aspect-video w-full">
          {slide ? (
            <SlideCanvas slide={slide} theme={theme} showImageState={false} />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface-2 text-xs text-subtle-foreground">
              Slide {verdict.slideOrder} is no longer in this deck
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("border", toneInfo.badge)}>
            <HugeiconsIcon icon={toneInfo.icon} aria-hidden />
            {toneInfo.label}
          </Badge>
          <span className="text-xs text-subtle-foreground">
            Slide {verdict.slideOrder}
          </span>
        </div>

        <p className="font-heading text-sm font-medium text-foreground">
          {verdict.title}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {verdict.reason}
        </p>
      </div>
    </li>
  );
}

export function SlideVerdicts({
  verdicts,
  slides,
  theme,
  tone,
}: {
  verdicts: readonly SlideVerdict[];
  slides: readonly RenderSlide[];
  theme: SlideTheme | null;
  tone: keyof typeof TONES;
}) {
  if (verdicts.length === 0) return null;

  const byOrder = new Map(slides.map((slide) => [slide.order, slide]));

  return (
    <section aria-labelledby={tone === "strong" ? "strongest-slides" : "weakest-slides"}>
      <h2
        id={tone === "strong" ? "strongest-slides" : "weakest-slides"}
        className="font-heading text-sm font-semibold tracking-tight"
      >
        {tone === "strong" ? "Strongest slides" : "Weakest slides"}
      </h2>
      <p className="mt-1 text-xs text-subtle-foreground">
        {tone === "strong"
          ? "The slides doing the most work. Keep these as they are."
          : "The slides most likely to lose the room. Fix these before you fix anything else."}
      </p>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {verdicts.map((verdict, index) => (
          <VerdictCard
            key={`${verdict.slideOrder}-${index}`}
            verdict={verdict}
            slide={byOrder.get(verdict.slideOrder)}
            theme={theme}
            tone={tone}
          />
        ))}
      </ul>
    </section>
  );
}
