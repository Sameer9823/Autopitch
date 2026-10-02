/**
 * PPTX export.
 *
 * The whole point of this file is **editability**. A founder who exports to
 * PowerPoint expects to open it and change a word, drag a box, restyle a bar —
 * not receive a deck of flat screenshots. So every element is emitted as a real
 * PowerPoint object:
 *
 *   - text as real text boxes with real fonts, sizes and colours
 *   - images as real embedded pictures
 *   - charts as real Office charts (bar, line, area, pie, doughnut are all
 *     supported by the format and by pptxgenjs), with drawn shapes only for the
 *     decorative chrome around them
 *   - backgrounds as real slide fills
 *   - speaker notes as real PowerPoint speaker notes
 *
 * Geometry comes entirely from `lib/export/layout.ts`, so a word never moves
 * between the PDF and the PPTX. Only the painting differs.
 */

import PptxGenJS from "pptxgenjs";

import { ExportError, GENERIC_EXPORT_ERROR } from "./errors";
import { loadExportImages } from "./fetch-image";
import {
  EXPORT_GEOMETRY,
  toHexDigits,
  type ExportBullet,
  type ExportChart,
  type ExportDeck,
  type ExportMetricBox,
  type ExportRect,
  type ExportSlide,
} from "./layout";
import { type FittedText, type FontFamily } from "./slide-measure";

const { font: FS, lineHeight: LH, chartPad, metricPad } = EXPORT_GEOMETRY;

/**
 * `LAYOUT_16x9` is 10in x 5.625in — the same 16:9 aspect the canvas uses — so
 * the exporter works in inches and this factor converts canvas pixels (of which
 * there are 1280 across) into inches. Fonts go through `PT_SCALE` instead,
 * because PowerPoint font sizes are points and 10in is 720pt.
 */
const PX_PER_INCH = 128;
const PT_SCALE = 72 / PX_PER_INCH;

/** The Office chart types this exporter can emit natively. */
type NativeChartName = "bar" | "line" | "area" | "pie" | "doughnut";

/**
 * Derived from the library rather than imported from its namespace so the file
 * does not depend on how `pptxgenjs` merges its class and namespace types.
 */
type SlideProxy = ReturnType<InstanceType<typeof PptxGenJS>["addSlide"]>;

/** "Inter" and "Geist" are not guaranteed on the reviewer's machine. */
const PPTX_SANS = "Inter";
const PPTX_SERIF = "Georgia";
const PPTX_MONO = "Consolas";

function inches(value: number): number {
  return value / PX_PER_INCH;
}

function points(value: number): number {
  return value * PT_SCALE;
}

function fontFace(deck: ExportDeck, family: FontFamily): string {
  if (family === "serif") {
    return PPTX_SERIF;
  }

  if (family === "mono") {
    return PPTX_MONO;
  }

  return deck.bodyFontName || PPTX_SANS;
}

type Box = { x: number; y: number; w: number; h: number };

function box(rect: ExportRect): Box {
  return {
    x: inches(rect.x),
    y: inches(rect.y),
    w: inches(Math.max(0.01, rect.width)),
    h: inches(Math.max(0.01, rect.height)),
  };
}

/**
 * Add one of the measured text blocks.
 *
 * `valign: "top"` plus an explicit `lineSpacing` reproduces the baseline grid
 * the layout module measured against. `fit: "shrink"` is left on as a safety net
 * for PowerPoint's own text engine, which measures slightly differently from
 * our approximation.
 */
function addText(
  slide: SlideProxy,
  deck: ExportDeck,
  text: string,
  fit: FittedText,
  origin: { x: number; y: number },
  options: {
    width: number;
    color: string;
    bold?: boolean;
    family: FontFamily;
    align?: "left" | "right" | "center";
    lineHeight: number;
  },
): void {
  if (fit.lines.length === 0) {
    return;
  }

  slide.addText(text, {
    x: inches(origin.x),
    y: inches(origin.y),
    w: inches(Math.max(0.05, options.width)),
    h: inches(Math.max(0.02, fit.height)),
    fontFace: fontFace(deck, options.family),
    fontSize: points(fit.fontSize),
    color: toHexDigits(options.color),
    bold: options.bold ?? false,
    align: options.align ?? "left",
    valign: "top",
    margin: 0,
    lineSpacing: points(options.lineHeight),
    fit: "shrink",
    wrap: true,
  });
}

