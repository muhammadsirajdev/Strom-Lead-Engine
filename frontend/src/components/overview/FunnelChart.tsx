import { BarChart3, Table2 } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FunnelStage } from "@/types/api";

/**
 * Conversion through the four pipeline stages.
 *
 * Form: horizontal bars, because the stage names are long and the job is
 * magnitude comparison across an *ordered* set. Colour is therefore an ordinal
 * single-hue ramp (--chart-1..4, validated for monotone lightness and >=2:1
 * contrast against each mode's surface) rather than four categorical hues,
 * which would spend identity colours on something that has a natural order.
 *
 * Every bar is directly labelled (mandatory at four marks) and the card has a
 * table-view twin, so no value is reachable only through a tooltip.
 */

const RAMP = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

interface FunnelChartProps {
  funnel: FunnelStage[] | undefined;
  loading: boolean;
}

interface Datum extends FunnelStage {
  fill: string;
}

function FunnelTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Datum }> }) {
  if (!active || !payload?.length) return null;
  const stage = payload[0]?.payload;
  if (!stage) return null;

  return (
    <div className="max-w-xs rounded-md border border-line bg-surface-raised px-3 py-2 shadow-overlay">
      <p className="text-[0.8125rem] font-medium text-ink">{stage.label}</p>
      <p className="mt-1 text-lg font-semibold leading-none text-ink">{formatNumber(stage.count)}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{stage.description}</p>
      {stage.conversion_from_previous !== null ? (
        <p className="mt-1.5 text-xs text-ink-secondary">
          <span className="tabular-nums">{formatPercent(stage.conversion_from_previous)}</span> of the previous
          stage · <span className="tabular-nums">{formatPercent(stage.conversion_from_start)}</span> of all
          outreach
        </p>
      ) : null}
    </div>
  );
}

export function FunnelChart({ funnel, loading }: FunnelChartProps) {
  const [view, setView] = useState<"chart" | "table">("chart");

  const data: Datum[] = (funnel ?? []).map((stage, index) => ({
    ...stage,
    fill: RAMP[index] ?? RAMP[RAMP.length - 1]!,
  }));

  const hasVolume = data.some((stage) => stage.count > 0);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Conversion through the pipeline</CardTitle>
          <p className="text-[0.8125rem] text-ink-muted">
            Each stage is a subset of the one above it, derived from{" "}
            <code className="font-mono text-xs">tracking.status</code>.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-md bg-surface-inset p-0.5">
          {(
            [
              ["chart", BarChart3, "Chart view"],
              ["table", Table2, "Table view"],
            ] as const
          ).map(([mode, Icon, label]) => (
            <Button
              key={mode}
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
              className={cn(
                "size-7",
                view === mode ? "bg-surface text-ink shadow-card" : "text-ink-muted",
              )}
            >
              <Icon />
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        {loading ? (
          <div className="space-y-3 pt-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : !hasVolume ? (
          <EmptyState
            icon={BarChart3}
            title="No outreach sent yet"
            description="The funnel fills in once Lead Find sends its first approved email and writes a tracking row."
          />
        ) : view === "chart" ? (
          <>
            {/* Height covers the plot plus the axis band, so the card never
                grows an inner scrollbar. */}
            <div className="h-[248px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  layout="vertical"
                  margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
                  barCategoryGap="26%"
                >
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--ink-muted))", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={104}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--ink-secondary))", fontSize: 12 }}
                  />
                  <RechartsTooltip
                    content={<FunnelTooltip />}
                    cursor={{ fill: "hsl(var(--ink) / 0.04)" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                    {data.map((stage) => (
                      <Cell key={stage.key} fill={stage.fill} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="right"
                      offset={10}
                      fill="hsl(var(--ink))"
                      fontSize={12}
                      fontWeight={600}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Stage-to-stage conversion, spelled out rather than left to the
                reader to divide two bars in their head. */}
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
              {data.slice(1).map((stage) => (
                <div key={stage.key} className="min-w-0">
                  <dt className="truncate text-2xs uppercase tracking-wider text-ink-muted">
                    → {stage.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                    {formatPercent(stage.conversion_from_previous)}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wider text-ink-muted">
                  <th className="py-2 pr-3 text-left font-medium">Stage</th>
                  <th className="py-2 pr-3 text-right font-medium">Leads</th>
                  <th className="py-2 pr-3 text-right font-medium">From previous</th>
                  <th className="py-2 text-right font-medium">From start</th>
                </tr>
              </thead>
              <tbody>
                {data.map((stage) => (
                  <tr key={stage.key} className="border-b border-line/60 last:border-0">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-sm"
                          style={{ backgroundColor: stage.fill }}
                          aria-hidden
                        />
                        <span className="text-ink">{stage.label}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums text-ink">
                      {formatNumber(stage.count)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-secondary">
                      {formatPercent(stage.conversion_from_previous)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink-secondary">
                      {formatPercent(stage.conversion_from_start)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
