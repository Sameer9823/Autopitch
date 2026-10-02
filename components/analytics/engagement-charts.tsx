"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * Analytics charts for a shared deck.
 *
 * Every series here is an aggregate computed server-side in
 * `lib/analytics/aggregate.ts`. No per-viewer data is fetched by the client,
 * so there is nothing in this component that could identify a viewer.
 */

const viewsConfig = {
  views: { label: "Views", color: "var(--color-primary)" },
} satisfies ChartConfig;

const dwellConfig = {
  dwell: { label: "Avg. time", color: "var(--color-secondary)" },
} satisfies ChartConfig;

const funnelConfig = {
  reached: { label: "Viewers reaching slide", color: "var(--color-primary)" },
} satisfies ChartConfig;

export function ViewsOverTimeChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  if (data.length === 0) return null;

  return (
    <ChartContainer config={viewsConfig} className="aspect-auto h-56 w-full">
      <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          dataKey="count"
          type="monotone"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function SlideEngagementChart({
  data,
}: {
  data: { order: number; count: number }[];
}) {
  if (data.length === 0) return null;

  return (
    <ChartContainer config={viewsConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="order"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

export function AverageTimePerSlideChart({
  data,
  formatMs,
}: {
  data: { order: number; avgMs: number }[];
  formatMs: (ms: number) => string;
}) {
  if (data.length === 0) return null;

  // Charts cannot render an axis of "0s 3s 12s 1m 4s" as a continuous numeric
  // scale, so seconds are plotted and the tooltip formats back to a label.
  const seconds = data.map((row) => ({ ...row, seconds: row.avgMs / 1000 }));

  return (
    <ChartContainer config={dwellConfig} className="aspect-auto h-56 w-full">
      <BarChart data={seconds} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="order"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          tickFormatter={(value: number) =>
            value >= 60 ? `${Math.round(value / 60)}m` : `${Math.round(value)}s`
          }
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) =>
                name === "seconds"
                  ? [formatMs(Number(value) * 1000), "Avg. time"]
                  : [String(value), String(name)]
              }
            />
          }
        />
        <Bar dataKey="seconds" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

export function CompletionFunnelChart({
  data,
}: {
  data: { label: string; threshold: number; count: number }[];
}) {
  if (data.length === 0) return null;

  return (
    <ChartContainer config={funnelConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
