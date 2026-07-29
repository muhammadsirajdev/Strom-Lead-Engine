import { CloudLightning } from "lucide-react";

import { CitiesPanel } from "@/components/cities/CitiesPanel";
import { ErrorState } from "@/components/common/ErrorState";
import { LastUpdated } from "@/components/common/LastUpdated";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Badge } from "@/components/ui/badge";
import { useCities } from "@/hooks/useDashboardQueries";
import { pluralize } from "@/lib/format";

export function CitiesPage() {
  const cities = useCities();
  const severe = cities.data?.severe_count ?? 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Service area"
        description="Each city in the customers table with its lead mix and the most recent storm context on file. Cities whose latest storm reads severe are highlighted — that's the same rule Lead Find uses to decide a city qualifies for outreach."
        actions={
          <>
            {severe > 0 ? (
              <Badge
                variant="token"
                className="border-severity-severe/30 bg-severity-severe/10 text-severity-severe"
              >
                <CloudLightning aria-hidden />
                {severe} severe {pluralize(severe, "city", "cities")}
              </Badge>
            ) : null}
            <LastUpdated updatedAt={cities.dataUpdatedAt} isFetching={cities.isFetching} />
          </>
        }
      />

      {cities.isError ? (
        <ErrorState error={cities.error} onRetry={() => void cities.refetch()} />
      ) : (
        <CitiesPanel cities={cities.data?.cities} loading={cities.isPending} />
      )}
    </div>
  );
}
