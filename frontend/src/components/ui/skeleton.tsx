import { cn } from "@/lib/utils";

/**
 * Shimmering placeholder. Used for first loads only -- on refetch the previous
 * render is held at reduced opacity instead, so polling never causes a
 * skeleton flash or a layout jump.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-surface-inset", className)}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  );
}

export { Skeleton };
