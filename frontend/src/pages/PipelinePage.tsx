import { ErrorState } from "@/components/common/ErrorState";
import { LastUpdated } from "@/components/common/LastUpdated";
import { SectionHeader } from "@/components/common/SectionHeader";
import { PipelineBoard, StageLegend } from "@/components/pipeline/PipelineBoard";
import { useLeads, useStats } from "@/hooks/useDashboardQueries";

export function PipelinePage() {
  const stats = useStats();
  // Enough rows to name a few examples in each column without pulling the
  // whole book of business into the browser.
  const leads = useLeads({ limit: 300 });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeader
          title="Stages"
          description="Four independent agents hand off to one another purely by writing tracking.status — no stage calls another directly."
        />
        <StageLegend />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Board"
          description="One column per status. Terminal columns are where a lead stops being polled."
          actions={<LastUpdated updatedAt={stats.dataUpdatedAt} isFetching={stats.isFetching} />}
        />
        {stats.isError ? (
          <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
        ) : (
          <PipelineBoard
            statusCounts={stats.data?.status_counts}
            leads={leads.data?.leads}
            total={stats.data?.total_leads ?? 0}
            loading={stats.isPending}
          />
        )}
      </section>
    </div>
  );
}
