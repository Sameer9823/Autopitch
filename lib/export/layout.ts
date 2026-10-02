/**
 * Export layout.
 *
 * Turns a `RenderSlide` into a *resolved, measured* description: every element
 * has a box, a fitted font size and a colour before either exporter touches it.
 *
 * This is the single reason the PDF and the PPTX cannot drift apart. They do
 * not each re-derive "where does the title go" from the CSS; they both call
 * `resolveExportSlide`, and then only differ in how they paint primitives
 * (vector text vs. a text box, a rect vs. a shape).
 *
 * All geometry is expressed in the canvas coordinate space the editor already
 * uses — 1280x720 "px", where 1px maps to 1pt in the PDF and to 1/128 inch in
 * the PPTX. The type scale below is transcribed from the `cqw` values in
 * `components/deck/slide-canvas.tsx`, because 1cqw at a 1280px container width
 * is exactly 12.8px. If the canvas changes, these numbers are the second thing
 * that needs to change — the first being the renderer itself.
 */

import { normalizeSlide, type RenderSlide } from "@/lib/deck/render-model";
import {
  SLIDE_CHART_COLORS,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type SlideTheme,
} from "@/lib/deck/theme";
import type { ChartType } from "@/lib/schemas/slide";
import {
  fitText,
  fontFamilyOf,
  formatChartValue,
  type FittedText,
  type FontFamily,
} from "./slide-measure";

/** One container-query unit at a 1280px slide width. */
const CW = SLIDE_WIDTH / 100;

// --- spacing, mirroring the canvas ------------------------------------------
const PAD = 5 * CW;
const STACK_GAP = 3 * CW;
const HEADER_GAP = 1 * CW;
const CONTENT_W = SLIDE_WIDTH - 2 * PAD;
const SPLIT_GAP = 4 * CW;

const COLUMN_GAP = 2 * CW;
const BULLET_GAP = 1.3 * CW;
const BULLET_DOT = 0.5 * CW;
const BULLET_DOT_INSET = 0.75 * CW;
const BULLET_INDENT = 1.5 * CW;

const METRICS_MT = 1 * CW;
const METRICS_GAP = 1.5 * CW;
const METRIC_PAD = 1.6 * CW;
const METRIC_INNER_GAP = 0.5 * CW;

const CHART_MT = 1 * CW;
const CHART_PAD = 1.8 * CW;
const CHART_GAP = 1.4 * CW;
const CHART_PLOT = 16 * CW;
const CHART_PLOT_MIN = 8 * CW;

const LABEL_CHIP_PAD_X = 0.9 * CW;
const LABEL_CHIP_PAD_Y = 0.35 * CW;

// --- type scale, mirroring the canvas ---------------------------------------
const FS = {
  label: 1 * CW,
  title: 3.4 * CW,
  subtitle: 1.7 * CW,
  body: 1.6 * CW,
  metricValue: 2.6 * CW,
  metricLabel: 1.1 * CW,
  metricDelta: 1 * CW,
  caption: 1.1 * CW,
  chartTitle: 1.3 * CW,
  chartValue: 1.1 * CW,
  chartLabel: 1.05 * CW,
  order: 1 * CW,
} as const;

const LH = {
  title: 1.08,
  subtitle: 1.4,
  body: 1.625,
  caption: 1.4,
  tight: 1.2,
} as const;

// --- hard limits ------------------------------------------------------------
const MAX_TITLE_LINES = 3;
const MAX_SUBTITLE_LINES = 2;
const MAX_BULLETS = 6;
const MAX_METRICS = 3;
const METRIC_COLUMNS = 3;

/**
 * Padding, type scale and line heights, published so the exporters never have to
 * re-derive them to position a sub-element inside a card or a chart panel.
 */
