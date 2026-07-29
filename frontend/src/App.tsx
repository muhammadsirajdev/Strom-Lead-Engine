import { Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { BookingsPage } from "@/pages/BookingsPage";
import { CitiesPage } from "@/pages/CitiesPage";
import { LeadsPage } from "@/pages/LeadsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { PipelinePage } from "@/pages/PipelinePage";
import { ReviewPage } from "@/pages/ReviewPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="cities" element={<CitiesPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
