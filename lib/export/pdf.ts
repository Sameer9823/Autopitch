/**
 * PDF export.
 *
 * Draws every slide as real vector content with pdf-lib: real text runs, real
 * rectangles, real polylines, real embedded images. Nothing here is a
 * screenshot and nothing is rasterised, so the PDF is small, sharp at any zoom,
 * searchable, and looks the same on a projector as it does in the editor.
 *
 * Geometry comes entirely from `lib/export/layout.ts`, so the PDF and the PPTX
 * put the same words in the same boxes. This file only decides *how to paint*.
 *
 * Fonts: pdf-lib can embed custom fonts, but only together with
 * `@pdf-lib/fontkit`, which this project deliberately does not depend on. The 14
 * standard PDF fonts are used instead, chosen from the theme's font families so
 * a brand that asks for a serif deck still gets serif type.
 */

import {
  PDFDocument,
  StandardFonts,
  clip,
  closePath,
  endPath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingRgbColor,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

import { ExportError, GENERIC_EXPORT_ERROR } from "./errors";
import { loadExportImages } from "./fetch-image";
import {
  EXPORT_GEOMETRY,
  parseHexColor,
  type ExportBullet,
  type ExportChart,
  type ExportDeck,
  type ExportMetricBox,
  type ExportRect,
  type ExportSlide,
} from "./layout";
import { fitText, type FittedText, type FontFamily } from "./slide-measure";

const { font: FS, lineHeight: LH, chartPad } = EXPORT_GEOMETRY;

/** Approximate ascent of the PDF standard fonts, as a fraction of the size. */
const ASCENT = 0.75;

/** Half a degree per segment is smooth enough for a chart-sized circle. */
const WEDGE_SEGMENT = Math.PI / 10;

/** Point diameters, in canvas units. */
const SERIES_DOT = 8;
const BULLET_DOT_MIN = 2;

type Fonts = {
  sans: PDFFont;
  sansBold: PDFFont;
  serif: PDFFont;
  serifBold: PDFFont;
};

type Paint = {
  page: PDFPage;
  height: number;
  fonts: Fonts;
  deck: ExportDeck;
};

async function embedFonts(document: PDFDocument): Promise<Fonts> {
  const [sans, sansBold, serif, serifBold] = await Promise.all([
    document.embedFont(StandardFonts.Helvetica),
    document.embedFont(StandardFonts.HelveticaBold),
    document.embedFont(StandardFonts.TimesRoman),
    document.embedFont(StandardFonts.TimesRomanBold),
  ]);

  return { sans, sansBold, serif, serifBold };
}

function fontFor(fonts: Fonts, family: FontFamily, bold: boolean): PDFFont {
  if (family === "serif") {
    return bold ? fonts.serifBold : fonts.serif;
  }

  return bold ? fonts.sansBold : fonts.sans;
}

/** Canvas Y to the PDF Y of a text baseline. */
function baselineY(paint: Paint, top: number, fontSize: number): number {
  return paint.height - top - fontSize * ASCENT;
}

/** Canvas Y to the PDF Y of a box's bottom edge. */
function bottomY(paint: Paint, top: number, height: number): number {
  return paint.height - top - height;
}

function triplet(color: string): [number, number, number] {
  const { red, green, blue } = parseHexColor(color);
  return [red, green, blue];
}

/**
 * Draw a fitted text block, line by line.
 *
 * Lines are drawn individually rather than through pdf-lib's `\n` handling so
 * the baseline maths is explicit and matches the measurement the layout module
 * already performed. An empty block paints nothing.
 */
function drawFittedText(
  paint: Paint,
  fit: FittedText,
  origin: { x: number; y: number },
  options: {
    family: FontFamily;
    color: string;
    bold?: boolean;
    align?: "left" | "right";
  },
): void {
  const { family, color, bold = false, align = "left" } = options;

  if (fit.lines.length === 0) {
    return;
  }

  const font = fontFor(paint.fonts, family, bold);
  const [red, green, blue] = triplet(color);
  // Right alignment shifts by the widest line, which `fit.width` already holds.
  const originX = align === "right" ? origin.x - fit.width : origin.x;

  fit.lines.forEach((line, index) => {
    if (line.length === 0) {
      return;
    }

    paint.page.drawText(line, {
      x: originX,
      y: baselineY(paint, origin.y + index * fit.lineHeight, fit.fontSize),
      size: fit.fontSize,
      font,
      color: rgb(red, green, blue),
    });
  });
}

function drawPanel(
  paint: Paint,
  rect: ExportRect,
  fillColor: string,
  borderColor: string,
  dashed = false,
): void {
  const [fr, fg, fb] = triplet(fillColor);
  const [br, bg, bb] = triplet(borderColor);
  const bottom = bottomY(paint, rect.y, rect.height);

  paint.page.drawRectangle({
    x: rect.x,
    y: bottom,
    width: rect.width,
    height: rect.height,
    color: rgb(fr, fg, fb),
    borderColor: rgb(br, bg, bb),
    borderWidth: 1,
    ...(dashed ? { borderDashArray: [6, 4] as number[] } : {}),
  });
}

function fillPolygon(
  paint: Paint,
  points: ReadonlyArray<{ x: number; y: number }>,
  color: string,
): void {
  const first = points[0];

  if (!first) {
    return;
  }

  const [red, green, blue] = triplet(color);

  paint.page.pushOperators(
    pushGraphicsState(),
    setFillingRgbColor(red, green, blue),
    moveTo(first.x, paint.height - first.y),
  );

  for (const point of points.slice(1)) {
    paint.page.pushOperators(lineTo(point.x, paint.height - point.y));
  }

  paint.page.pushOperators(closePath(), fill(), popGraphicsState());
}

function strokePolyline(
  paint: Paint,
  points: ReadonlyArray<{ x: number; y: number }>,
  color: string,
  thickness: number,
): void {
  const [red, green, blue] = triplet(color);

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];

    if (!from || !to) {
      continue;
    }

    paint.page.drawLine({
      start: { x: from.x, y: paint.height - from.y },
      end: { x: to.x, y: paint.height - to.y },
      thickness,
      color: rgb(red, green, blue),
    });
  }
}