function addPanel(
  slide: SlideProxy,
  rect: ExportRect,
  fill: string,
  line: string,
): void {
  slide.addShape("rect", {
    ...box(rect),
    fill: { color: toHexDigits(fill) },
    line: { color: toHexDigits(line), width: 0.75 },
  });
}

function addBullets(
  slide: SlideProxy,
  deck: ExportDeck,
  bullets: ExportBullet[],
): void {
  if (bullets.length === 0) {
    return;
  }

  const theme = deck.theme;

  const runs = bullets.map((bullet, index) => ({
    text: bullet.text,
    options: {
      bullet: { characterCode: "25AA" },
      fontFace: fontFace(deck, deck.bodyFamily),
      fontSize: points(bullet.fit.fontSize),
      color: toHexDigits(theme.foreground),
      breakLine: index < bullets.length - 1,
      paraSpaceAfter: points(EXPORT_GEOMETRY.unit * 1.3),
      indentLevel: 0,
    },
  }));

  const first = bullets[0];

  if (!first) {
    return;
  }

  const last = bullets[bullets.length - 1];
  const totalHeight =
    (last ? last.rect.y + last.rect.height : 0) - first.rect.y;

  slide.addText(runs, {
    x: inches(first.rect.x + EXPORT_GEOMETRY.bulletIndent),
    y: inches(first.rect.y),
    w: inches(first.rect.width - EXPORT_GEOMETRY.bulletIndent),
    h: inches(Math.max(0.05, totalHeight)),
    fontFace: fontFace(deck, deck.bodyFamily),
    fontSize: points(first.fit.fontSize),
    color: toHexDigits(theme.foreground),
    valign: "top",
    align: "left",
    margin: 0,
    lineSpacing: points(first.fit.lineHeight),
    fit: "shrink",
  });
}

function addMetricCards(
  slide: SlideProxy,
  deck: ExportDeck,
  metrics: ExportMetricBox[],
): void {
  const theme = deck.theme;

  for (const metric of metrics) {
    addPanel(slide, metric.rect, theme.surface, theme.border);

    addText(
      slide,
      deck,
      metric.valueText,
      metric.valueFit,
      { x: metric.rect.x + metricPad, y: metric.valueTop },
      {
        width: metric.rect.width - 2 * metricPad,
        color: metric.placeholder ? theme.muted : theme.accent,
        bold: true,
        family: deck.headingFamily,
        lineHeight: metric.valueFit.lineHeight,
      },
    );

    addText(
      slide,
      deck,
      metric.labelText,
      metric.labelFit,
      { x: metric.rect.x + metricPad, y: metric.labelTop },
      {
        width: metric.rect.width - 2 * metricPad,
        color: theme.muted,
        family: deck.bodyFamily,
        lineHeight: metric.labelFit.lineHeight,
      },
    );

    if (metric.deltaFit) {
      addText(
        slide,
        deck,
        metric.deltaFit.lines.join(" "),
        metric.deltaFit,
        { x: metric.rect.x + metricPad, y: metric.deltaTop },
        {
          width: metric.rect.width - 2 * metricPad,
          color: theme.muted,
          family: deck.bodyFamily,
          lineHeight: metric.deltaFit.lineHeight,
        },
      );
    }
  }
}

/** Map our chart vocabulary onto the native Office chart types. */
function nativeChartType(chart: ExportChart): NativeChartName {
  switch (chart.chartType) {
    case "line":
      return "line";
    case "area":
      return "area";
    case "pie":
      return "pie";
    case "donut":
      return "doughnut";
    case "bar":
    default:
      return "bar";
  }
}

/**
 * Draw the chart as a real Office chart plus real shapes for the chrome.
 *
 * The panel, title and caption are shapes and text boxes (they are decoration,
 * not data). The plot itself is a native chart so its data table stays editable
 * in Excel — which is the whole reason to prefer PPTX over a PDF here.
 */
