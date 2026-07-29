import { CalendarCheck, CalendarClock, CalendarX } from "lucide-react";

import { BookingsFeed } from "@/components/bookings/BookingsFeed";
import { ErrorState } from "@/components/common/ErrorState";
import { LastUpdated } from "@/components/common/LastUpdated";
import { SectionHeader } from "@/components/common/SectionHeader";
import { StatTile } from "@/components/common/StatTile";
import { Card, CardContent } from "@/components/ui/card";
import { useBookings } from "@/hooks/useDashboardQueries";

export function BookingsPage() {
  const bookings = useBookings(100);
  const data = bookings.data;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Bookings & notifications"
        description="Leads that reached a booked inspection. Booking Notify detects the Calendly booking, posts to #leads-only on Slack, then writes status='booked' and scheduled_at."
        actions={<LastUpdated updatedAt={bookings.dataUpdatedAt} isFetching={bookings.isFetching} />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Booked total"
          value={data?.total}
          icon={CalendarCheck}
          tone="text-status-booked"
          loading={bookings.isPending}
          hint="tracking rows with status='booked'."
        />
        <StatTile
          label="Upcoming"
          value={data?.upcoming_count}
          icon={CalendarClock}
          tone="text-status-booked"
          loading={bookings.isPending}
          meta="Appointment still in the future"
          hint="scheduled_at is later than now."
        />
        <StatTile
          label="Time not recorded"
          value={data?.unscheduled_count}
          icon={CalendarX}
          tone="text-status-awaiting"
          loading={bookings.isPending}
          meta="Booked without a scheduled_at"
          hint="Booking Notify marked these booked but Calendly returned no start time."
        />
      </div>

      <Card>
        <CardContent className="pt-5">
          {bookings.isError ? (
            <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
          ) : (
            <BookingsFeed bookings={data?.bookings} loading={bookings.isPending} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
