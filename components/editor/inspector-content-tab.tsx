"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { CHART_TYPE_OPTIONS, describeBlock, moveItem } from "@/components/editor/helpers";
import {
  AddCircleIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  TrashIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { EditorSlide } from "@/lib/editor/use-deck-editor";
import type { ChartType, SlideBlock } from "@/lib/schemas/slide";

/**
 * Content tab: everything a founder can type on this slide.
 *
 * The slide's plain fields (title, subtitle, body, caption, label) and its
 * structured `blocks` array are edited together, because they are the same
 * story told twice: `blocks` carry bullets, metrics and charts, while `content`
 * carries the paragraphs the canvas prints as body text.
 *
 * Speaker notes live here too, as a plain textarea, so a founder can always
 * overwrite whatever the AI wrote.
 */

export type InspectorContentTabProps = {
  slide: EditorSlide;
  onFieldChange: (patch: Partial<EditorSlide>, label: string) => void;
  onBlocksChange: (blocks: SlideBlock[]) => void;
};

const inputClass =
  "w-full rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const boxInputClass = `${inputClass} h-9`;
const areaClass = "w-full rounded-xl border border-input bg-input/30 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function InspectorContentTab({
  slide,
  onFieldChange,
  onBlocksChange,
}: InspectorContentTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="copy-heading" className="flex flex-col gap-3">
        <h3
          id="copy-heading"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Copy
        </h3>

        <Field label="Title" htmlFor="content-title">
          <input
            id="content-title"
            value={slide.title}
            maxLength={200}
            placeholder="Slide title"
            className={boxInputClass}
            onChange={(event) =>
              onFieldChange({ title: event.target.value }, "Title")
            }
          />
        </Field>

        <Field label="Subtitle" htmlFor="content-subtitle">
          <input
            id="content-subtitle"
            value={slide.subtitle ?? ""}
            maxLength={400}
            placeholder="One supporting line"
            className={boxInputClass}
            onChange={(event) =>
              onFieldChange({ subtitle: event.target.value }, "Subtitle")
            }
          />
        </Field>

        <Field label="Body text" htmlFor="content-body">
          <Textarea
            id="content-body"
            value={slide.content}
            rows={5}
            maxLength={8000}
            placeholder="Supporting paragraphs. Avoid repeating anything already in a bullet."
            onChange={(event) =>
              onFieldChange({ content: event.target.value }, "Body text")
            }
          />
        </Field>
      </section>

      <BlocksEditor blocks={slide.blocks} onBlocksChange={onBlocksChange} />

      <section aria-labelledby="notes-heading" className="flex flex-col gap-3">
        <h3
          id="notes-heading"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Speaker notes
        </h3>
        <Textarea
          value={slide.speakerNotes ?? ""}
          rows={8}
          maxLength={8000}
          aria-label="Speaker notes"
          placeholder="What you will say out loud on this slide. Generate a first draft from the AI tab, then edit it here."
          onChange={(event) =>
            onFieldChange({ speakerNotes: event.target.value }, "Speaker notes")
          }
        />
        <p className="text-xs text-subtle-foreground">
          Notes are yours to rewrite. Nothing you write here is overwritten unless
          you ask for a new draft.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const MAX_BULLETS = 8;
const MAX_SERIES = 12;

