import { Outlet } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { useReviewQueue, useStats } from "@/hooks/useDashboardQueries";
import { useCities } from "@/hooks/useDashboardQueries";

/**
 * Fixed sidebar + sticky topbar, content scrolls independently. Nav badge
 * counts come from the same polled queries the pages use, so they cost no
 * extra requests.
 */
export function AppShell() {
  const stats = useStats();
  const review = useReviewQueue();
  const cities = useCities();

  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar
        counts={{
          leads: stats.data?.total_leads,
          review: review.data?.total_pending_drafts,
          bookings: stats.data?.status_counts.find((s) => s.status === "booked")?.count,
          severeCities: cities.data?.severe_count,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[100rem] flex-1 px-5 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
