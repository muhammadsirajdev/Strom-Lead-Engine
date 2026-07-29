/**
 * Lifecycle metadata: one source of truth for how each `tracking.status` and
 * storm severity is labelled, coloured and iconified.
 *
 * Every status pairs a colour with an icon *and* a text label, so state is
 * never communicated by colour alone. The palette intentionally excludes the
 * accent/chart blue -- that hue belongs to the data ramp, and a lifecycle
 * state must never read as a chart series.
 */

import {
  CalendarCheck,
  CircleSlash,
  Clock,
  MailX,
  Sparkles,
  ThumbsDown,
  type LucideIcon,
} from "lucide-react";

import type { LeadStatus, Severity } from "@/types/api";

export interface StatusMeta {
  value: LeadStatus;
  label: string;
  /** What this status means in the pipeline, for tooltips and empty states. */
  description: string;
  icon: LucideIcon;
  /** Which pipeline stage writes it -- shown on the board columns. */
  writtenBy: string;
  terminal: boolean;
  /** Tailwind classes. Kept as literals so the JIT compiler can see them. */
  dot: string;
  text: string;
  badge: string;
  bar: string;
}

export const STATUS_META: Record<LeadStatus, StatusMeta> = {
  awaiting_reply: {
    value: "awaiting_reply",
    label: "Awaiting reply",
    description: "Outreach email sent; nothing back from the customer yet.",
    icon: Clock,
    writtenBy: "Lead Find",
    terminal: false,
    dot: "bg-status-awaiting",
    text: "text-status-awaiting",
    badge: "border-status-awaiting/30 bg-status-awaiting/10 text-status-awaiting",
    bar: "bg-status-awaiting",
  },
  interested: {
    value: "interested",
    label: "Interested",
    description: "Reply classified NEEDED — a Calendly link is owed or already sent.",
    icon: Sparkles,
    writtenBy: "Reply Triage",
    terminal: false,
    dot: "bg-status-interested",
    text: "text-status-interested",
    badge: "border-status-interested/30 bg-status-interested/10 text-status-interested",
    bar: "bg-status-interested",
  },
  booked: {
    value: "booked",
    label: "Booked",
    description: "Calendly booking detected and the team was notified on Slack.",
    icon: CalendarCheck,
    writtenBy: "Booking Notify",
    terminal: true,
    dot: "bg-status-booked",
    text: "text-status-booked",
    badge: "border-status-booked/30 bg-status-booked/10 text-status-booked",
    bar: "bg-status-booked",
  },
  not_interested: {
    value: "not_interested",
    label: "Not interested",
    description: "Reply classified NOT_NEEDED or OUT_OF_CONTEXT. A later reply can still reopen it.",
    icon: ThumbsDown,
    writtenBy: "Reply Triage",
    terminal: false,
    dot: "bg-status-declined",
    text: "text-status-declined",
    badge: "border-status-declined/30 bg-status-declined/10 text-status-declined",
    bar: "bg-status-declined",
  },
  no_response: {
    value: "no_response",
    label: "No response",
    description: "Silent for 7+ days after contact; closed by the Close Stale job.",
    icon: MailX,
    writtenBy: "Close Stale",
    terminal: true,
    dot: "bg-status-silent",
    text: "text-status-silent",
    badge: "border-status-silent/30 bg-status-silent/10 text-status-silent",
    bar: "bg-status-silent",
  },
  unsubscribed: {
    value: "unsubscribed",
    label: "Unsubscribed",
    description: "Reserved for a manual opt-out flow; no automated job sets it today.",
    icon: CircleSlash,
    writtenBy: "Manual",
    terminal: true,
    dot: "bg-status-unsubscribed",
    text: "text-status-unsubscribed",
    badge: "border-status-unsubscribed/30 bg-status-unsubscribed/10 text-status-unsubscribed",
    bar: "bg-status-unsubscribed",
  },
};

