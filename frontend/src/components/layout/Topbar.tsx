import { useQueryClient } from "@tanstack/react-query";
import { Database, Moon, RefreshCw, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { LogoMark } from "@/components/brand/Logo";
import { NAV_ITEMS } from "@/components/layout/Sidebar";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useApiHealth } from "@/hooks/useDashboardQueries";
import { cn } from "@/lib/utils";

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Overview",
    subtitle: "From storm detection to booked inspection",
  },
  "/leads": { title: "Leads", subtitle: "One row per tracking record — the outreach book of business" },
  "/pipeline": { title: "Pipeline", subtitle: "Where every lead currently sits in the status lifecycle" },
  "/cities": { title: "Cities & weather", subtitle: "Service area with the latest storm context on file per city" },
  "/review": { title: "Review queue", subtitle: "Drafts paused at the human-review gate, awaiting a decision" },
  "/bookings": { title: "Bookings", subtitle: "Booked inspections and the appointments on the calendar" },
};

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("stormlead-theme", dark ? "dark" : "light");
    } catch {
      // Storage can be blocked (private windows); the toggle still works per session.
    }
  }, [dark]);

  return { dark, toggle: () => setDark((value) => !value) };
}

export function Topbar() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const health = useApiHealth();
  const { dark, toggle } = useTheme();

  const meta = TITLES[pathname] ?? { title: "StormLead", subtitle: "Operations console" };
  const dbDown = health.isError || health.data?.database === false;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/80 backdrop-blur-md">
      <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <LogoMark className="size-7 shrink-0 lg:hidden" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight text-ink">{meta.title}</h1>
            <p className="mt-0.5 truncate text-xs text-ink-muted">{meta.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="token"
                className={cn(
                  dbDown
                    ? "border-status-unsubscribed/30 bg-status-unsubscribed/10 text-status-unsubscribed"
                    : "border-status-booked/30 bg-status-booked/10 text-status-booked",
                )}
              >
                <Database aria-hidden />
                {dbDown ? "Database unreachable" : "Postgres connected"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {dbDown ? (
                <p>
                  The API could not query Postgres. Check <code className="font-mono">DATABASE_URL</code> and
                  that the backend is running.
                </p>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-ink">Read-only connection is healthy.</p>
                  <p>
                    Checkpoint tables: {health.data?.checkpointer_tables ? "present" : "absent"} Review
                    ledger: {health.data?.pending_review_table ? "present" : "absent"}
                  </p>
                </div>
              )}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void queryClient.invalidateQueries()}
                aria-label="Refresh all data now"
              >
                <RefreshCw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh every query now</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggle}
                aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              >
                {dark ? <Sun /> : <Moon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{dark ? "Light theme" : "Dark theme"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Below lg the sidebar is hidden, so sections move into a scrolling strip. */}
      <nav
        className="scroll-subtle -mt-1 flex gap-1 overflow-x-auto px-4 pb-2.5 sm:px-6 lg:hidden"
        aria-label="Sections"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                isActive ? "bg-ink text-page" : "text-ink-secondary hover:bg-surface-inset hover:text-ink",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
