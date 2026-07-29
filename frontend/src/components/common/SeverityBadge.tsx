import { CloudLightning, CloudOff, Wind } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { severityMeta } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Severity } from "@/types/api";

const ICONS: Record<Severity, typeof Wind> = {
  severe: CloudLightning,
  elevated: Wind,
  calm: Wind,
  unknown: CloudOff,
};

export function SeverityBadge({
  severity,
  className,
  withTooltip = true,
}: {
  severity: Severity | null | undefined;
  className?: string;
  withTooltip?: boolean;
}) {
  const meta = severityMeta(severity);
  const Icon = ICONS[meta.value];

  const badge = (
    <Badge variant="token" className={cn(meta.badge, className)}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  );

  if (!withTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent>{meta.description}</TooltipContent>
    </Tooltip>
  );
}