export const EXPORT_GEOMETRY = {
  unit: CW,
  slideWidth: SLIDE_WIDTH,
  slideHeight: SLIDE_HEIGHT,
  pad: PAD,
  contentWidth: CONTENT_W,
  splitGap: SPLIT_GAP,
  labelChipPadX: LABEL_CHIP_PAD_X,
  labelChipPadY: LABEL_CHIP_PAD_Y,
  metricPad: METRIC_PAD,
  metricInnerGap: METRIC_INNER_GAP,
  metricColumns: METRIC_COLUMNS,
  bulletIndent: BULLET_INDENT,
  chartPad: CHART_PAD,
  chartGap: CHART_GAP,
  font: FS,
  lineHeight: LH,
} as const;

export type ExportRect = { x: number; y: number; width: number; height: number };

export type ExportMetric = {
  label: string;
  value: string;
  delta: string | null;
  /** The AI could not source this number; render it as "data needed". */
  placeholder: boolean;
};

export type ExportChartPoint = {
  label: string;
  value: number;
  /** Pre-formatted so PDF and PPTX never disagree on rounding. */
  display: string;
  color: string;
};

export type ExportChart = {
  chartType: ChartType;
  title: string | null;
  caption: string | null;
  points: ExportChartPoint[];
  maxValue: number;
  panel: ExportRect;
  plot: ExportRect;
  titleFit: FittedText | null;
  captionFit: FittedText | null;
  /** Top of the axis-label strip under the plot. */
  labelsTop: number;
  labelsHeight: number;
};

export type ExportMetricBox = {
  rect: ExportRect;
  valueText: string;
  valueFit: FittedText;
  valueTop: number;
  labelText: string;
  labelFit: FittedText;
  labelTop: number;
  deltaFit: FittedText | null;
  deltaTop: number;
  placeholder: boolean;
};

export type ExportBullet = {
  text: string;
  fit: FittedText;
  rect: ExportRect;
  /** Centre of the accent dot. */
  dot: { x: number; y: number; size: number };
};

export type ExportSlide = {
  id: string;
  order: number;
  label: { text: string; fit: FittedText; rect: ExportRect } | null;
  title: { text: string; fit: FittedText; rect: ExportRect };
  subtitle: { text: string; fit: FittedText; rect: ExportRect } | null;
  bullets: ExportBullet[];
  body: { text: string; fit: FittedText; rect: ExportRect } | null;
  metrics: ExportMetricBox[];
  chart: ExportChart | null;
  caption: { text: string; fit: FittedText; rect: ExportRect } | null;
  image: { url: string; rect: ExportRect } | null;
  orderBadge: { text: string; fit: FittedText; rect: ExportRect };
  speakerNotes: string | null;
};

export type ExportDeck = {
  width: number;
  height: number;
  theme: SlideTheme;
  headingFamily: FontFamily;
  bodyFamily: FontFamily;
  headingFontName: string;
  bodyFontName: string;
  slides: ExportSlide[];
};

// ---------------------------------------------------------------------------
// Colour helpers — shared so PDF and PPTX use identical RGB values
// ---------------------------------------------------------------------------