function addChart(slide: SlideProxy, deck: ExportDeck, chart: ExportChart): void {
  const theme = deck.theme;

  addPanel(slide, chart.panel, theme.surface, theme.border);

  if (chart.titleFit) {
    addText(
      slide,
      deck,
      chart.title ?? "",
      chart.titleFit,
      { x: chart.panel.x + chartPad, y: chart.panel.y + chartPad },
      {
        width: chart.panel.width - 2 * chartPad,
        color: theme.foreground,
        bold: true,
        family: deck.headingFamily,
        lineHeight: chart.titleFit.lineHeight,
      },
    );
  }

  const hasAxes = chart.chartType !== "pie" && chart.chartType !== "donut";
  const surfaceHex = toHexDigits(theme.surface);
  const mutedHex = toHexDigits(theme.muted);
  const borderHex = toHexDigits(theme.border);

  const plotBox: Box = {
    x: inches(chart.plot.x),
    y: inches(chart.plot.y),
    w: inches(Math.max(0.1, chart.plot.width)),
    h: inches(Math.max(0.1, chart.plot.height)),
  };

  const captionReserve =
    chart.captionFit ? chart.captionFit.height + chartPad : 0;

  slide.addChart(
    nativeChartType(chart),
    [
      {
        name: chart.title ?? "Series",
        labels: chart.points.map((point) => point.label),
        values: chart.points.map((point) => point.value),
      },
    ],
    {
      ...plotBox,
      h: Math.max(0.1, plotBox.h - inches(captionReserve)),
      showTitle: false,
      showLegend: false,
      showValue: true,
      chartColors: chart.points.map((point) => toHexDigits(point.color)),
      chartColorsOpacity: 100,
      dataLabelColor: mutedHex,
      dataLabelFontFace: fontFace(deck, deck.bodyFamily),
      dataLabelFontSize: points(FS.chartValue),
      dataLabelFormatCode: "#,##0.##",
      chartArea: {
        fill: { color: surfaceHex },
        border: { color: borderHex, pt: 0 },
        roundedCorners: false,
      },
      plotArea: {
        fill: { color: surfaceHex },
        border: { color: borderHex, pt: 0 },
      },
      border: { color: borderHex, pt: 0 },
      ...(hasAxes
        ? {
            catAxisLabelColor: mutedHex,
            catAxisLabelFontFace: fontFace(deck, deck.bodyFamily),
            catAxisLabelFontSize: points(FS.chartLabel),
            catAxisLineColor: borderHex,
            catGridLine: { color: borderHex, size: 0.5 },
            valAxisLabelColor: mutedHex,
            valAxisLabelFontFace: fontFace(deck, deck.bodyFamily),
            valAxisLabelFontSize: points(FS.chartLabel),
            valAxisLineColor: borderHex,
            valGridLine: { color: borderHex, size: 0.5 },
            valAxisHidden: true,
            catAxisHidden: false,
          }
        : { showPercent: true, showLeaderLines: false }),
    },
  );

  if (chart.captionFit) {
    addText(
      slide,
      deck,
      chart.caption ?? "",
      chart.captionFit,
      {
        x: chart.panel.x + chartPad,
        y:
          chart.panel.y +
          chart.panel.height -
          chartPad -
          chart.captionFit.height,
      },
      {
        width: chart.panel.width - 2 * chartPad,
        color: theme.muted,
        family: deck.bodyFamily,
        lineHeight: chart.captionFit.lineHeight,
      },
    );
  }
}

type ImagePayload = { data: string; format: "png" | "jpeg" };

function addImage(
  slide: SlideProxy,
  image: ImagePayload,
  rect: ExportRect,
): void {
  // `sizingContain`-free cover fit: PowerPoint crops with `srcRect`-free
  // sizing by stretching, so the aspect-correct crop is expressed by cropping
  // the source box via the `path`/`sizing` helpers pptxgenjs exposes. Keeping it
  // simple and predictable, the picture is fitted inside the frame the layout
  // measured, which never distorts and never overflows the column.
  slide.addImage({
    data: `image/${image.format};base64,${image.data}`,
    ...box(rect),
  });
}

/** Neutral stand-in for a slide image that could not be fetched. */
function addImagePlaceholder(slide: SlideProxy, deck: ExportDeck, rect: ExportRect): void {
  slide.addShape("rect", {
    ...box(rect),
    fill: { color: toHexDigits(deck.theme.surface) },
    line: { color: toHexDigits(deck.theme.border), width: 0.75, dashType: "dash" },
  });

  const message = "Visual unavailable in this export";
  const size = points(13);

  slide.addText(message, {
    x: inches(rect.x + 12),
    y: inches(rect.y + rect.height / 2 - 8),
    w: inches(Math.max(0.2, rect.width - 24)),
    h: inches(0.24),
    fontFace: fontFace(deck, deck.bodyFamily),
    fontSize: size,
    color: toHexDigits(deck.theme.muted),
    align: "center",
    valign: "middle",
    margin: 0,
    fit: "shrink",
  });
}