function BlocksEditor({
  blocks,
  onBlocksChange,
}: {
  blocks: SlideBlock[];
  onBlocksChange: (blocks: SlideBlock[]) => void;
}) {
  function update(index: number, next: SlideBlock) {
    onBlocksChange(blocks.map((block, i) => (i === index ? next : block)));
  }

  function remove(index: number) {
    onBlocksChange(blocks.filter((_, i) => i !== index));
  }

  function move(from: number, direction: -1 | 1) {
    onBlocksChange(moveItem(blocks, from, from + direction));
  }

  return (
    <section aria-labelledby="blocks-heading" className="flex flex-col gap-3">
      <h3
        id="blocks-heading"
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        Bullets, metrics & charts
      </h3>

      {blocks.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No structured content yet. Add bullets, a metric or a chart and it will
          render on the slide.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {blocks.map((block, index) => (
            <li
              key={`${block.type}-${index}`}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3"
            >
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                  {describeBlock(block)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move this block up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <HugeiconsIcon
                    icon={ArrowLeft01Icon}
                    className="size-3 -rotate-90"
                    aria-hidden
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move this block down"
                  disabled={index === blocks.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    className="size-3 rotate-90"
                    aria-hidden
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove this block"
                  onClick={() => remove(index)}
                >
                  <HugeiconsIcon icon={TrashIcon} className="size-3" aria-hidden />
                </Button>
              </div>

              <BlockFields block={block} onChange={(next) => update(index, next)} />
            </li>
          ))}
        </ul>
      )}

      <AddBlockMenu
        disabled={blocks.length >= 20}
        onAdd={(block) => onBlocksChange([...blocks, block])}
      />
    </section>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: SlideBlock;
  onChange: (next: SlideBlock) => void;
}) {
  switch (block.type) {
    case "bullets":
      return <BulletsEditor block={block} onChange={onChange} />;
    case "metric":
      return <MetricEditor block={block} onChange={onChange} />;
    case "chart":
      return <ChartEditor block={block} onChange={onChange} />;
    case "body":
      return (
        <textarea
          value={block.text}
          rows={4}
          maxLength={2000}
          aria-label="Body block text"
          className={areaClass}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
        />
      );
    case "heading":
      return (
        <input
          value={block.text}
          maxLength={200}
          aria-label="Heading block text"
          className={boxInputClass}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
        />
      );
    case "caption":
      return (
        <input
          value={block.text}
          maxLength={400}
          aria-label="Caption block text"
          className={boxInputClass}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
        />
      );
    case "label":
      return (
        <input
          value={block.text}
          maxLength={80}
          aria-label="Label block text"
          className={boxInputClass}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
        />
      );
  }
}

function BulletsEditor({
  block,
  onChange,
}: {
  block: Extract<SlideBlock, { type: "bullets" }>;
  onChange: (next: SlideBlock) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {block.items.map((item, index) => (
        <li key={index} className="flex items-center gap-1.5">
          <input
            value={item}
            maxLength={400}
            aria-label={`Bullet ${index + 1}`}
            className={boxInputClass}
            onChange={(event) => {
              const items = [...block.items];
              items[index] = event.target.value;
              onChange({ ...block, items });
            }}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove bullet ${index + 1}`}
            disabled={block.items.length <= 1}
            onClick={() =>
              onChange({
                ...block,
                items: block.items.filter((_, i) => i !== index),
              })
            }
          >
            <HugeiconsIcon icon={TrashIcon} className="size-3" aria-hidden />
          </Button>
        </li>
      ))}
      <li>
        <Button
          variant="ghost"
          size="xs"
          disabled={block.items.length >= MAX_BULLETS}
          onClick={() => onChange({ ...block, items: [...block.items, "New point"] })}
        >
          <HugeiconsIcon icon={AddCircleIcon} className="size-3" aria-hidden />
          Add bullet
        </Button>
      </li>
    </ul>
  );
}

function MetricEditor({
  block,
  onChange,
}: {
  block: Extract<SlideBlock, { type: "metric" }>;
  onChange: (next: SlideBlock) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={block.value}
          maxLength={40}
          aria-label="Metric value"
          className={boxInputClass}
          onChange={(event) => onChange({ ...block, value: event.target.value })}
        />
        <input
          value={block.label}
          maxLength={60}
          aria-label="Metric label"
          placeholder="What it measures"
          className={boxInputClass}
          onChange={(event) => onChange({ ...block, label: event.target.value })}
        />
      </div>
      <input
        value={block.delta ?? ""}
        maxLength={40}
        aria-label="Metric change"
        placeholder="Change (optional)"
        className={boxInputClass}
        onChange={(event) =>
          onChange({ ...block, delta: event.target.value || undefined })
        }
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={block.placeholder ?? false}
          onChange={(event) =>
            onChange({
              ...block,
              placeholder: event.target.checked || undefined,
              value: event.target.checked ? "Data needed" : block.value,
            })
          }
        />
        Data needed — the deck does not contain this number
      </label>
    </div>
  );
}

function ChartEditor({
  block,
  onChange,
}: {
  block: Extract<SlideBlock, { type: "chart" }>;
  onChange: (next: SlideBlock) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <NativeSelect
        value={block.chartType}
        aria-label="Chart type"
        className="w-full"
        onChange={(event) =>
          onChange({ ...block, chartType: event.target.value as ChartType })
        }
      >
        {CHART_TYPE_OPTIONS.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>

      <input
        value={block.title ?? ""}
        maxLength={120}
        aria-label="Chart title"
        placeholder="What this chart proves"
        className={boxInputClass}
        onChange={(event) =>
          onChange({ ...block, title: event.target.value || undefined })
        }
      />

      <ul className="flex flex-col gap-2">
        {block.series.map((point, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <input
              value={point.label}
              maxLength={40}
              aria-label={`Series ${index + 1} label`}
              className={boxInputClass}
              onChange={(event) => {
                const series = [...block.series];
                series[index] = { ...point, label: event.target.value };
                onChange({ ...block, series });
              }}
            />
            <input
              type="number"
              value={Number.isFinite(point.value) ? point.value : 0}
              aria-label={`Series ${index + 1} value`}
              className={`${boxInputClass} w-24 tabular-nums`}
              onChange={(event) => {
                const series = [...block.series];
                const parsed = Number(event.target.value);
                series[index] = {
                  ...point,
                  value: Number.isFinite(parsed) ? parsed : 0,
                };
                onChange({ ...block, series });
              }}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove series ${index + 1}`}
              disabled={block.series.length <= 1}
              onClick={() =>
                onChange({
                  ...block,
                  series: block.series.filter((_, i) => i !== index),
                })
              }
            >
              <HugeiconsIcon icon={TrashIcon} className="size-3" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      <Button
        variant="ghost"
        size="xs"
        disabled={block.series.length >= MAX_SERIES}
        onClick={() =>
          onChange({
            ...block,
            series: [...block.series, { label: "New", value: 0 }],
          })
        }
      >
        <HugeiconsIcon icon={AddCircleIcon} className="size-3" aria-hidden />
        Add data point
      </Button>

      <input
        value={block.caption ?? ""}
        maxLength={300}
        aria-label="Chart caption"
        placeholder="Source or caveat (optional)"
        className={boxInputClass}
        onChange={(event) =>
          onChange({ ...block, caption: event.target.value || undefined })
        }
      />
    </div>
  );
}

function AddBlockMenu({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (block: SlideBlock) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Add:</span>
      <Button
        variant="outline"
        size="xs"
        disabled={disabled}
        onClick={() => onAdd({ type: "bullets", items: ["New point"] })}
      >
        <HugeiconsIcon icon={AddCircleIcon} className="size-3" aria-hidden />
        Bullets
      </Button>
      <Button
        variant="outline"
        size="xs"
        disabled={disabled}
        onClick={() =>
          onAdd({
            type: "metric",
            label: "Metric",
            value: "Data needed",
            placeholder: true,
          })
        }
      >
        <HugeiconsIcon icon={AddCircleIcon} className="size-3" aria-hidden />
        Metric
      </Button>
      <Button
        variant="outline"
        size="xs"
        disabled={disabled}
        onClick={() =>
          onAdd({
            type: "chart",
            chartType: "bar",
            title: "Chart",
            series: [
              { label: "Q1", value: 0 },
              { label: "Q2", value: 0 },
              { label: "Q3", value: 0 },
            ],
          })
        }
      >
        <HugeiconsIcon icon={AddCircleIcon} className="size-3" aria-hidden />
        Chart
      </Button>
      <Button
        variant="outline"
        size="xs"
        disabled={disabled}
        onClick={() => onAdd({ type: "body", text: "" })}
      >
        <HugeiconsIcon icon={AddCircleIcon} className="size-3" aria-hidden />
        Text
      </Button>
      {disabled ? (
        <span className="text-xs text-subtle-foreground">
          This slide has the maximum number of blocks.
        </span>
      ) : null}
    </div>
  );
}
