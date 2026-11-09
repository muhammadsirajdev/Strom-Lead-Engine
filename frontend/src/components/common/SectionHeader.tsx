import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  description?: ReactNode;
  /** Right-aligned slot: last-updated stamps, filters, counts. */
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-2", className)}>
      <div className="min-w-0 space-y-1.5">
        <h2 className="font-display text-[1.625rem] font-semibold leading-none tracking-[0.005em] text-ink">{title}</h2>
        {description ? (
          <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
