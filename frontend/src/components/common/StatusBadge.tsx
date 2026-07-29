import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
  /** Hide the label for very tight layouts. Icon + tooltip still carry it. */
  iconOnly?: boolean;
  withTooltip?: boolean;
}

/**
 * Colour + icon + text label together -- status is never conveyed by colour
 * alone, which is what keeps the palette accessible under colour-vision
 * deficiency and in forced-colors mode.
 */
export function StatusBadge({
  status,
  className,
  iconOnly = false,
  withTooltip = true,
}: StatusBadgeProps) {
  const meta = statusMeta(status);
  const Icon = meta.icon;

  const badge = (
    <Badge variant="token" className={cn(meta.badge, className)}>
      <Icon aria-hidden />
      {iconOnly ? <span className="sr-only">{meta.label}</span> : meta.label}
    </Badge>
  );

  if (!withTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium text-ink">{meta.label}</p>
        <p className="mt-0.5">{meta.description}</p>
        <p className="mt-1 text-ink-muted">
          Written by {meta.writtenBy}
          {meta.terminal ? " · terminal status" : ""}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
