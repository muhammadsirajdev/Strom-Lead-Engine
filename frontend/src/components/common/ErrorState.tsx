import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  title?: string;
}

function describe(error: unknown): { message: string; detail?: string } {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      detail: error.status ? `${error.status} · ${error.path}` : error.path,
    };
  }
  if (error instanceof Error) return { message: error.message };
  return { message: "An unexpected error occurred." };
}

export function ErrorState({ error, onRetry, className, title = "Couldn't load this view" }: ErrorStateProps) {
  const { message, detail } = describe(error);

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-md border border-status-unsubscribed/25 bg-status-unsubscribed/[0.06] px-5 py-5",
        className,
      )}
      role="alert"
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-status-unsubscribed/12 text-status-unsubscribed">
        <AlertTriangle className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-[0.8125rem] leading-relaxed text-ink-secondary">{message}</p>
        {detail ? <p className="font-mono text-xs text-ink-muted">{detail}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
          <RefreshCw />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