function drawDot(
  paint: Paint,
  center: { x: number; y: number },
  diameter: number,
  color: string,
): void {
  const size = Math.max(BULLET_DOT_MIN, diameter);
  const [red, green, blue] = triplet(color);

  paint.page.drawEllipse({
    x: center.x,
    y: paint.height - center.y,
    xScale: size / 2,
    yScale: size / 2,
    color: rgb(red, green, blue),
  });
}

/** A pie/donut segment approximated with a polygon fan. */
function drawWedge(
  paint: Paint,
  center: { x: number; y: number },
  radius: number,
  startAngle: number,
  endAngle: number,
  color: string,
): void {
  const steps = Math.max(
    2,
    Math.ceil(Math.abs(endAngle - startAngle) / WEDGE_SEGMENT),
  );
  const [red, green, blue] = triplet(color);

  paint.page.pushOperators(
    pushGraphicsState(),
    setFillingRgbColor(red, green, blue),
    moveTo(center.x, paint.height - center.y),
  );

  for (let step = 0; step <= steps; step += 1) {
    const angle = startAngle + ((endAngle - startAngle) * step) / steps;
    paint.page.pushOperators(
      lineTo(
        center.x + radius * Math.cos(angle),
        paint.height - center.y + radius * Math.sin(angle),
      ),
    );
  }

  paint.page.pushOperators(closePath(), fill(), popGraphicsState());
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/** Fit one axis/legend label into `slotWidth`. */
function labelFit(
  paint: Paint,
  text: string,
  slotWidth: number,
  fontSize: number,
) {
  return fitText(text, {
    maxWidth: Math.max(8, slotWidth),
    fontSize,
    family: paint.deck.bodyFamily,
    maxLines: 1,
    lineHeight: LH.tight,
    minFontSize: 7,
  });
}

function drawChartLabels(paint: Paint, chart: ExportChart): void {
  const slot = chart.plot.width / Math.max(1, chart.points.length);

  chart.points.forEach((point, index) => {
    drawFittedText(
      paint,
      labelFit(paint, point.label, slot, FS.chartLabel),
      { x: chart.plot.x + index * slot, y: chart.labelsTop },
      { family: paint.deck.bodyFamily, color: paint.deck.theme.muted },
    );
  });
}

function drawBarChart(paint: Paint, chart: ExportChart): void {
  const { plot } = chart;
  const slot = plot.width / Math.max(1, chart.points.length);
  const gap = Math.min(slot * 0.28, EXPORT_GEOMETRY.unit * 1.4);
  const barWidth = Math.max(2, slot - gap);
  const valueHeight = FS.chartValue * LH.tight;

  chart.points.forEach((point, index) => {
    const ratio = Math.max(point.value / chart.maxValue, 0.02);
    const barHeight = Math.max(2, plot.height * ratio);
    const x = plot.x + index * slot + gap / 2;
    const top = plot.y + plot.height - barHeight;

    paint.page.drawRectangle({
      x,
      y: bottomY(paint, top, barHeight),
      width: barWidth,
      height: barHeight,
      color: rgb(...triplet(point.color)),
    });

    drawFittedText(
      paint,
      labelFit(paint, point.display, slot, FS.chartValue),
      { x, y: top - valueHeight - 2 },
      { family: paint.deck.bodyFamily, color: paint.deck.theme.muted },
    );
  });

  drawChartLabels(paint, chart);
}

function drawSeriesChart(paint: Paint, chart: ExportChart, filled: boolean): void {
  const { plot } = chart;
  const count = chart.points.length;
  const step = count > 1 ? plot.width / (count - 1) : 0;
  const color = chart.points[0]?.color ?? paint.deck.theme.accent;
  const valueOffset = FS.chartValue * LH.tight + 4;

  const plotted = chart.points.map((point, index) => ({
    x: plot.x + (count > 1 ? index * step : plot.width / 2),
    y:
      plot.y +
      plot.height -
      Math.max(point.value / chart.maxValue, 0) * plot.height,
  }));

  if (filled && plotted.length > 1) {
    fillPolygon(
      paint,
      [
        { x: plot.x, y: plot.y + plot.height },
        ...plotted,
        { x: plot.x + plot.width, y: plot.y + plot.height },
      ],
      color,
    );
  }

  strokePolyline(paint, plotted, color, 2.5);

  for (const point of plotted) {
    drawDot(paint, point, SERIES_DOT, color);
  }

  const slot = Math.max(48, plot.width / Math.max(1, count));

  chart.points.forEach((point, index) => {
    const position = plotted[index];

    if (!position) {
      return;
    }

    drawFittedText(
      paint,
      labelFit(paint, point.display, slot, FS.chartValue),
      { x: position.x - slot / 2, y: position.y - valueOffset },
      { family: paint.deck.bodyFamily, color: paint.deck.theme.muted },
    );
  });

  drawChartLabels(paint, chart);
}

function drawPieChart(paint: Paint, chart: ExportChart): void {
  const { plot } = chart;
  const total = chart.points.reduce(
    (sum, point) => sum + Math.abs(point.value),
    0,
  );

  const legendWidth = Math.min(plot.width * 0.45, 360);
  const pieWidth = plot.width - legendWidth - EXPORT_GEOMETRY.unit * 2;
  const diameter = Math.max(24, Math.min(pieWidth, plot.height));
  const radius = diameter / 2;
  const center = { x: plot.x + pieWidth / 2, y: plot.y + plot.height / 2 };

  let angle = -Math.PI / 2;

  for (const point of chart.points) {
    const sweep =
      total > 0 ? (Math.abs(point.value) / total) * Math.PI * 2 : 0;

    drawWedge(paint, center, radius, angle, angle + sweep, point.color);
    angle += sweep;
  }

  if (chart.chartType === "donut") {
    paint.page.drawEllipse({
      x: center.x,
      y: paint.height - center.y,
      xScale: radius * 0.55,
      yScale: radius * 0.55,
      color: rgb(...triplet(paint.deck.theme.surface)),
    });
  }

  // Legend down the right of the pie.
  const visible = chart.points.slice(0, 6);
  const rowHeight = Math.max(
    14,
    Math.min(
      (FS.chartLabel + 2) * LH.tight,
      plot.height / Math.max(1, visible.length),
    ),
  );
  const legendX = plot.x + pieWidth + EXPORT_GEOMETRY.unit * 2;
  let legendY =
    plot.y + Math.max(0, (plot.height - rowHeight * visible.length) / 2);

  for (const point of visible) {
    paint.page.drawRectangle({
      x: legendX,
      y: bottomY(paint, legendY + 2, rowHeight - 4),
      width: rowHeight - 4,
      height: rowHeight - 4,
      color: rgb(...triplet(point.color)),
    });

    drawFittedText(
      paint,
      fitText(`${point.label}  ${point.display}`, {
        maxWidth: Math.max(16, legendWidth - rowHeight - 6),
        fontSize: FS.chartLabel,
        family: paint.deck.bodyFamily,
        maxLines: 1,
        lineHeight: LH.tight,
        minFontSize: 7,
      }),
      { x: legendX + rowHeight + 6, y: legendY },
      { family: paint.deck.bodyFamily, color: paint.deck.theme.foreground },
    );

    legendY += rowHeight;
  }
}

function drawChart(paint: Paint, chart: ExportChart): void {
  drawPanel(
    paint,
    chart.panel,
    paint.deck.theme.surface,
    paint.deck.theme.border,
  );

  if (chart.titleFit) {
    drawFittedText(
      paint,
      chart.titleFit,
      { x: chart.panel.x + chartPad, y: chart.panel.y + chartPad },
      {
        family: paint.deck.headingFamily,
        bold: true,
        color: paint.deck.theme.foreground,
      },
    );
  }

  if (chart.chartType === "bar") {
    drawBarChart(paint, chart);
  } else if (chart.chartType === "line") {
    drawSeriesChart(paint, chart, false);
  } else if (chart.chartType === "area") {
    drawSeriesChart(paint, chart, true);
  } else {
    drawPieChart(paint, chart);
  }

  if (chart.captionFit) {
    drawFittedText(
      paint,
      chart.captionFit,
      {
        x: chart.panel.x + chartPad,
        y:
          chart.panel.y +
          chart.panel.height -
          chartPad -
          chart.captionFit.height,
      },
      { family: paint.deck.bodyFamily, color: paint.deck.theme.muted },
    );
  }
}

// ---------------------------------------------------------------------------
// Slide
// ---------------------------------------------------------------------------

function drawBullet(paint: Paint, bullet: ExportBullet): void {
  drawDot(paint, bullet.dot, bullet.dot.size, paint.deck.theme.accent);

  drawFittedText(
    paint,
    bullet.fit,
    { x: bullet.rect.x + EXPORT_GEOMETRY.bulletIndent, y: bullet.rect.y },
    { family: paint.deck.bodyFamily, color: paint.deck.theme.foreground },
  );
}

function drawMetricCard(paint: Paint, metric: ExportMetricBox): void {
  drawPanel(
    paint,
    metric.rect,
    paint.deck.theme.surface,
    paint.deck.theme.border,
  );

  const innerX = metric.rect.x + EXPORT_GEOMETRY.metricPad;

  drawFittedText(
    paint,
    metric.valueFit,
    { x: innerX, y: metric.valueTop },
    {
      family: paint.deck.headingFamily,
      bold: true,
      color: metric.placeholder
        ? paint.deck.theme.muted
        : paint.deck.theme.accent,
    },
  );

  drawFittedText(
    paint,
    metric.labelFit,
    { x: innerX, y: metric.labelTop },
    { family: paint.deck.bodyFamily, color: paint.deck.theme.muted },
  );

  if (metric.deltaFit) {
    drawFittedText(
      paint,
      metric.deltaFit,
      { x: innerX, y: metric.deltaTop },
      { family: paint.deck.bodyFamily, color: paint.deck.theme.muted },
    );
  }
}

/**
 * Cover-fit an embedded image into its box.
 *
 * pdf-lib cannot crop, so the drawing is clipped to the target rectangle with
 * raw path operators first. Cover fit (rather than contain) is what the CSS
 * `object-cover` in the canvas does, so this is what keeps the PDF honest about
 * how the slide actually looked.
 */
function drawCoverImage(
  paint: Paint,
  image: PDFImage,
  rect: ExportRect,
): void {
  if (image.width <= 0 || image.height <= 0) {
    return;
  }

  const scale = Math.max(rect.width / image.width, rect.height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = rect.x + (rect.width - drawWidth) / 2;
  const drawY = rect.y + (rect.height - drawHeight) / 2;
  const bottom = bottomY(paint, rect.y, rect.height);

  paint.page.pushOperators(
    pushGraphicsState(),
    moveTo(rect.x, bottom),
    lineTo(rect.x + rect.width, bottom),
    lineTo(rect.x + rect.width, bottom + rect.height),
    lineTo(rect.x, bottom + rect.height),
    closePath(),
    clip(),
    endPath(),
  );

  paint.page.drawImage(image, {
    x: drawX,
    y: paint.height - drawY - drawHeight,
    width: drawWidth,
    height: drawHeight,
  });

  paint.page.pushOperators(popGraphicsState());
}

/** Neutral stand-in for a slide image that could not be fetched. */
function drawImagePlaceholder(paint: Paint, rect: ExportRect): void {
  drawPanel(
    paint,
    rect,
    paint.deck.theme.surface,
    paint.deck.theme.border,
    true,
  );

  drawFittedText(
    paint,
    fitText("Visual unavailable in this export", {
      maxWidth: Math.max(16, rect.width - 24),
      fontSize: 13,
      family: paint.deck.bodyFamily,
      maxLines: 1,
      lineHeight: LH.tight,
      minFontSize: 9,
    }),
    { x: rect.x + 12, y: rect.y + rect.height / 2 - 8 },
    { family: paint.deck.bodyFamily, color: paint.deck.theme.muted },
  );
}

function drawSlide(paint: Paint, slide: ExportSlide, image: PDFImage | null): void {
  const theme = paint.deck.theme;

  paint.page.drawRectangle({
    x: 0,
    y: 0,
    width: paint.deck.width,
    height: paint.deck.height,
    color: rgb(...triplet(theme.background)),
  });

  if (slide.label) {
    paint.page.drawRectangle({
      x: slide.label.rect.x,
      y: bottomY(paint, slide.label.rect.y, slide.label.rect.height),
      width: slide.label.rect.width,
      height: slide.label.rect.height,
      color: rgb(...triplet(theme.accent)),
      opacity: 0.12,
    });

    drawFittedText(
      paint,
      slide.label.fit,
      {
        x: slide.label.rect.x + EXPORT_GEOMETRY.labelChipPadX,
        y: slide.label.rect.y + EXPORT_GEOMETRY.labelChipPadY,
      },
      { family: paint.deck.bodyFamily, color: theme.accent },
    );
  }

  drawFittedText(
    paint,
    slide.title.fit,
    { x: slide.title.rect.x, y: slide.title.rect.y },
    {
      family: paint.deck.headingFamily,
      bold: true,
      color: theme.foreground,
    },
  );

  if (slide.subtitle) {
    drawFittedText(
      paint,
      slide.subtitle.fit,
      { x: slide.subtitle.rect.x, y: slide.subtitle.rect.y },
      { family: paint.deck.bodyFamily, color: theme.muted },
    );
  }

  for (const bullet of slide.bullets) {
    drawBullet(paint, bullet);
  }

  if (slide.body) {
    drawFittedText(
      paint,
      slide.body.fit,
      { x: slide.body.rect.x, y: slide.body.rect.y },
      { family: paint.deck.bodyFamily, color: theme.muted },
    );
  }

  for (const metric of slide.metrics) {
    drawMetricCard(paint, metric);
  }

  if (slide.chart) {
    drawChart(paint, slide.chart);
  }

  if (slide.caption) {
    drawFittedText(
      paint,
      slide.caption.fit,
      { x: slide.caption.rect.x, y: slide.caption.rect.y },
      { family: paint.deck.bodyFamily, color: theme.muted },
    );
  }

  if (slide.image) {
    if (image) {
      drawCoverImage(paint, image, slide.image.rect);
    } else {
      drawImagePlaceholder(paint, slide.image.rect);
    }
  }

  drawFittedText(
    paint,
    slide.orderBadge.fit,
    { x: slide.orderBadge.rect.x, y: slide.orderBadge.rect.y },
    {
      family: paint.deck.bodyFamily,
      color: theme.muted,
      align: "right",
    },
  );
}

export type BuildPdfOptions = {
  /** Written into the document's metadata title. */
  title?: string | null;
};

/**
 * Render a measured deck to PDF bytes.
 *
 * Image embedding failures degrade to placeholders; only a genuine pdf-lib
 * failure rejects, and it rejects with a safe `ExportError`.
 */
export async function buildDeckPdf(
  deck: ExportDeck,
  options: BuildPdfOptions = {},
): Promise<Uint8Array> {
  const fetched = await loadExportImages(deck.slides);

  try {
    const document = await PDFDocument.create();
    document.setTitle(options.title?.trim() || "Pitch deck");
    document.setAuthor("Raisevia AI");
    document.setCreator("Raisevia AI");
    document.setProducer("Raisevia AI");

    const fonts = await embedFonts(document);

    // Embed every image up front: a corrupt file then costs one slide's
    // placeholder rather than the whole document.
    const embedded = new Map<string, PDFImage | null>();

    await Promise.all(
      deck.slides.map(async (slide) => {
        if (!slide.image) {
          return;
        }

        const image = fetched.get(slide.id) ?? null;

        if (!image) {
          embedded.set(slide.id, null);
          return;
        }

        try {
          embedded.set(
            slide.id,
            image.format === "png"
              ? await document.embedPng(image.bytes)
              : await document.embedJpg(image.bytes),
          );
        } catch (error: unknown) {
          console.warn("[export] could not embed slide image", slide.id, error);
          embedded.set(slide.id, null);
        }
      }),
    );

    for (const slide of deck.slides) {
      const page = document.addPage([deck.width, deck.height]);

      drawSlide(
        { page, height: deck.height, fonts, deck },
        slide,
        embedded.get(slide.id) ?? null,
      );
    }

    const bytes = await document.save();

    return new Uint8Array(bytes);
  } catch (error: unknown) {
    console.error("[export] pdf generation failed", error);

    throw new ExportError(500, GENERIC_EXPORT_ERROR, "pdf_failed", {
      cause: error,
    });
  }
}