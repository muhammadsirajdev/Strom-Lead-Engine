import { CloudLightning } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import { severityMeta } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { StormSummary } from "@/types/api";

/**
 * Compact storm-context summary for a table cell. Handles both producer
 * shapes: the agent's {condition_text, wind_mph} and the seed generator's
 * {hail_in, wind_mph} -- the backend flattens both into `label`.
 */
export function StormCell({ storm, className }: { storm: StormSummary; className?: string }) {
  const meta = severityMeta(storm.severity);

  if (!storm.label) {
    return <span className={cn("text-xs text-ink-muted", className)}>No storm context</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
          <span
            className={cn("size-1.5 shrink-0 rounded-full", meta.dot)}
            aria-hidden
          />
          <span className="truncate text-[0.8125rem] text-ink-secondary">{storm.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="flex items-center gap-1.5 font-medium text-ink">
          <CloudLightning className="size-3" aria-hidden />
          {meta.label} storm context
        </p>
        <dl className="mt-1.5 space-y-0.5">
          {storm.condition_text ? (
            <div>
              <dt className="inline text-ink-muted">Condition: </dt>
              <dd className="inline">{storm.condition_text}</dd>
            </div>
          ) : null}
          {storm.wind_mph !== null ? (
            <div>
              <dt className="inline text-ink-muted">Wind: </dt>
              <dd className="inline">{storm.wind_mph} mph</dd>
            </div>
          ) : null}
          {storm.hail_in !== null ? (
            <div>
              <dt className="inline text-ink-muted">Hail: </dt>
              <dd className="inline">{storm.hail_in}"</dd>
            </div>
          ) : null}
          {storm.date ? (
            <div>
              <dt className="inline text-ink-muted">Storm date: </dt>
              <dd className="inline">{formatDate(storm.date)}</dd>
            </div>
          ) : null}
          {storm.zip ? (
            <div>
              <dt className="inline text-ink-muted">ZIP: </dt>
              <dd className="inline">{storm.zip}</dd>
            </div>
          ) : null}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}