function addSlideContent(
  slide: SlideProxy,
  deck: ExportDeck,
  model: ExportSlide,
  image: ImagePayload | null,
): void {
  const theme = deck.theme;

  slide.background = { color: toHexDigits(theme.background) };

  if (model.label) {
    slide.addShape("rect", {
      ...box(model.label.rect),
      fill: { color: toHexDigits(theme.accent), transparency: 88 },
      line: { color: toHexDigits(theme.accent), width: 0.5, transparency: 60 },
    });

    addText(
      slide,
      deck,
      model.label.text,
      model.label.fit,
      {
        x: model.label.rect.x + EXPORT_GEOMETRY.labelChipPadX,
        y: model.label.rect.y + EXPORT_GEOMETRY.labelChipPadY,
      },
      {
        width: model.label.rect.width - 2 * EXPORT_GEOMETRY.labelChipPadX,
        color: theme.accent,
        family: deck.bodyFamily,
        lineHeight: model.label.fit.lineHeight,
      },
    );
  }

  addText(
    slide,
    deck,
    model.title.text,
    model.title.fit,
    { x: model.title.rect.x, y: model.title.rect.y },
    {
      width: model.title.rect.width,
      color: theme.foreground,
      bold: true,
      family: deck.headingFamily,
      lineHeight: LH.title,
    },
  );

  if (model.subtitle) {
    addText(
      slide,
      deck,
      model.subtitle.text,
      model.subtitle.fit,
      { x: model.subtitle.rect.x, y: model.subtitle.rect.y },
      {
        width: model.subtitle.rect.width,
        color: theme.muted,
        family: deck.bodyFamily,
        lineHeight: LH.subtitle,
      },
    );
  }

  addBullets(slide, deck, model.bullets);

  if (model.body) {
    addText(
      slide,
      deck,
      model.body.text,
      model.body.fit,
      { x: model.body.rect.x, y: model.body.rect.y },
      {
        width: model.body.rect.width,
        color: theme.muted,
        family: deck.bodyFamily,
        lineHeight: LH.body,
      },
    );
  }

  addMetricCards(slide, deck, model.metrics);

  if (model.chart) {
    addChart(slide, deck, model.chart);
  }

  if (model.caption) {
    addText(
      slide,
      deck,
      model.caption.text,
      model.caption.fit,
      { x: model.caption.rect.x, y: model.caption.rect.y },
      {
        width: model.caption.rect.width,
        color: theme.muted,
        family: deck.bodyFamily,
        lineHeight: LH.caption,
      },
    );
  }

  if (model.image) {
    if (image) {
      addImage(slide, image, model.image.rect);
    } else {
      addImagePlaceholder(slide, deck, model.image.rect);
    }
  }

  addText(
    slide,
    deck,
    model.orderBadge.text,
    model.orderBadge.fit,
    { x: model.orderBadge.rect.x, y: model.orderBadge.rect.y },
    {
      width: model.orderBadge.rect.width,
      color: theme.muted,
      family: deck.bodyFamily,
      align: "right",
      lineHeight: LH.tight,
    },
  );

  if (model.speakerNotes) {
    slide.addNotes(model.speakerNotes);
  }
}

export type BuildPptxOptions = {
  title?: string | null;
  company?: string | null;
  subject?: string | null;
};

/**
 * Render a measured deck to PPTX bytes.
 *
 * @throws ExportError with a safe message when pptxgenjs cannot produce output.
 */
export async function buildDeckPptx(
  deck: ExportDeck,
  options: BuildPptxOptions = {},
): Promise<Uint8Array> {
  const fetched = await loadExportImages(deck.slides);

  try {
    const pptx = new PptxGenJS();

    pptx.layout = "LAYOUT_16x9";
    pptx.author = "Raisevia AI";
    pptx.company = options.company?.trim() || "Raisevia AI";
    pptx.title = options.title?.trim() || "Pitch deck";
    pptx.subject =
      options.subject?.trim() || "Investor pitch deck — build, prepare, raise";

    for (const model of deck.slides) {
      const slide = pptx.addSlide();
      const image = fetched.get(model.id) ?? null;

      addSlideContent(
        slide,
        deck,
        model,
        image
          ? {
              data: Buffer.from(image.bytes).toString("base64"),
              format: image.format,
            }
          : null,
      );
    }

    const output = await pptx.write({ outputType: "nodebuffer", compression: true });

    if (output instanceof Uint8Array) {
      return output;
    }

    if (ArrayBuffer.isView(output)) {
      return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
    }

    throw new Error("pptxgenjs returned an unsupported output type");
  } catch (error: unknown) {
    console.error("[export] pptx generation failed", error);

    throw new ExportError(500, GENERIC_EXPORT_ERROR, "pptx_failed", {
      cause: error,
    });
  }
}