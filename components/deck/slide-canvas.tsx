import { HugeiconsIcon } from "@hugeicons/react";

import { Alert02Icon, Image01Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { normalizeSlide, type RenderSlide } from "@/lib/deck/render-model";
import {
  DEFAULT_SLIDE_THEME,
  SLIDE_CHART_COLORS,
  type SlideTheme,
} from "@/lib/deck/theme";
import { parseSlideBlocks, type SlideBlock } from "@/lib/schemas/slide";

/**
 * The one slide renderer.
 *
 * Used by the editor canvas, presentation mode, and the public investor viewer.
 * Pure presentational: no data fetching, no AI, no editor controls. Every size is
 * expressed in container-query units (`cqw`), so the same component renders
 * correctly as a 160px thumbnail, a 900px editor canvas, or a fullscreen slide.
 *
 * The PDF and PPTX exporters mirror this exact structure, which is what keeps
 * export fidelity high without resorting to screenshots.
 */
export type SlideCanvasProps = {
  slide: RenderSlide & { blocks?: unknown };
  theme?: SlideTheme | null;
  /** Show the queued / generating / failed visual state UI. */
  showImageState?: boolean;
  className?: string;
};

export function SlideCanvas({
  slide,
  theme,
  showImageState = true,
  className = "",
}: SlideCanvasProps) {
  const activeTheme = theme ?? DEFAULT_SLIDE_THEME;

  const normalized = normalizeSlide({
    ...slide,
    blocks: parseSlideBlocks(slide.blocks),
  });

  const metrics = normalized.blocks.filter(
    (block): block is Extract<SlideBlock, { type: "metric" }> =>
      block.type === "metric",
  );
  const charts = normalized.blocks.filter(
    (block): block is Extract<SlideBlock, { type: "chart" }> =>
      block.type === "chart",
  );
  const bullets = normalized.blocks.flatMap((block) =>
    block.type === "bullets" ? block.items : [],
  );

  const hasImage = Boolean(normalized.imageUrl);
  const isTitleLayout =
    normalized.layout === "TITLE" || normalized.layout === "CLOSING";
  const splitLayout = hasImage && !isTitleLayout;

  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden font-sans ${className}`}
      style={{
        backgroundColor: activeTheme.background,
        color: activeTheme.foreground,
        fontFamily: activeTheme.bodyFont,
        containerType: "inline-size",
      }}
    >
      <div className="flex h-full w-full flex-col gap-[3cqw] p-[5cqw]">
        {normalized.label ? (
          <span
            className="w-fit rounded-[0.4em] px-[0.9em] py-[0.35em] text-[1cqw] font-medium tracking-wide uppercase"
            style={{
              color: activeTheme.accent,
              backgroundColor: `${activeTheme.accent}1f`,
            }}
          >
            {normalized.label}
          </span>
        ) : null}

        <header className="flex flex-col gap-[1cqw]">
          <h2
            className="font-heading font-semibold tracking-tight text-[3.4cqw] leading-[1.08]"
            style={{ fontFamily: activeTheme.headingFont }}
          >
            {normalized.title}
          </h2>

          {normalized.subtitle ? (
            <p className="text-[1.7cqw] leading-snug text-muted-foreground">
              {normalized.subtitle}
            </p>
          ) : null}
        </header>

        <div
          className={
            splitLayout
              ? "grid flex-1 grid-cols-2 items-center gap-[4cqw]"
              : "flex flex-1 flex-col justify-center gap-[2.5cqw]"
          }
        >
          <div className="flex min-w-0 flex-col gap-[2cqw]">
            {bullets.length > 0 ? (
              <ul className="flex flex-col gap-[1.3cqw] text-[1.6cqw] leading-relaxed">
                {bullets.slice(0, 6).map((item, index) => (
                  <li key={index} className="flex gap-[1cqw]">
                    <span
                      aria-hidden
                      className="mt-[0.75cqw] size-[0.5cqw] shrink-0 rounded-full"
                      style={{ backgroundColor: activeTheme.accent }}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {normalized.content ? (
              <p className="whitespace-pre-line text-[1.6cqw] leading-relaxed text-muted-foreground">
                {normalized.content}
              </p>
            ) : null}

            {metrics.length > 0 ? (
              <dl className="mt-[1cqw] grid grid-cols-3 gap-[1.5cqw]">
                {metrics.slice(0, 3).map((metric, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-[0.5cqw] rounded-[0.8em] border p-[1.6cqw]"
                    style={{
                      borderColor: activeTheme.border,
                      backgroundColor: activeTheme.surface,
                    }}
                  >
                    <dd
                      className="font-heading text-[2.6cqw] font-semibold tabular-nums"
                      style={{
                        color: metric.placeholder ? activeTheme.muted : activeTheme.accent,
                      }}
                    >
                      {metric.placeholder ? "—" : metric.value}
                    </dd>
                    <dt className="text-[1.1cqw] leading-snug text-muted-foreground">
                      {metric.placeholder ? "Data needed" : metric.label}
                    </dt>
                    {metric.delta ? (
                      <p className="text-[1cqw] text-muted-foreground">
                        {metric.delta}
                      </p>
                    ) : null}
                  </div>
                ))}
              </dl>
            ) : null}

            {charts.length > 0 ? (
              <ChartPreview block={charts[0]} theme={activeTheme} />
            ) : null}
          </div>

          {splitLayout ? (
            <SlideImage
              slide={normalized}
              theme={activeTheme}
              showState={showImageState}
            />
          ) : null}
        </div>

        {normalized.caption ? (
          <p className="text-[1.1cqw] text-muted-foreground">
            {normalized.caption}
          </p>
        ) : null}
      </div>

      <span
        aria-hidden
        className="absolute right-[3cqw] bottom-[2.5cqw] text-[1cqw]"
        style={{ color: `${activeTheme.muted}80` }}
      >
        {normalized.order}
      </span>
    </div>
  );
}

function SlideImage({
  slide,
  theme,
  showState,
}: {
  slide: RenderSlide;
  theme: SlideTheme;
  showState: boolean;
}) {
  const status = slide.imageStatus ?? "NONE";

  if (slide.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={slide.imageUrl}
        alt={slide.title}
        className="h-full w-full object-cover"
        style={{ borderRadius: "1em" }}
      />
    );
  }

  if (!showState || status === "NONE") {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-[1.5cqw] rounded-[1em] border border-dashed p-[3cqw] text-center"
        style={{ borderColor: theme.border }}
      >
        <HugeiconsIcon
          icon={Image01Icon}
          className="size-[5cqw]"
          style={{ color: theme.muted }}
          aria-hidden
        />
        <p className="text-[1.3cqw] text-muted-foreground">
          No visual on this slide
        </p>
      </div>
    );
  }

  if (status === "QUEUED" || status === "GENERATING") {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-[1.5cqw] rounded-[1em] border p-[3cqw] text-center"
        style={{ borderColor: theme.border, backgroundColor: theme.surface }}
      >
        <Spinner className="size-[5cqw]" />
        <p className="text-[1.3cqw] text-muted-foreground">
          {status === "QUEUED" ? "Visual queued" : "Generating visual"}
        </p>
      </div>
    );
  }

  // FAILED — never render a broken image; offer a route back.
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-[1.5cqw] rounded-[1em] border p-[3cqw] text-center"
      style={{ borderColor: theme.border, backgroundColor: theme.surface }}
    >
      <HugeiconsIcon
        icon={Alert02Icon}
        className="size-[5cqw]"
        style={{ color: theme.accent }}
        aria-hidden
      />
      <p className="text-[1.3cqw] text-muted-foreground">
        Visual generation failed
      </p>
      <p className="text-[1.1cqw] text-muted-foreground">
        Retry or use a placeholder from the inspector.
      </p>
    </div>
  );
}

function ChartPreview({
  block,
  theme,
}: {
  block: Extract<SlideBlock, { type: "chart" }>;
  theme: SlideTheme;
}) {
  const max = Math.max(...block.series.map((point) => point.value), 0.0001);

  return (
    <figure
      className="mt-[1cqw] flex flex-col gap-[1.4cqw] rounded-[1em] border p-[1.8cqw]"
      style={{ borderColor: theme.border, backgroundColor: theme.surface }}
    >
      {block.title ? (
        <figcaption className="text-[1.3cqw] font-medium">
          {block.title}
        </figcaption>
      ) : null}

      <div className="flex h-[16cqw] items-end gap-[1.4cqw]">
        {block.series.map((point, index) => (
          <div
            key={index}
            className="flex min-w-0 flex-1 flex-col items-center gap-[0.7cqw]"
          >
            <span className="text-[1.1cqw] text-muted-foreground">
              {point.value.toLocaleString()}
            </span>
            <div
              className="w-full rounded-t-[0.3em]"
              style={{
                height: `${Math.max((point.value / max) * 100, 2)}%`,
                backgroundColor:
                  SLIDE_CHART_COLORS[index % SLIDE_CHART_COLORS.length],
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-[1.4cqw]">
        {block.series.map((point, index) => (
          <span
            key={index}
            className="min-w-0 flex-1 truncate text-center text-[1.05cqw] text-muted-foreground"
          >
            {point.label}
          </span>
        ))}
      </div>

      {block.caption ? (
        <p className="text-[1.05cqw] text-muted-foreground">{block.caption}</p>
      ) : null}
    </figure>
  );
}