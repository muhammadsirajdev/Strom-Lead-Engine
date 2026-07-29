import { RefreshCw } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFullDateTime, formatRelative } from "@/lib/format";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";

interface LastUpdatedProps {
  /** `dataUpdatedAt` from the TanStack Query result. */
  updatedAt: number | undefined;
  isFetching?: boolean;
  label?: string;
  className?: string;
}

/**
 * "Updated 8s ago", with a quiet spinner while a poll is in flight. Ticks on
 * its own so the age stays truthful between refetches.
 */
export function LastUpdated({ updatedAt, isFetching, label = "Updated", className }: LastUpdatedProps) {
  // Re-render every 5s so a young timestamp counts up smoothly.
  useNow(5_000);

  if (!updatedAt) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-2xs text-ink-muted", className)}>
        <span className="size-1.5 rounded-full bg-ink-muted/50" />
        Not loaded
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex items-center gap-1.5 text-2xs tabular-nums text-ink-muted", className)}
          aria-live="polite"
        >
          {isFetching ? (
            <RefreshCw className="size-3 animate-spin text-accent" aria-hidden />
          ) : (
            <span className="size-1.5 rounded-full bg-status-booked" aria-hidden />
          )}
          {label} {formatRelative(new Date(updatedAt))}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-ink">{formatFullDateTime(new Date(updatedAt))}</p>
        <p className="mt-0.5">{isFetching ? "Refreshing now…" : "Polls automatically every 12s."}</p>
      </TooltipContent>
    </Tooltip>
  );
}
