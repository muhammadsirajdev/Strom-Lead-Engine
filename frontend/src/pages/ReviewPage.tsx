import { Info } from "lucide-react";

import { ErrorState } from "@/components/common/ErrorState";
import { LastUpdated } from "@/components/common/LastUpdated";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ReviewQueuePanel } from "@/components/review/ReviewQueuePanel";
import { Badge } from "@/components/ui/badge";
import { useReviewQueue } from "@/hooks/useDashboardQueries";
import { pluralize } from "@/lib/format";

export function ReviewPage() {
  const queue = useReviewQueue();
  const pending = queue.data?.total_pending_drafts ?? 0;
  const threads = queue.data?.total_threads ?? 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Human review gate"
        description="Lead Find never sends without a person approving it. These runs are checkpointed mid-graph in Postgres, genuinely paused, and nothing sends until each draft is approved, rejected, or rewritten."
        actions={
          <>
            {pending > 0 ? (
              <Badge
                variant="token"
                className="border-status-awaiting/30 bg-status-awaiting/10 text-status-awaiting"
              >
                {pending} {pluralize(pending, "draft")} across {threads} {pluralize(threads, "run")}
              </Badge>
            ) : null}
            <LastUpdated updatedAt={queue.dataUpdatedAt} isFetching={queue.isFetching} />
          </>
        }
      />

      <div className="flex items-start gap-3 rounded-md border border-accent/25 bg-accent/[0.06] px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <p className="text-[0.8125rem] leading-relaxed text-ink-secondary">
          <span className="font-medium text-ink">Display only.</span> This build reads the queue; it can't
          resolve it. Approve, reject and rewrite decisions still go through{" "}
          <code className="font-mono text-xs">uv run python lead_find_agent.py --review</code>, which walks
          the same drafts in the terminal and resumes the paused graph.
        </p>
      </div>

      {queue.isError ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : (
        <ReviewQueuePanel queue={queue.data} loading={queue.isPending} />
      )}
    </div>
  );
}
