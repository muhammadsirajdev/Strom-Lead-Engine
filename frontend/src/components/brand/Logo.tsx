import { cn } from "@/lib/utils";

/**
 * StormLead mark: two isobars bending around a low-pressure centre, with the
 * lightning-amber dot marking the storm cell the pipeline reacts to.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-ink" />
      <path
        d="M5 21c4-9 13-12 22-9"
        className="stroke-page"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
      <path
        d="M7 26c3-6 10-9 18-7"
        className="stroke-page"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="22.5" cy="9" r="3" className="fill-signal" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[1.375rem] font-semibold leading-none tracking-[0.01em] text-ink">
        StormLead
      </span>
    </span>
  );
}
