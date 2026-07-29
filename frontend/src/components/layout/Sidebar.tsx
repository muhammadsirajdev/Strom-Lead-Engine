import {
  CalendarCheck,
  CloudLightning,
  Columns3,
  LayoutDashboard,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface NavCounts {
  leads?: number;
  review?: number;
  bookings?: number;
  severeCities?: number;
}

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true, count: undefined },
  { to: "/leads", label: "Leads", icon: Users, end: false, count: "leads" },
  { to: "/pipeline", label: "Pipeline", icon: Columns3, end: false, count: undefined },
  { to: "/cities", label: "Cities & weather", icon: CloudLightning, end: false, count: "severeCities" },
  { to: "/review", label: "Review queue", icon: ShieldCheck, end: false, count: "review" },
  { to: "/bookings", label: "Bookings", icon: CalendarCheck, end: false, count: "bookings" },
] as const;

export function Sidebar({ counts }: { counts: NavCounts }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
        <span className="flex size-7 items-center justify-center rounded-md bg-accent/12 text-accent">
          <Zap className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 leading-none">
          <p className="truncate text-[0.8125rem] font-semibold tracking-tight text-ink">StormLead</p>
          <p className="mt-1 truncate text-2xs text-ink-muted">Operations</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Sections">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const badgeValue = item.count ? counts[item.count as keyof NavCounts] : undefined;
          const showBadge = typeof badgeValue === "number" && badgeValue > 0;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.8125rem] font-medium transition-colors",
                  isActive
                    ? "bg-accent/10 text-ink"
                    : "text-ink-secondary hover:bg-surface-inset hover:text-ink",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active rail: a second, non-colour cue alongside the tint. */}
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full transition-colors",
                      isActive ? "bg-accent" : "bg-transparent",
                    )}
                    aria-hidden
                  />
                  <Icon
                    className={cn("size-4 shrink-0", isActive ? "text-accent" : "text-ink-muted")}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {showBadge ? (
                    <Badge
                      variant="token"
                      className={cn(
                        "px-1.5 tabular-nums",
                        item.count === "review"
                          ? "border-status-awaiting/30 bg-status-awaiting/10 text-status-awaiting"
                          : item.count === "severeCities"
                            ? "border-severity-severe/30 bg-severity-severe/10 text-severity-severe"
                            : "border-line-strong bg-surface-inset text-ink-muted",
                      )}
                    >
                      {badgeValue}
                    </Badge>
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-line p-4">
        <p className="text-2xs leading-relaxed text-ink-muted">
          Read-only console. Sends, triage and bookings are performed by the pipeline agents.
        </p>
      </div>
    </aside>
  );
}