/** Lifecycle order -- the order the board and legends render in. */
export const STATUS_ORDER: LeadStatus[] = [
  "awaiting_reply",
  "interested",
  "booked",
  "not_interested",
  "no_response",
  "unsubscribed",
];

const FALLBACK_META: StatusMeta = {
  value: "awaiting_reply",
  label: "Unknown",
  description: "Status not recognized by the dashboard.",
  icon: CircleSlash,
  writtenBy: "—",
  terminal: false,
  dot: "bg-ink-muted",
  text: "text-ink-muted",
  badge: "border-line-strong bg-surface-inset text-ink-secondary",
  bar: "bg-ink-muted",
};

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status as LeadStatus] ?? { ...FALLBACK_META, label: status };
}

/** CSS colour for chart marks and inline styles (Recharts needs a value). */
export function statusColorVar(status: string): string {
  const token: Record<LeadStatus, string> = {
    awaiting_reply: "--status-awaiting",
    interested: "--status-interested",
    booked: "--status-booked",
    not_interested: "--status-declined",
    no_response: "--status-silent",
    unsubscribed: "--status-unsubscribed",
  };
  const variable = token[status as LeadStatus] ?? "--ink-muted";
  return `hsl(var(${variable}))`;
}

// ---------------------------------------------------------------------------
// Storm severity
// ---------------------------------------------------------------------------

export interface SeverityMeta {
  value: Severity;
  label: string;
  description: string;
  badge: string;
  dot: string;
  text: string;
}

export const SEVERITY_META: Record<Severity, SeverityMeta> = {
  severe: {
    value: "severe",
    label: "Severe",
    description:
      "Storm condition, or wind at/over the 50 mph threshold Lead Find targets on.",
    badge: "border-severity-severe/30 bg-severity-severe/10 text-severity-severe",
    dot: "bg-severity-severe",
    text: "text-severity-severe",
  },
  elevated: {
    value: "elevated",
    label: "Elevated",
    description: "Wind at/over 35 mph — notable, but below the outreach threshold.",
    badge: "border-severity-elevated/30 bg-severity-elevated/10 text-severity-elevated",
    dot: "bg-severity-elevated",
    text: "text-severity-elevated",
  },
  calm: {
    value: "calm",
    label: "Calm",
    description: "Storm context on file, but nothing at damage-causing levels.",
    badge: "border-severity-calm/30 bg-severity-calm/10 text-severity-calm",
    dot: "bg-severity-calm",
    text: "text-severity-calm",
  },
  unknown: {
    value: "unknown",
    label: "No storm data",
    description: "No storm_context recorded for any lead in this city yet.",
    badge: "border-line-strong bg-surface-inset text-ink-muted",
    dot: "bg-severity-unknown",
    text: "text-ink-muted",
  },
};

export function severityMeta(severity: Severity | null | undefined): SeverityMeta {
  return SEVERITY_META[severity ?? "unknown"] ?? SEVERITY_META.unknown;
}

// ---------------------------------------------------------------------------
// Pipeline stages (the four agents)
// ---------------------------------------------------------------------------

export interface StageMeta {
  key: string;
  name: string;
  script: string;
  cadence: string;
  writes: string;
}

export const PIPELINE_STAGES: StageMeta[] = [
  {
    key: "lead_find",
    name: "Lead Find",
    script: "lead_find_agent.py",
    cadence: "daily 08:00",
    writes: "awaiting_reply",
  },
  {
    key: "reply_triage",
    name: "Reply Triage",
    script: "send_booking_agent.py",
    cadence: "every 30 min",
    writes: "interested / not_interested",
  },
  {
    key: "booking_notify",
    name: "Booking Notify",
    script: "notify_booking_with_team.py",
    cadence: "hourly",
    writes: "booked",
  },
  {
    key: "close_stale",
    name: "Close Stale",
    script: "close_stale_leads.py",
    cadence: "daily 08:30",
    writes: "no_response",
  },
];