/** Parse `#rgb`, `#rrggbb` or `#rrggbbaa` into 0..1 components. */
export function parseHexColor(hex: string): {
  red: number;
  green: number;
  blue: number;
} {
  const value = hex.trim().replace(/^#/, "");
  const expanded =
    value.length === 3 || value.length === 4
      ? value
          .slice(0, 3)
          .split("")
          .map((char) => char + char)
          .join("")
      : value.slice(0, 6);
  const safe = /^[0-9a-f]{6}$/i.test(expanded) ? expanded : "000000";

  return {
    red: parseInt(safe.slice(0, 2), 16) / 255,
    green: parseInt(safe.slice(2, 4), 16) / 255,
    blue: parseInt(safe.slice(4, 6), 16) / 255,
  };
}

/** PPTX and Office XML want bare upper-case hex, never `#`. */
export function toHexDigits(hex: string): string {
  const value = hex.trim().replace(/^#/, "");

  if (value.length === 3) {
    return value
      .split("")
      .map((char) => char + char)
      .join("")
      .toUpperCase();
  }

  const short = /^[0-9a-f]{6}$/i.test(value) ? value.slice(0, 6) : "000000";
  return short.toUpperCase();
}

// ---------------------------------------------------------------------------
// Column flow
// ---------------------------------------------------------------------------

type ChartInput = {
  chartType: ChartType;
  title: string | null;
  caption: string | null;
  points: ExportChartPoint[];
  maxValue: number;
};

type FlowInput = {
  width: number;
  height: number;
  bullets: string[];
  body: string | null;
  metrics: ExportMetric[];
  chart: ChartInput | null;
  headingFamily: FontFamily;
  bodyFamily: FontFamily;
};

type FlowOutput = {
  bullets: ExportBullet[];
  body: { text: string; fit: FittedText; rect: ExportRect } | null;
  metrics: ExportMetricBox[];
  chart: ExportChart | null;
};

type MeasuredMetric = {
  valueText: string;
  valueFit: FittedText;
  labelText: string;
  labelFit: FittedText;
  deltaFit: FittedText | null;
  height: number;
};

function measureMetric(
  metric: ExportMetric,
  cellWidth: number,
  bodyFamily: FontFamily,
  withDelta: boolean,
): MeasuredMetric {
  const inner = Math.max(8, cellWidth - 2 * METRIC_PAD);
  const valueText = metric.placeholder ? "—" : metric.value;
  const labelText = metric.placeholder ? "Data needed" : metric.label;

  const valueFit = fitText(valueText, {
    maxWidth: inner,
    fontSize: FS.metricValue,
    family: bodyFamily,
    maxLines: 1,
    lineHeight: LH.tight,
    minFontSize: 14,
  });

  const labelFit = fitText(labelText, {
    maxWidth: inner,
    fontSize: FS.metricLabel,
    family: bodyFamily,
    maxLines: 2,
    lineHeight: LH.tight,
    minFontSize: 9,
  });

  const deltaFit =
    withDelta && metric.delta
      ? fitText(metric.delta, {
          maxWidth: inner,
          fontSize: FS.metricDelta,
          family: bodyFamily,
          maxLines: 1,
          lineHeight: LH.tight,
          minFontSize: 8,
        })
      : null;

  const height =
    METRIC_PAD * 2 +
    valueFit.height +
    METRIC_INNER_GAP +
    labelFit.height +
    (deltaFit ? METRIC_INNER_GAP + deltaFit.height : 0);

  return {
    valueText,
    valueFit,
    labelText,
    labelFit,
    deltaFit,
    height,
  };
}

type Attempt = {
  bulletsFit: FittedText[];
  bulletsHeight: number;
  bodyFit: FittedText | null;
  bodyHeight: number;
  metricsHeight: number;
  chartPlotHeight: number;
  chartChromeHeight: number;
  chartHeight: number;
  total: number;
};

/**
 * Stack bullets, body, metrics and chart inside a column, then make them fit.
 *
 * Fitting is a bounded reduction ladder rather than a general solver: shrink the
 * body, then the bullets, then the chart's plot, then drop the metric delta, then
 * drop metrics, then drop the chart. That ordering is editorial — a shortened
 * paragraph beats a missing number — and the ladder is capped so a pathological
 * slide cannot spin. Placement is then a plain centred stack, which mirrors the
 * canvas's `justify-center`, and because every block's height was measured
 * against the real budget nothing can escape the column.
 */
function flowColumn(input: FlowInput): FlowOutput {
  const {
    width,
    height,
    bullets,
    body,
    metrics,
    chart,
    headingFamily,
    bodyFamily,
  } = input;

  const cellWidth = Math.max(
    24,
    (width - (METRIC_COLUMNS - 1) * METRICS_GAP) / METRIC_COLUMNS,
  );

  const innerWidth = Math.max(16, width - 2 * CHART_PAD);
  const chartTitleHeight = chart?.title
    ? fitText(chart.title, {
        maxWidth: innerWidth,
        fontSize: FS.chartTitle,
        family: headingFamily,
        maxLines: 1,
        lineHeight: LH.tight,
        minFontSize: 10,
      }).height
    : 0;
  const chartCaptionHeight = chart?.caption
    ? fitText(chart.caption, {
        maxWidth: innerWidth,
        fontSize: FS.chartLabel,
        family: bodyFamily,
        maxLines: 2,
        lineHeight: LH.tight,
        minFontSize: 8,
      }).height
    : 0;

  const chartChromeHeight =
    CHART_PAD * 2 +
    (chart?.title ? chartTitleHeight + CHART_GAP : 0) +
    CHART_GAP +
    FS.chartLabel * LH.tight +
    (chart?.caption ? CHART_GAP + chartCaptionHeight : 0);

  const chartTitleFit = chart?.title
    ? fitText(chart.title, {
        maxWidth: innerWidth,
        fontSize: FS.chartTitle,
        family: headingFamily,
        maxLines: 1,
        lineHeight: LH.tight,
        minFontSize: 10,
      })
    : null;

  const chartCaptionFit = chart?.caption
    ? fitText(chart.caption, {
        maxWidth: innerWidth,
        fontSize: FS.chartLabel,
        family: bodyFamily,
        maxLines: 2,
        lineHeight: LH.tight,
        minFontSize: 8,
      })
    : null;

  let bodyLines = 8;
  let bulletLines = 2;
  let withMetricDelta = true;
  let showMetrics = metrics.length > 0;
  let showChart = chart !== null;
  let plotHeight = CHART_PLOT;

  const measure = (): Attempt => {
    const bulletsFit = bullets.map((text) =>
      fitText(text, {
        maxWidth: Math.max(16, width - BULLET_INDENT),
        fontSize: FS.body,
        family: bodyFamily,
        maxLines: bulletLines,
        lineHeight: LH.body,
        minFontSize: 12,
      }),
    );

    const bulletsHeight =
      bulletsFit.length === 0
        ? 0
        : bulletsFit.reduce((total, fit) => total + fit.height, 0) +
          BULLET_GAP * (bulletsFit.length - 1);

    const bodyFit = body
      ? fitText(body, {
          maxWidth: width,
          fontSize: FS.body,
          family: bodyFamily,
          maxLines: bodyLines,
          lineHeight: LH.body,
          minFontSize: 12,
        })
      : null;

    const bodyHeight = bodyFit ? bodyFit.height : 0;

    const metricsHeight = showMetrics
      ? METRICS_MT +
        Math.max(
          ...metrics.map((metric) =>
            measureMetric(metric, cellWidth, bodyFamily, withMetricDelta).height,
          ),
        )
      : 0;

    const naturalPlot = Math.max(plotHeight, CHART_PLOT_MIN);
    const chartHeight = naturalPlot + chartChromeHeight;

    const children = [
      bulletsFit.length > 0,
      bodyFit !== null,
      showMetrics,
      showChart,
    ].filter(Boolean).length;

    return {
      bulletsFit,
      bulletsHeight,
      bodyFit,
      bodyHeight,
      metricsHeight,
      chartPlotHeight: naturalPlot,
      chartChromeHeight,
      chartHeight,
      total:
        bulletsHeight +
        bodyHeight +
        metricsHeight +
        (showChart ? chartHeight + CHART_MT : 0) +
        Math.max(0, children - 1) * COLUMN_GAP,
    };
  };

  let attempt = measure();

  for (let step = 0; step < 60 && attempt.total > height; step += 1) {
    if (bodyLines > 1) {
      bodyLines -= 1;
    } else if (bulletLines > 1) {
      bulletLines -= 1;
    } else if (plotHeight > CHART_PLOT_MIN) {
      plotHeight = Math.max(CHART_PLOT_MIN, plotHeight - 2 * CW);
    } else if (withMetricDelta) {
      withMetricDelta = false;
    } else if (showMetrics) {
      showMetrics = false;
    } else if (showChart) {
      showChart = false;
    } else {
      break;
    }

    attempt = measure();
  }

  // Spend any leftover room on making the chart plot taller, up to its natural
  // size. This runs after the ladder so the two cannot fight each other.
  if (showChart) {
    const otherChildren = [
      attempt.bulletsFit.length > 0,
      attempt.bodyFit !== null,
      showMetrics,
    ].filter(Boolean).length;
    const usedWithoutChart =
      attempt.bulletsHeight +
      attempt.bodyHeight +
      attempt.metricsHeight +
      Math.max(0, otherChildren) * COLUMN_GAP;

    const room = height - usedWithoutChart - CHART_MT;
    const targetHeight = Math.min(room, attempt.chartHeight);
    attempt.chartPlotHeight = Math.max(
      CHART_PLOT_MIN,
      Math.min(CHART_PLOT, targetHeight - attempt.chartChromeHeight),
    );
  }

  // ---- place --------------------------------------------------------------
  const parts: Array<{ kind: "bullets" | "body" | "metrics" | "chart"; height: number }> =
    [];

  if (attempt.bulletsFit.length > 0) {
    parts.push({ kind: "bullets", height: attempt.bulletsHeight });
  }
  if (attempt.bodyFit) {
    parts.push({ kind: "body", height: attempt.bodyHeight });
  }
  if (showMetrics) {
    parts.push({ kind: "metrics", height: attempt.metricsHeight });
  }
  if (showChart) {
    parts.push({ kind: "chart", height: attempt.chartPlotHeight + attempt.chartChromeHeight + CHART_MT });
  }

  const total =
    parts.reduce((sum, part) => sum + part.height, 0) +
    Math.max(0, parts.length - 1) * COLUMN_GAP;

  let cursor = Math.max(0, (height - total) / 2);

  const placedBullets: ExportBullet[] = [];
  let placedBody: FlowOutput["body"] = null;
  const placedMetrics: ExportMetricBox[] = [];
  let placedChart: ExportChart | null = null;

  for (const part of parts) {
    const top = cursor;
    cursor += part.height + COLUMN_GAP;

    if (part.kind === "bullets") {
      attempt.bulletsFit.forEach((fit, index) => {
        const y = top + index * (fit.height + BULLET_GAP);
        const source = bullets[index] ?? "";

        placedBullets.push({
          text: fit.lines.join(" ").trim() || source,
          fit,
          rect: { x: 0, y, width, height: fit.height },
          dot: {
            x: BULLET_DOT / 2,
            y: y + BULLET_DOT_INSET,
            size: BULLET_DOT,
          },
        });
      });
      continue;
    }

    if (part.kind === "body" && attempt.bodyFit && body) {
      placedBody = {
        text: body,
        fit: attempt.bodyFit,
        rect: { x: 0, y: top, width, height: attempt.bodyHeight },
      };
      continue;
    }

    if (part.kind === "metrics") {
      const rowTop = top + METRICS_MT;
      const rowHeight = attempt.metricsHeight - METRICS_MT;

      metrics.slice(0, MAX_METRICS).forEach((metric, index) => {
        const measured = measureMetric(metric, cellWidth, bodyFamily, withMetricDelta);
        const valueTop = rowTop + METRIC_PAD;
        const labelTop = valueTop + measured.valueFit.height + METRIC_INNER_GAP;

        placedMetrics.push({
          rect: {
            x: index * (cellWidth + METRICS_GAP),
            y: rowTop,
            width: cellWidth,
            height: rowHeight,
          },
          valueText: measured.valueText,
          valueFit: measured.valueFit,
          valueTop,
          labelText: measured.labelText,
          labelFit: measured.labelFit,
          labelTop,
          deltaFit: measured.deltaFit,
          deltaTop: labelTop + measured.labelFit.height + METRIC_INNER_GAP,
          placeholder: metric.placeholder,
        });
      });
      continue;
    }

    if (part.kind === "chart" && chart) {
      const panelTop = top + CHART_MT;
      const panelHeight = attempt.chartPlotHeight + attempt.chartChromeHeight;
      const plotTop = panelTop + CHART_PAD + (chartTitleFit ? chartTitleFit.height + CHART_GAP : 0);

      placedChart = {
        chartType: chart.chartType,
        title: chart.title,
        caption: chart.caption,
        points: chart.points,
        maxValue: chart.maxValue,
        panel: { x: 0, y: panelTop, width, height: panelHeight },
        plot: {
          x: CHART_PAD,
          y: plotTop,
          width: width - 2 * CHART_PAD,
          height: attempt.chartPlotHeight,
        },
        titleFit: chartTitleFit,
        captionFit: chartCaptionFit,
        labelsTop: plotTop + attempt.chartPlotHeight + CHART_GAP,
        labelsHeight: FS.chartLabel * LH.tight,
      };
    }
  }

  return {
    bullets: placedBullets,
    body: placedBody,
    metrics: placedMetrics,
    chart: placedChart,
  };
}

/** Resolve one render slide into a fully measured export slide. */
export function resolveExportSlide(
  input: RenderSlide,
  theme: SlideTheme,
): ExportSlide {
  const slide = normalizeSlide(input);

  const headingFamily = fontFamilyOf(theme.headingFont);
  const bodyFamily = fontFamilyOf(theme.bodyFont);

  const metricBlocks = slide.blocks.filter(
    (block): block is Extract<typeof block, { type: "metric" }> =>
      block.type === "metric",
  );

  const chartBlock = slide.blocks.find(
    (block): block is Extract<typeof block, { type: "chart" }> =>
      block.type === "chart",
  );

  const bullets = slide.blocks
    .filter(
      (block): block is Extract<typeof block, { type: "bullets" }> =>
        block.type === "bullets",
    )
    .flatMap((block) => block.items)
    .slice(0, MAX_BULLETS);

  const metrics: ExportMetric[] = metricBlocks.slice(0, MAX_METRICS).map(
    (block) => ({
      label: block.label,
      value: block.value,
      delta: block.delta ?? null,
      placeholder: Boolean(block.placeholder),
    }),
  );

  const chartInput: ChartInput | null = chartBlock
    ? {
        chartType: chartBlock.chartType,
        title: chartBlock.title ?? null,
        caption: chartBlock.caption ?? null,
        points: chartBlock.series.map((point, index) => ({
          label: point.label,
          value: point.value,
          display: formatChartValue(point.value),
          color:
            SLIDE_CHART_COLORS[index % SLIDE_CHART_COLORS.length] as string,
        })),
        maxValue: Math.max(
          ...chartBlock.series.map((point) => point.value),
          0.0001,
        ),
      }
    : null;

  // ---- vertical stack -----------------------------------------------------
  let y = PAD;

  const labelText = slide.label?.trim() ?? "";
  let label: ExportSlide["label"] = null;

  if (labelText) {
    const fit = fitText(labelText, {
      maxWidth: CONTENT_W - 2 * LABEL_CHIP_PAD_X,
      fontSize: FS.label,
      family: bodyFamily,
      maxLines: 1,
      lineHeight: LH.tight,
      minFontSize: 8,
    });

    label = {
      text: labelText,
      fit,
      rect: {
        x: PAD,
        y,
        width: Math.min(CONTENT_W, fit.width + 2 * LABEL_CHIP_PAD_X),
        height: FS.label * LH.tight + LABEL_CHIP_PAD_Y * 2,
      },
    };

    y += label.rect.height + STACK_GAP;
  }

  const titleFit = fitText(slide.title, {
    maxWidth: CONTENT_W,
    fontSize: FS.title,
    family: headingFamily,
    maxLines: MAX_TITLE_LINES,
    lineHeight: LH.title,
    minFontSize: 20,
  });

  const title = {
    text: slide.title,
    fit: titleFit,
    rect: { x: PAD, y, width: CONTENT_W, height: titleFit.height },
  };

  y += titleFit.height;

  let subtitle: ExportSlide["subtitle"] = null;

  if (slide.subtitle?.trim()) {
    y += HEADER_GAP;
    const fit = fitText(slide.subtitle, {
      maxWidth: CONTENT_W,
      fontSize: FS.subtitle,
      family: bodyFamily,
      maxLines: MAX_SUBTITLE_LINES,
      lineHeight: LH.subtitle,
      minFontSize: 13,
    });

    subtitle = {
      text: slide.subtitle.trim(),
      fit,
      rect: { x: PAD, y, width: CONTENT_W, height: fit.height },
    };

    y += fit.height;
  }

  const captionText = slide.caption?.trim() ?? "";
  let caption: ExportSlide["caption"] = null;
  let bodyBottom = SLIDE_HEIGHT - PAD;

  if (captionText) {
    const fit = fitText(captionText, {
      maxWidth: CONTENT_W,
      fontSize: FS.caption,
      family: bodyFamily,
      maxLines: 3,
      lineHeight: LH.caption,
      minFontSize: 9,
    });

    const captionTop = SLIDE_HEIGHT - PAD - fit.height;
    caption = {
      text: captionText,
      fit,
      rect: { x: PAD, y: captionTop, width: CONTENT_W, height: fit.height },
    };

    bodyBottom = captionTop - STACK_GAP;
  }

  const bodyTop = y + STACK_GAP;
  const bodyHeight = Math.max(0, bodyBottom - bodyTop);

  const hasImage = Boolean(slide.imageUrl);
  const isTitleLayout = slide.layout === "TITLE" || slide.layout === "CLOSING";
  const split = hasImage && !isTitleLayout;

  const columnWidth = split ? (CONTENT_W - SPLIT_GAP) / 2 : CONTENT_W;

  const flow = flowColumn({
    width: columnWidth,
    height: bodyHeight,
    bullets,
    body: slide.content?.trim() ? slide.content.trim() : null,
    metrics,
    chart: chartInput,
    headingFamily,
    bodyFamily,
  });

  // Re-base column-relative boxes onto the slide.
  const baseX = PAD;
  const baseY = bodyTop;

  const rebase = (rect: ExportRect): ExportRect => ({
    ...rect,
    x: rect.x + baseX,
    y: rect.y + baseY,
  });

  return {
    id: slide.id,
    order: slide.order,
    label,
    title,
    subtitle,
    bullets: flow.bullets.map((bullet) => ({
      ...bullet,
      rect: rebase(bullet.rect),
      dot: {
        x: bullet.dot.x + baseX,
        y: bullet.dot.y + baseY,
        size: bullet.dot.size,
      },
    })),
    body: flow.body
      ? { ...flow.body, rect: rebase(flow.body.rect) }
      : null,
    metrics: flow.metrics.map((metric) => ({
      ...metric,
      rect: rebase(metric.rect),
      valueTop: metric.valueTop + baseY,
      labelTop: metric.labelTop + baseY,
      deltaTop: metric.deltaTop + baseY,
    })),
    chart: flow.chart
      ? {
          ...flow.chart,
          panel: rebase(flow.chart.panel),
          plot: rebase(flow.chart.plot),
          labelsTop: flow.chart.labelsTop + baseY,
        }
      : null,
    caption,
    image:
      split && slide.imageUrl
        ? {
            url: slide.imageUrl,
            rect: {
              x: PAD + columnWidth + SPLIT_GAP,
              y: bodyTop,
              width: columnWidth,
              height: bodyHeight,
            },
          }
        : null,
    orderBadge: {
      text: String(slide.order),
      fit: fitText(String(slide.order), {
        maxWidth: 3 * CW,
        fontSize: FS.order,
        family: bodyFamily,
        maxLines: 1,
        lineHeight: LH.tight,
        minFontSize: 7,
      }),
      rect: {
        x: SLIDE_WIDTH - PAD - 3 * CW,
        y: SLIDE_HEIGHT - PAD - FS.order * LH.tight,
        width: 3 * CW,
        height: FS.order * LH.tight,
      },
    },
    speakerNotes: slide.speakerNotes?.trim() ? slide.speakerNotes : null,
  };
}

/** Resolve a whole deck in one pass. */
export function resolveExportDeck(
  input: { title: string | null; startupName: string | null; slides: RenderSlide[] },
  theme: SlideTheme,
): ExportDeck {
  return {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    theme,
    headingFamily: fontFamilyOf(theme.headingFont),
    bodyFamily: fontFamilyOf(theme.bodyFont),
    headingFontName: theme.headingFont || "Inter",
    bodyFontName: theme.bodyFont || "Inter",
    slides: input.slides.map((slide) => resolveExportSlide(slide, theme)),
  };
}