import { AlertTriangle, ArrowRight, CircleCheck, Link2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPercent, formatRelative, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PipelineHealth } from "@/types/api";

/**
 * The ratios and backlogs an operator watches, plus the things that need a
 * human. Rates render as labelled meters (a single ratio against a limit),
 * not as pie slices.
 */

function Meter({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: number | null;
  caption: string;
  tone: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.8125rem] text-ink-secondary">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-ink">{formatPercent(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-inset" role="presentation">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-2xs leading-tight text-ink-muted">{caption}</p>
    </div>
  );
}

/** An item that needs a person to act. Zero is the good state. */
function AttentionRow({
  icon: Icon,
  count,
  label,
  detail,
  to,
  tone,
}: {
  icon: typeof AlertTriangle;
  count: number;
  label: string;
  detail: string;
  to?: string;
  tone: string;
}) {
  const clear = count === 0;
  const content = (
    <>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md",
          clear ? "bg-surface-inset text-ink-muted" : tone,
        )}
      >
        {clear ? <CircleCheck className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] font-medium text-ink">
          <span className="tabular-nums">{count}</span> {label}
        </span>
        <span className="block truncate text-2xs text-ink-muted">{detail}</span>
      </span>
      {to && !clear ? <ArrowRight className="size-3.5 shrink-0 text-ink-muted" aria-hidden /> : null}
    </>
  );

  const className = cn(
    "flex items-center gap-2.5 rounded-md border border-line px-2.5 py-2 transition-colors",
    to && !clear ? "hover:border-line-strong hover:bg-surface-inset" : "",
  );

  return to && !clear ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function PipelineHealthCard({
  health,
  loading,
}: {
  health: PipelineHealth | undefined;
  loading: boolean;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-1">
        <CardTitle>Pipeline health</CardTitle>
        <p className="text-[0.8125rem] text-ink-muted">
          {loading || !health ? (
            "Loading…"
          ) : (
            <>
              <span className="tabular-nums">{health.active_leads}</span>{" "}
              {pluralize(health.active_leads, "lead")} still in play · last activity{" "}
              {formatRelative(health.last_activity_at)}
            </>
          )}
        </p>
      </CardHeader>

      <CardContent className="flex-1 space-y-5">
        {loading || !health ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-1.5 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <Meter
                label="Reply rate"
                value={health.reply_rate}
                caption="Replied ÷ outreach sent"
                tone="bg-chart-2"
              />
              <Meter
                label="Interest rate"
                value={health.interest_rate}
                caption="Classified NEEDED ÷ replies triaged"
                tone="bg-chart-2"
              />
              <Meter
                label="Booking rate"
                value={health.booking_rate}
                caption="Booked ÷ interested leads"
                tone="bg-chart-2"
              />
            </div>

            <div className="space-y-2 border-t border-line pt-4">
              <p className="text-2xs font-medium uppercase tracking-wider text-ink-muted">Needs attention</p>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <AttentionRow
                      icon={ShieldCheck}
                      count={health.pending_review_threads}
                      label={pluralize(health.pending_review_threads, "run", "runs")}
                      detail="Paused at the human-review gate"
                      to="/review"
                      tone="bg-status-awaiting/12 text-status-awaiting"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Threads in <code className="font-mono">run_a_pending_review</code>. Nothing sends until a
                  human resolves them with{" "}
                  <code className="font-mono">python -m agents.lead_find_agent --review</code>.
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <AttentionRow
                      icon={Link2}
                      count={health.awaiting_invite}
                      label="awaiting a Calendly link"
                      detail="Interested, but nudge_count is still 0"
                      to="/leads?status=interested"
                      tone="bg-status-interested/12 text-status-interested"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Reply Triage sends the scheduling link on its next pass (every 30 minutes) and increments{" "}
                  <code className="font-mono">nudge_count</code>.
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <AttentionRow
                      icon={AlertTriangle}
                      count={health.stale_awaiting}
                      label="going stale"
                      detail="Silent 7+ days — Close Stale closes these next"
                      to="/leads?status=awaiting_reply"
                      tone="bg-status-silent/15 text-status-silent"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Matches Close Stale's own rule: <code className="font-mono">awaiting_reply</code> with{" "}
                  <code className="font-mono">last_contacted_at</code> older than 7 days.
                </TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
