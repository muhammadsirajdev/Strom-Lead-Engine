import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ErrorState } from "@/components/common/ErrorState";
import { LastUpdated } from "@/components/common/LastUpdated";
import { SectionHeader } from "@/components/common/SectionHeader";
import { LeadDetailDrawer } from "@/components/leads/LeadDetailDrawer";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { useCities, useLeads } from "@/hooks/useDashboardQueries";
import { STATUS_ORDER } from "@/lib/status";
import type { LeadStatus, LeadSummary } from "@/types/api";

/** Debounce the search box so typing doesn't fire a request per keystroke. */
function useDebounced<T>(value: T, delayMs = 280): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

function isLeadStatus(value: string | null): value is LeadStatus {
  return value !== null && (STATUS_ORDER as string[]).includes(value);
}

export function LeadsPage() {
  // Filters live in the URL, so a filtered view is linkable and the KPI tiles
  // and pipeline board can deep-link straight into it.
  const [searchParams, setSearchParams] = useSearchParams();

  const statusParam = searchParams.get("status");
  const status = isLeadStatus(statusParam) ? statusParam : null;
  const city = searchParams.get("city");
  const urlSearch = searchParams.get("search") ?? "";

  const [search, setSearch] = useState(urlSearch);
  const debouncedSearch = useDebounced(search);

  // Keep the input in step when navigation changes the URL underneath it.
  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  function updateParams(next: Partial<{ status: string | null; city: string | null; search: string | null }>) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        for (const [key, value] of Object.entries(next)) {
          if (value === null || value === "") params.delete(key);
          else params.set(key, value);
        }
        return params;
      },
      { replace: true },
    );
  }

  // Push the debounced value back into the URL without spamming history.
  useEffect(() => {
    if (debouncedSearch !== urlSearch) {
      updateParams({ search: debouncedSearch || null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const leads = useLeads({
    status,
    city,
    search: debouncedSearch.trim() || null,
  });
  const cities = useCities();

  const cityOptions = useMemo(
    () => (cities.data?.cities ?? []).map((entry) => entry.city).sort((a, b) => a.localeCompare(b)),
    [cities.data],
  );

  const [selected, setSelected] = useState<LeadSummary | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Leads"
        description="One row per tracking record, joined to its customer. Select a row for the full record, including the raw storm_context JSONB."
        actions={<LastUpdated updatedAt={leads.dataUpdatedAt} isFetching={leads.isFetching} />}
      />

      {leads.isError ? (
        <ErrorState error={leads.error} onRetry={() => void leads.refetch()} />
      ) : (
        <LeadsTable
          leads={leads.data?.leads ?? []}
          total={leads.data?.total ?? 0}
          returned={leads.data?.returned ?? 0}
          loading={leads.isPending}
          refreshing={leads.isFetching && !leads.isPending}
          cityOptions={cityOptions}
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={(value) => updateParams({ status: value })}
          city={city}
          onCityChange={(value) => updateParams({ city: value })}
          selectedLeadId={drawerOpen ? (selected?.lead_id ?? null) : null}
          onRowClick={(lead) => {
            setSelected(lead);
            setDrawerOpen(true);
          }}
        />
      )}

      <LeadDetailDrawer lead={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
