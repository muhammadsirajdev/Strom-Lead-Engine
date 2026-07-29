import { createColumnHelper } from "@tanstack/react-table";
import { CalendarClock, Link2, Link2Off, Mail } from "lucide-react";

import { StatusBadge } from "@/components/common/StatusBadge";
import { StormCell } from "@/components/common/StormCell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LeadSummary } from "@/types/api";

const helper = createColumnHelper<LeadSummary>();

/**
 * Column definitions for the leads table. Header labels name the business
 * concept; each column's tooltip names the database column behind it, so an
 * operator can always trace a value back to `tracking` or `customers`.
 */
export const leadColumns = [
  helper.accessor("full_name", {
    id: "customer",
    header: "Customer",
    minSize: 220,
    cell: ({ row }) => {
      const lead = row.original;
      return (
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-inset text-2xs font-medium text-ink-secondary"
            aria-hidden
          >
            {initials(lead.full_name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[0.8125rem] font-medium text-ink">{lead.full_name}</span>
            <span className="block truncate text-2xs text-ink-muted">{lead.email}</span>
          </span>
        </div>
      );
    },
  }),

  helper.accessor((row) => `${row.city}, ${row.state}`, {
    id: "city",
    header: "City",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-[0.8125rem] text-ink-secondary">
        {row.original.city}
        <span className="text-ink-muted"> {row.original.state}</span>
      </span>
    ),
  }),

  helper.accessor("status", {
    id: "status",
    header: "Status",
    cell: ({ getValue }) => <StatusBadge status={getValue()} />,
    sortingFn: (a, b) => a.original.status.localeCompare(b.original.status),
  }),

  helper.accessor((row) => row.storm.label ?? "", {
    id: "storm",
    header: "Storm context",
    minSize: 240,
    cell: ({ row }) => <StormCell storm={row.original.storm} className="max-w-[22rem]" />,
  }),

  helper.accessor((row) => row.triage_reason ?? "", {
    id: "triage_reason",
    header: "Triage rationale",
    minSize: 260,
    cell: ({ row }) => {
      const reason = row.original.triage_reason;
      if (!reason) {
        return <span className="text-xs text-ink-muted">—</span>;
      }
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block max-w-[24rem] truncate text-[0.8125rem] text-ink-secondary">{reason}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium text-ink">LLM classification rationale</p>
            <p className="mt-1">{reason}</p>
            <p className="mt-1.5 text-ink-muted">tracking.triage_reason, written by Reply Triage</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  }),

  helper.accessor("invite_sent", {
    id: "invite_sent",
    header: "Calendly",
    cell: ({ row }) => {
      const lead = row.original;
      const Icon = lead.invite_sent ? Link2 : Link2Off;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs",
                lead.invite_sent ? "text-status-interested" : "text-ink-muted",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {lead.invite_sent ? "Sent" : "Not sent"}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {lead.invite_sent
                ? "A Calendly scheduling link has been sent on this thread."
                : "No scheduling link sent yet."}
            </p>
            <p className="mt-1 text-ink-muted">
              tracking.nudge_count = {lead.nudge_count} (&gt; 0 doubles as the invite-sent marker)
            </p>
          </TooltipContent>
        </Tooltip>
      );
    },
  }),

  helper.accessor((row) => row.scheduled_at ?? "", {
    id: "scheduled_at",
    header: "Appointment",
    cell: ({ row }) => {
      const lead = row.original;
      if (!lead.scheduled_at) {
        return <span className="text-xs text-ink-muted">—</span>;
      }
      const upcoming = new Date(lead.scheduled_at).getTime() > Date.now();
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap text-[0.8125rem] tabular-nums",
                upcoming ? "text-status-booked" : "text-ink-secondary",
              )}
            >
              <CalendarClock className="size-3.5 shrink-0" aria-hidden />
              {formatDateTime(lead.scheduled_at)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-ink">{upcoming ? "Upcoming inspection" : "Past appointment"}</p>
            <p className="mt-0.5">{formatRelative(lead.scheduled_at)}</p>
            <p className="mt-1 text-ink-muted">tracking.scheduled_at</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  }),

  helper.accessor("last_contacted_at", {
    id: "last_contacted_at",
    header: "Last activity",
    cell: ({ row }) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="whitespace-nowrap text-[0.8125rem] tabular-nums text-ink-secondary">
            {formatRelative(row.original.last_contacted_at)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-ink">{formatDateTime(row.original.last_contacted_at)}</p>
          <p className="mt-1 text-ink-muted">tracking.last_contacted_at</p>
        </TooltipContent>
      </Tooltip>
    ),
    sortingFn: "datetime",
  }),

  helper.accessor((row) => row.thread_id ?? "", {
    id: "thread_id",
    header: "Thread",
    cell: ({ row }) => {
      const lead = row.original;
      if (!lead.thread_id) return <span className="text-xs text-ink-muted">—</span>;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5 font-mono text-2xs text-ink-muted">
              <Mail className="size-3" aria-hidden />
              {lead.thread_id.slice(0, 8)}…
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-mono text-xs text-ink">{lead.thread_id}</p>
            <p className="mt-1 text-ink-muted">
              Gmail thread id · {lead.processed_message_count} message
              {lead.processed_message_count === 1 ? "" : "s"} processed
            </p>
          </TooltipContent>
        </Tooltip>
      );
    },
  }),

  helper.accessor("lead_id", {
    id: "lead_id",
    header: "Lead",
    cell: ({ getValue }) => (
      <span className="font-mono text-2xs tabular-nums text-ink-muted">#{getValue()}</span>
    ),
  }),
];

/** Human labels for the column-visibility menu. */
export const COLUMN_LABELS: Record<string, string> = {
  customer: "Customer",
  city: "City",
  status: "Status",
  storm: "Storm context",
  triage_reason: "Triage rationale",
  invite_sent: "Calendly",
  scheduled_at: "Appointment",
  last_contacted_at: "Last activity",
  thread_id: "Thread",
  lead_id: "Lead id",
};

/** Columns hidden by default -- available, but not worth the width up front. */
export const DEFAULT_HIDDEN_COLUMNS = ["thread_id", "lead_id"];
