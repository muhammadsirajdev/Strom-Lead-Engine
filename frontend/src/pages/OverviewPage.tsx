import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { BookingsFeed } from "@/components/bookings/BookingsFeed";
import { CitiesPanel } from "@/components/cities/CitiesPanel";
import { ErrorState } from "@/components/common/ErrorState";
import { LastUpdated } from "@/components/common/LastUpdated";
import { SectionHeader } from "@/components/common/SectionHeader";
import { FunnelChart } from "@/components/overview/FunnelChart";
import { KpiRow } from "@/components/overview/KpiRow";
import { PipelineHealthCard } from "@/components/overview/PipelineHealthCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookings, useCities, useStats } from "@/hooks/useDashboardQueries";

export function OverviewPage() {
  const stats = useStats();
  const cities = useCities();
  const bookings = useBookings(8);

  return (
    <div className="space-y-8">
      {/* KPI overview -------------------------------------------------- */}
      <section className="space-y-3">
        <SectionHeader
          title="Pipeline at a glance"
          description="Every lead the pipeline has created, by lifecycle status. Select a tile to open that slice of the leads table."
          actions={<LastUpdated updatedAt={stats.dataUpdatedAt} isFetching={stats.isFetching} />}
        />
        {stats.isError ? (
          <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
        ) : (
          <KpiRow stats={stats.data} loading={stats.isPending} />
        )}
      </section>

      {/* Funnel + health ---------------------------------------------- */}
      {!stats.isError ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <FunnelChart funnel={stats.data?.funnel} loading={stats.isPending} />
          <PipelineHealthCard health={stats.data?.health} loading={stats.isPending} />
        </section>
      ) : null}

      {/* Cities & weather --------------------------------------------- */}
      <section className="space-y-3">
        <SectionHeader
          title="Cities & weather"
          description="Latest storm context recorded per city, read from tracking.storm_context — not a live weather call."
          actions={
            <>
              <LastUpdated updatedAt={cities.dataUpdatedAt} isFetching={cities.isFetching} />
              <Link
                to="/cities"
                className="inline-flex items-center gap-1 text-2xs text-ink-muted transition-colors hover:text-accent"
              >
                All cities
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </>
          }
        />
        {cities.isError ? (
          <ErrorState error={cities.error} onRetry={() => void cities.refetch()} />
        ) : (
          <CitiesPanel cities={cities.data?.cities} loading={cities.isPending} limit={4} />
        )}
      </section>

      {/* Bookings feed ------------------------------------------------ */}
      <section className="space-y-3">
        <SectionHeader
          title="Recent bookings"
          description="Inspections that made it all the way through to a Calendly booking."
          actions={
            <>
              <LastUpdated updatedAt={bookings.dataUpdatedAt} isFetching={bookings.isFetching} />
              <Link
                to="/bookings"
                className="inline-flex items-center gap-1 text-2xs text-ink-muted transition-colors hover:text-accent"
              >
                All bookings
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </>
          }
        />
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>
              {bookings.data ? `${bookings.data.total} booked` : "Booked inspections"}
              {bookings.data?.upcoming_count ? (
                <span className="ml-2 font-normal text-ink-muted">
                  · {bookings.data.upcoming_count} upcoming
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bookings.isError ? (
              <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
            ) : (
              <BookingsFeed bookings={bookings.data?.bookings} loading={bookings.isPending} limit={6} />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
