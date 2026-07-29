import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Label-over-value pair used throughout the lead drawer and review cards. */
export function Field({
  label,
  children,
  className,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <dt className="text-2xs font-medium uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "break-words text-[0.8125rem] leading-relaxed text-ink",
          mono && "font-mono text-xs text-ink-secondary",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-4", className)}>{children}</dl>;
}
