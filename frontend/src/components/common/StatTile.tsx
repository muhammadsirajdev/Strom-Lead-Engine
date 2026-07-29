import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: number | string | null | undefined;
  icon?: LucideIcon;
  /** Secondary line under the value: a share, a count, a caveat. */
  meta?: ReactNode;
  hint?: string;
  /** Token class for the icon + accent rule, e.g. `text-status-booked`. */
  tone?: string;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * The number *is* the chart here -- a single current value gets a stat tile,
 * never a one-bar bar chart. Proportional (not tabular) figures, because
 * tabular digits make a large standalone number read loose.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  meta,
  hint,
  tone = "text-ink-muted",
  loading = false,
  onClick,
  className,
}: StatTileProps) {
  const display = typeof value === "number" ? formatNumber(value) : (value ?? "—");
  const interactive = Boolean(onClick);

  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-2xs font-medium uppercase tracking-wider text-ink-muted">
          {label}
        </span>
        {Icon ? <Icon className={cn("size-3.5 shrink-0", tone)} aria-hidden /> : null}
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-8 w-16" />
      ) : (
        <motion.p
          key={String(display)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="mt-2.5 text-3xl font-semibold leading-none tracking-tight text-ink"
        >
          {display}
        </motion.p>
      )}

      <div className="mt-2 min-h-[1.125rem] text-xs leading-tight text-ink-muted">
        {loading ? <Skeleton className="h-3 w-24" /> : meta}
      </div>
    </>
  );

  const tile = interactive ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-lg border border-line bg-surface px-4 py-3.5 text-left shadow-card transition-colors",
        "hover:border-line-strong hover:bg-surface-raised",
        className,
      )}
    >
      {body}
    </button>
  ) : (
    <div className={cn("rounded-lg border border-line bg-surface px-4 py-3.5 shadow-card", className)}>
      {body}
    </div>
  );

  if (!hint) return tile;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{tile}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
