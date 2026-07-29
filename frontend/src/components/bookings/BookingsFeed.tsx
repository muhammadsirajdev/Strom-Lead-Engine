import { motion } from "framer-motion";
import { CalendarCheck, CalendarClock, CalendarX, Hash, Slack } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFullDateTime, formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Booking } from "@/types/api";

/**
 * Recent-activity feed of booked leads. Each entry is one `tracking` row that
 * Booking Notify moved to `booked` after finding a Calendly booking and
 * posting to Slack.
 */

function BookingRow({ booking, index }: { booking: Booking; index: number }) {
  const hasTime = booking.scheduled_at !== null;

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
      className="relative flex gap-4 pl-1"
    >
      {/* Timeline rail. */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "z-10 flex size-7 shrink-0 items-center justify-center rounded-full border",
            booking.is_upcoming
              ? "border-status-booked/40 bg-status-booked/12 text-status-booked"
              : hasTime
                ? "border-line-strong bg-surface-inset text-ink-muted"
                : "border-status-awaiting/40 bg-status-awaiting/10 text-status-awaiting",
          )}
        >
          {booking.is_upcoming ? (
            <CalendarClock className="size-3.5" aria-hidden />
          ) : hasTime ? (
            <CalendarCheck className="size-3.5" aria-hidden />
          ) : (
            <CalendarX className="size-3.5" aria-hidden />
          )}
        </span>
        <span className="mt-1 w-px flex-1 bg-line last:hidden" aria-hidden />
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink">
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-inset text-[0.5625rem] text-ink-muted"
                aria-hidden
              >
                {initials(booking.full_name)}
              </span>
              <span className="truncate">{booking.full_name}</span>
            </p>
            <p className="mt-0.5 truncate text-2xs text-ink-muted">
              {booking.email} · {booking.city}, {booking.state}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {booking.is_upcoming ? (
              <Badge variant="token" className="border-status-booked/30 bg-status-booked/10 text-status-booked">
                Upcoming
              </Badge>
            ) : null}
            <SeverityBadge severity={booking.storm.severity} withTooltip={false} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs">
          {hasTime ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 tabular-nums",
                    booking.is_upcoming ? "text-status-booked" : "text-ink-secondary",
                  )}
                >
                  <CalendarClock className="size-3" aria-hidden />
                  {formatFullDateTime(booking.scheduled_at)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {formatRelative(booking.scheduled_at)} · tracking.scheduled_at
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 text-status-awaiting">
                  <CalendarX className="size-3" aria-hidden />
                  Time not recorded
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Marked booked, but no <code className="font-mono">scheduled_at</code> came back from Calendly.
              </TooltipContent>
            </Tooltip>
          )}

          <Link
            to={`/leads?search=${encodeURIComponent(booking.email)}`}
            className="inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-accent"
          >
            <Hash className="size-3" aria-hidden />
            lead {booking.lead_id}
          </Link>
        </div>

        {booking.triage_reason ? (
          <p className="mt-2 max-w-prose border-l-2 border-line pl-3 text-2xs leading-relaxed text-ink-muted">
            {booking.triage_reason}
          </p>
        ) : null}
      </div>
    </motion.li>
  );
}

export function BookingsFeed({
  bookings,
  loading,
  limit,
}: {
  bookings: Booking[] | undefined;
  loading: boolean;
  limit?: number;
}) {
  if (loading && !bookings) {
    return (
      <div className="space-y-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!bookings?.length) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No bookings yet"
        description={
          <>
            A lead lands here once Booking Notify finds a Calendly booking for an interested customer, posts to{" "}
            <code className="font-mono text-xs">#leads-only</code> on Slack, and sets the status to{" "}
            <code className="font-mono text-xs">booked</code>.
          </>
        }
      />
    );
  }

  const shown = limit ? bookings.slice(0, limit) : bookings;

  return (
    <>
      <ul className="space-y-0">
        {shown.map((booking, index) => (
          <BookingRow key={booking.lead_id} booking={booking} index={index} />
        ))}
      </ul>
      <p className="flex items-center gap-1.5 border-t border-line pt-3 text-2xs text-ink-muted">
        <Slack className="size-3" aria-hidden />
        Each booking was announced in #leads-only when it was detected.
      </p>
    </>
  );
}
