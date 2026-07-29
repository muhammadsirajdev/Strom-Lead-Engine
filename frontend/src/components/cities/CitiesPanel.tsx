import { CloudOff, MapPin, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, formatRelative, pluralize } from "@/lib/format";
import { STATUS_ORDER, severityMeta, statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { CityStorm } from "@/types/api";

/**
 * Service-area cities with their lead mix and the most recent storm context on
 * file. No live weather call happens here -- the storm shown is read from the
 * newest `tracking.storm_context` for a customer in that city, exactly as the
 * pipeline recorded it.
 *
 * The city itself always comes from `customers.city`, never from
 * `storm_context.city`: the seed generator's JSONB shape has no city key at
 * all, so grouping on it would silently drop those rows.
 */

/** Stacked status mix as one thin bar. 2px surface gaps separate segments. */
function StatusMixBar({ city }: { city: CityStorm }) {
  const total = city.lead_count;
  if (total === 0) {
    return <div className="h-1.5 rounded-full bg-surface-inset" aria-hidden />;
  }

  const segments = STATUS_ORDER.map((status) => ({
    status,
    count: city.status_counts.find((s) => s.status === status)?.count ?? 0,
  })).filter((segment) => segment.count > 0);

  return (
    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" role="presentation">
      {segments.map((segment) => {
        const meta = statusMeta(segment.status);
        return (
          <Tooltip key={segment.status}>
            <TooltipTrigger asChild>
              <div
                className={cn("h-full min-w-[3px] rounded-full first:rounded-l-full last:rounded-r-full", meta.bar)}
                style={{ flexGrow: segment.count }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {segment.count} {pluralize(segment.count, "lead")} · {meta.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function CityCard({ city }: { city: CityStorm }) {
  const meta = severityMeta(city.severity);
  const severe = city.severity === "severe";

  return (
    <Link
      to={`/leads?city=${encodeURIComponent(city.city)}`}
      className={cn(
        "group flex flex-col gap-3 rounded-lg border bg-surface p-4 shadow-card transition-colors",
        // Severe cities carry a tinted border *and* the severity badge, so the
        // highlight never rests on colour alone.
        severe
          ? "border-severity-severe/35 hover:border-severity-severe/60"
          : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold tracking-tight text-ink">
            <MapPin className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
            {city.city}
            <span className="text-2xs font-normal text-ink-muted">{city.state}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-2xs text-ink-muted">
            <Users className="size-3" aria-hidden />
            <span className="tabular-nums">{city.opted_in_count}</span> opted in of{" "}
            <span className="tabular-nums">{city.customer_count}</span>
          </p>
        </div>
        <SeverityBadge severity={city.severity} withTooltip={false} className="shrink-0" />
      </div>

      <div className="space-y-1.5">
        {city.latest_storm?.label ? (
          <>
            <p className={cn("text-[0.8125rem] font-medium leading-snug", meta.text)}>
              {city.latest_storm.label}
            </p>
            <p className="text-2xs text-ink-muted">
              {city.latest_storm.date ? `Storm dated ${formatDate(city.latest_storm.date)}` : "Undated storm"}
              {city.latest_storm_at ? ` · recorded ${formatRelative(city.latest_storm_at)}` : ""}
            </p>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-[0.8125rem] text-ink-muted">
            <CloudOff className="size-3.5" aria-hidden />
            No storm context recorded yet
          </p>
        )}
      </div>

      <div className="mt-auto space-y-2 border-t border-line pt-3">
        <div className="flex items-baseline justify-between gap-2 text-2xs">
          <span className="text-ink-muted">
            <span className="text-sm font-semibold tabular-nums text-ink">{city.lead_count}</span>{" "}
            {pluralize(city.lead_count, "lead")}
          </span>
          <span className="tabular-nums text-ink-muted">
            {city.active_lead_count} active · {city.booked_count} booked
          </span>
        </div>
        <StatusMixBar city={city} />
      </div>
    </Link>
  );
}

export function CitiesPanel({
  cities,
  loading,
  limit,
}: {
  cities: CityStorm[] | undefined;
  loading: boolean;
  /** Cap the grid on the overview; the Cities page passes no limit. */
  limit?: number;
}) {
  if (loading && !cities) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-1.5 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!cities?.length) {
    return (
      <EmptyState
        icon={MapPin}
        title="No service-area cities yet"
        description="Cities are derived from the customers table. Once customers exist, each city appears here with its lead mix and the latest storm context on file."
      />
    );
  }

  const shown = limit ? cities.slice(0, limit) : cities;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {shown.map((city) => (
        <CityCard key={`${city.city}-${city.state}`} city={city} />
      ))}
    </div>
  );
}
