import { Link } from "react-router-dom";

import { BookingsFeed } from "@/components/bookings/BookingsFeed";
import { CitiesPanel } from "@/components/cities/CitiesPanel";
import { ErrorState } from "@/components/common/ErrorState";
import { LastUpdated } from "@/components/common/LastUpdated";
import { SectionHeader } from "@/components/common/SectionHeader";
import { PipelineHealthCard } from "@/components/overview/PipelineHealthCard";
import { StatusComposition } from "@/components/overview/StatusComposition";
import { StormHero } from "@/components/overview/StormHero";
import { Card, CardContent } from "@/components/ui/card";
import { useBookings, useCities, useStats } from "@/hooks/useDashboardQueries";

function SeeAll({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="rounded-md text-xs font-medium text-accent underline-offset-4 transition-colors hover:text-accent-hover hover:underline"
    >
      {children}
    </Link>
  );
}

export function OverviewPage() {
  const stats = useStats();
  const cities = useCities();
  const bookings = useBookings(8);

  return (
    <div className="space-y-12">
      {stats.isError ? (
        <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      ) : (
        <div className="space-y-3">
          <StormHero stats={stats.data} cities={cities.data?.cities} loading={stats.isPending} />
          <div className="flex justify-end px-1">
            <LastUpdated updatedAt={stats.dataUpdatedAt} isFetching={stats.isFetching} />
          </div>
        </div>
      )}

      {!stats.isError ? (
        <section className="space-y-5">
          <SectionHeader
            title="Health of the pipeline"
            description="Conversion between stages, and anything waiting on a person."
          />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <StatusComposition stats={stats.data} loading={stats.isPending} />
            <PipelineHealthCard health={stats.data?.health} loading={stats.isPending} />
          </div>
        </section>
      ) : null}

      <section className="space-y-5">
        <SectionHeader
          title="Cities & weather"
          description="The latest storm the pipeline recorded for each city it serves."
          actions={<SeeAll to="/cities">See all cities</SeeAll>}
        />
        {cities.isError ? (
          <ErrorState error={cities.error} onRetry={() => void cities.refetch()} />
        ) : (
          <CitiesPanel cities={cities.data?.cities} loading={cities.isPending} limit={4} />
        )}
      </section>

      <section className="space-y-5">
        <SectionHeader
          title="Recent bookings"
          description={
            bookings.data
              ? `${bookings.data.total} inspections booked through Calendly, ${bookings.data.upcoming_count} still upcoming.`
              : "Inspections that made it all the way to a Calendly booking."
          }
          actions={<SeeAll to="/bookings">See all bookings</SeeAll>}
        />
        <Card>
          <CardContent className="pt-5">
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
