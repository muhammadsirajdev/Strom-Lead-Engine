import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pretty-printed JSON with a copy button. Used for the verbatim
 * `tracking.storm_context` in the lead drawer -- the raw column, unmassaged,
 * so an operator can see exactly what the agent stored.
 */
export function JsonBlock({
  value,
  className,
  emptyLabel = "null",
}: {
  value: unknown;
  className?: string;
  emptyLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = value === null || value === undefined ? emptyLabel : JSON.stringify(value, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked (insecure origin / permissions) -- ignore */
    }
  }

  return (
    <div className={cn("group relative", className)}>
      <pre className="scroll-subtle max-h-72 overflow-auto rounded-md border border-line bg-surface-inset p-3.5 pr-12 font-mono text-xs leading-relaxed text-ink-secondary">
        {text}
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy JSON"}
        className="absolute right-1.5 top-1.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        {copied ? <Check className="text-status-booked" /> : <Copy />}
      </Button>
    </div>
  );
}
