import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, formatPercent } from "@/lib/format";
import { STATUS_ORDER, statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Stats } from "@/types/api";

/**
 * Where every lead stands, as one part-to-whole bar plus a legend that doubles
 * as navigation. Replaces a row of identical stat tiles: the job is "how is
 * the book split", which is a single composition, not seven separate numbers.
 */
export function StatusComposition({ stats, loading }: { stats: Stats | undefined; loading: boolean }) {
  const total = stats?.total_leads ?? 0;
  const rows = STATUS_ORDER.map((status) => ({
    status,
    meta: statusMeta(status),
    count: stats?.status_counts.find((s) => s.status === status)?.count ?? 0,
  }));

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Where every lead stands</CardTitle>
        <p className="text-[0.8125rem] text-ink-muted">
          {stats
            ? `${formatNumber(total)} leads from ${formatNumber(stats.opted_in_customers)} opted-in customers, out of ${formatNumber(stats.total_customers)} on file.`
            : "Loading the book of business…"}
        </p>
      </CardHeader>

      <CardContent className="flex-1">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-3 w-full rounded-full" />
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-inset" role="presentation">
              {total > 0
                ? rows
                    .filter((r) => r.count > 0)
                    .map((r) => (
                      <div
                        key={r.status}
                        className={cn("h-full min-w-[4px]", r.meta.bar)}
                        style={{ flexGrow: r.count }}
                      />
                    ))
                : null}
            </div>

            <ul className="mt-5 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {rows.map(({ status, meta, count }) => {
                const Icon = meta.icon;
                return (
                  <li key={status}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          to={`/leads?status=${status}`}
                          className={cn(
                            "-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-inset",
                            count === 0 && "opacity-60 hover:opacity-100",
                          )}
                        >
                          <Icon className={cn("size-4 shrink-0", meta.text)} aria-hidden />
                          <span className="flex-1 truncate text-sm text-ink">{meta.label}</span>
                          <span className="text-xs tabular-nums text-ink-muted">
                            {total > 0 ? formatPercent(count / total) : ""}
                          </span>
                          <span className="w-8 text-right font-display text-xl font-semibold leading-none text-ink">
                            {formatNumber(count)}
                          </span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>{meta.description}</TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
