import {
  CalendarCheck,
  CloudLightning,
  Columns3,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { Wordmark } from "@/components/brand/Logo";
import { PIPELINE_STAGES } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface NavCounts {
  leads?: number;
  review?: number;
  bookings?: number;
  severeCities?: number;
}

export const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true, count: undefined },
  { to: "/leads", label: "Leads", icon: Users, end: false, count: "leads" },
  { to: "/pipeline", label: "Pipeline", icon: Columns3, end: false, count: undefined },
  { to: "/cities", label: "Cities & weather", icon: CloudLightning, end: false, count: "severeCities" },
  { to: "/review", label: "Review queue", icon: ShieldCheck, end: false, count: "review" },
  { to: "/bookings", label: "Bookings", icon: CalendarCheck, end: false, count: "bookings" },
] as const;

/** Counts that mean "a person should look" get a coloured chip; the rest stay neutral. */
const COUNT_TONE: Partial<Record<keyof NavCounts, string>> = {
  review: "bg-status-awaiting/15 text-status-awaiting",
  severeCities: "bg-severity-severe/12 text-severity-severe",
};

export function Sidebar({ counts }: { counts: NavCounts }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="px-6 pb-6 pt-6">
        <Wordmark />
        <p className="mt-2 text-xs leading-snug text-ink-muted">
          Storm-triggered roofing outreach, run by four agents
        </p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Sections">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const key = item.count as keyof NavCounts | undefined;
          const badgeValue = key ? counts[key] : undefined;
          const showBadge = typeof badgeValue === "number" && badgeValue > 0;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-ink font-medium text-page"
                    : "text-ink-secondary hover:bg-surface-inset hover:text-ink",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn("size-4 shrink-0", isActive ? "text-page" : "text-ink-muted")}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {showBadge ? (
                    <span
                      className={cn(
                        "min-w-6 rounded-full px-1.5 py-px text-center text-2xs font-semibold tabular-nums",
                        isActive
                          ? "bg-page/15 text-page"
                          : ((key && COUNT_TONE[key]) ?? "bg-surface-inset text-ink-muted"),
                      )}
                    >
                      {badgeValue}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* The crew: what actually runs behind this read-only console. */}
      <div className="border-t border-line px-6 py-5">
        <p className="text-xs font-medium text-ink-secondary">Agents on schedule</p>
        <ul className="mt-3 space-y-2">
          {PIPELINE_STAGES.map((stage) => (
            <li key={stage.key} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-ink">{stage.name}</span>
              <span className="text-ink-muted">{stage.cadence}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-2xs leading-relaxed text-ink-muted">
          This console is read-only. Every email is approved by a person before it sends.
        </p>
      </div>
    </aside>
  );
}
