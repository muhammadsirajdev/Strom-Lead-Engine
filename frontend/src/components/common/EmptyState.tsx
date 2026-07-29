import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Say what this view *will* show and what makes it appear. */
  description: ReactNode;
  /** Optional next step -- usually the command that produces data. */
  hint?: ReactNode;
  className?: string;
}

/**
 * A real empty state: it explains why the view is empty and what would fill
 * it, rather than showing a shrug. Left-aligned inside its card, not a
 * centered hero.
 */
export function EmptyState({ icon: Icon, title, description, hint, className }: EmptyStateProps) {
  return (
    <div className={cn("flex items-start gap-4 rounded-md border border-dashed border-line-strong/70 px-5 py-6", className)}>
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-inset text-ink-muted">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="max-w-prose text-[0.8125rem] leading-relaxed text-ink-muted">{description}</p>
        {hint ? <div className="pt-1 text-[0.8125rem] text-ink-secondary">{hint}</div> : null}
      </div>
    </div>
  );
}

/** Inline monospace command, sized to sit inside body copy. */
export function CommandHint({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-line bg-surface-inset px-1.5 py-0.5 font-mono text-xs text-ink-secondary">
      {children}
    </code>
  );
}
