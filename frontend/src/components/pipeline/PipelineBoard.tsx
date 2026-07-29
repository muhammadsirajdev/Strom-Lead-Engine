import { motion } from "framer-motion";
import { ArrowRight, Columns3, Lock } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPercent, pluralize } from "@/lib/format";
import { PIPELINE_STAGES, STATUS_ORDER, statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { LeadSummary, StatusCount } from "@/types/api";

/**
 * Column-per-status board: how many leads sit at each stage of the lifecycle,
 * with the newest few named in each column so the board is scannable rather
 * than just six numbers.
 *
 * Column identity is carried by its heading and icon; the status colour is a
 * top rule and a dot, never the only cue.
 */

interface PipelineBoardProps {
  statusCounts: StatusCount[] | undefined;
  /** Recent leads, used to name a few examples per column. */
  leads: LeadSummary[] | undefined;
  total: number;
  loading: boolean;
}

const PREVIEW_PER_COLUMN = 4;

export function PipelineBoard({ statusCounts, leads, total, loading }: PipelineBoardProps) {
  if (loading && !statusCounts) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {STATUS_ORDER.map((status) => (
          <div key={status} className="space-y-3 rounded-lg border border-line bg-surface p-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-10" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (total === 0) {
    return (
      <EmptyState
        icon={Columns3}
        title="No leads on the board"
        description="Every column fills from tracking.status. Lead Find creates the first rows when a storm qualifies a city and a human approves the drafted emails."
      />
    );
  }

  const counts = new Map(statusCounts?.map((s) => [s.status, s.count]));

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {STATUS_ORDER.map((status, columnIndex) => {
        const meta = statusMeta(status);
        const Icon = meta.icon;
        const count = counts.get(status) ?? 0;
        const share = total > 0 ? count / total : null;
        const columnLeads = (leads ?? []).filter((lead) => lead.status === status);
        const preview = columnLeads.slice(0, PREVIEW_PER_COLUMN);
        const overflow = count - preview.length;

        return (
          <motion.section
            key={status}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: columnIndex * 0.035, ease: "easeOut" }}
            className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card"
            aria-label={`${meta.label}: ${count} ${pluralize(count, "lead")}`}
          >
            {/* Status rule: a 2px colour edge, above a heading that names it. */}
            <div className={cn("h-0.5 w-full", meta.bar)} aria-hidden />

            <header className="space-y-2 border-b border-line px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon className={cn("size-3.5 shrink-0", meta.text)} aria-hidden />
                  <span className="truncate text-[0.8125rem] font-medium text-ink">{meta.label}</span>
                </span>
                {meta.terminal ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Lock className="size-3 shrink-0 text-ink-muted" aria-label="Terminal status" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Terminal — Reply Triage stops polling a thread once it lands here.
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>

              <div className="flex items-end justify-between gap-2">
                <span className="text-2xl font-semibold leading-none tracking-tight text-ink">{count}</span>
                <span className="text-2xs tabular-nums text-ink-muted">{formatPercent(share)}</span>
              </div>

              <Badge variant="default" className="w-full justify-center">
                {meta.writtenBy}
              </Badge>
            </header>

            <div className="flex-1 space-y-1.5 p-2">
              {count === 0 ? (
                <p className="px-1 py-3 text-2xs leading-relaxed text-ink-muted">
                  Nothing here. {meta.description}
                </p>
              ) : (
                <>
                  {preview.map((lead) => (
                    <Link
                      key={lead.lead_id}
                      to={`/leads?status=${status}&search=${encodeURIComponent(lead.email)}`}
                      className="block rounded-md border border-line/70 bg-surface-inset/60 px-2.5 py-2 transition-colors hover:border-line-strong hover:bg-surface-inset"
                    >
                      <p className="truncate text-xs font-medium text-ink">{lead.full_name}</p>
                      <p className="mt-0.5 truncate text-2xs text-ink-muted">
                        {lead.city} · {lead.storm.label ?? "no storm context"}
                      </p>
                    </Link>
                  ))}
                  {overflow > 0 ? (
                    <Link
                      to={`/leads?status=${status}`}
                      className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-2xs text-ink-muted transition-colors hover:bg-surface-inset hover:text-ink"
                    >
                      <span>
                        +{overflow} more {pluralize(overflow, "lead")}
                      </span>
                      <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  ) : null}
                </>
              )}
            </div>
          </motion.section>
        );
      })}
    </div>
  );
}

/** The four agents and the status each one writes -- the board's legend. */
export function StageLegend() {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {PIPELINE_STAGES.map((stage, index) => (
        <div key={stage.key} className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded bg-surface-inset text-2xs font-semibold tabular-nums text-ink-muted">
                {index + 1}
              </span>
              <span className="text-[0.8125rem] font-medium text-ink">{stage.name}</span>
            </span>
            <Badge variant="default">{stage.cadence}</Badge>
          </div>
          <p className="mt-2 truncate font-mono text-2xs text-ink-muted">{stage.script}</p>
          <p className="mt-1.5 text-2xs text-ink-secondary">
            writes <code className="font-mono text-ink">{stage.writes}</code>
          </p>
        </div>
      ))}
    </div>
  );
}
