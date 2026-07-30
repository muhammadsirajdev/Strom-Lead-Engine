import { motion } from "framer-motion";
import {
  Check,
  Clock,
  Info,
  MapPin,
  PencilLine,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";

import { CommandHint, EmptyState } from "@/components/common/EmptyState";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFullDateTime, formatRelative, humanize, pluralize } from "@/lib/format";
import type { ReviewDraft, ReviewQueue, ReviewThread } from "@/types/api";

/**
 * The human-in-the-loop gate, read-only in this build.
 *
 * `run_a_pending_review` only indexes which graph threads are paused; the draft
 * bodies come from the LangGraph checkpointer's `drafts` channel, which the
 * backend reads back through AsyncPostgresSaver.
 *
 * Approve / Reject / Rewrite are rendered as disabled placeholders on purpose:
 * resolving a review is still done by `python -m agents.lead_find_agent --review`, and a
 * button that looks live but isn't would be worse than one that says so.
 */

function DisabledActions({ draftLabel }: { draftLabel: string }) {
  const actions = [
    { label: "Approve", icon: Check, variant: "default" as const },
    { label: "Reject", icon: X, variant: "outline" as const },
    { label: "Rewrite", icon: PencilLine, variant: "outline" as const },
  ];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Wrapper keeps the tooltip reachable even though the buttons are
            disabled and therefore don't fire pointer events. */}
        <div className="flex flex-wrap items-center gap-2">
          {actions.map(({ label, icon: Icon, variant }) => (
            <Button key={label} variant={variant} size="sm" disabled aria-disabled>
              <Icon />
              {label}
            </Button>
          ))}
          <span className="text-2xs text-ink-muted">Read-only in this build</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium text-ink">Not wired up yet</p>
        <p className="mt-1">
          The dashboard exposes what's waiting; it can't resolve {draftLabel} yet. Approve, reject and rewrite
          decisions still go through the CLI.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function DraftCard({ draft, index }: { draft: ReviewDraft; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 6) * 0.03, ease: "easeOut" }}
      className="rounded-lg border border-line bg-surface-inset/40 p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] font-medium text-ink">
            {draft.full_name ?? `Customer ${draft.customer_id}`}
          </p>
          <p className="mt-0.5 truncate text-2xs text-ink-muted">
            {draft.to_email}
            {draft.city ? (
              <>
                {" · "}
                {draft.city}
                {draft.state ? `, ${draft.state}` : ""}
              </>
            ) : null}
            {draft.roof_material ? (
              <>
                {" · "}
                {humanize(draft.roof_material)}
                {draft.roof_age_years !== null ? `, ${draft.roof_age_years}y` : ""}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SeverityBadge severity={draft.storm.severity} />
          <Badge variant="token" className="border-status-awaiting/30 bg-status-awaiting/10 text-status-awaiting">
            <Clock aria-hidden />
            {humanize(draft.status)}
          </Badge>
        </div>
      </header>

      {draft.storm.label ? (
        <p className="mt-2.5 text-2xs text-ink-secondary">
          Storm context: <span className="text-ink">{draft.storm.label}</span>
          {draft.storm.date ? <span className="text-ink-muted"> · {draft.storm.date}</span> : null}
        </p>
      ) : null}

      {draft.feedback ? (
        <p className="mt-2.5 rounded-md border-l-2 border-status-awaiting/60 bg-status-awaiting/[0.07] px-3 py-2 text-2xs leading-relaxed text-ink-secondary">
          <span className="font-medium text-ink">Reviewer feedback carried into this rewrite: </span>
          {draft.feedback}
        </p>
      ) : null}

      <Separator className="my-3.5" />

      <div className="space-y-2">
        <p className="text-2xs font-medium uppercase tracking-wider text-ink-muted">Subject</p>
        <p className="text-[0.8125rem] font-medium leading-snug text-ink">{draft.subject || "—"}</p>
      </div>

      <div className="mt-3 space-y-2">
        <p className="text-2xs font-medium uppercase tracking-wider text-ink-muted">Generated body</p>
        <div className="scroll-subtle max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-surface px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink-secondary">
          {draft.body || "—"}
        </div>
      </div>

      <div className="mt-4">
        <DisabledActions draftLabel="this draft" />
      </div>
    </motion.article>
  );
}

function ThreadCard({ thread }: { thread: ReviewThread }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">
              <ShieldCheck aria-hidden />
              {thread.pending_count} pending {pluralize(thread.pending_count, "draft")}
            </Badge>
            {thread.service_cities.map((city) => (
              <Badge key={city} variant="default">
                <MapPin aria-hidden />
                {city}
              </Badge>
            ))}
          </div>
          <p className="font-mono text-2xs text-ink-muted">thread {thread.thread_id}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 text-2xs tabular-nums text-ink-muted">
              paused {formatRelative(thread.created_at)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{formatFullDateTime(thread.created_at)}</TooltipContent>
        </Tooltip>
      </CardHeader>

      <CardContent className="space-y-3">
        {thread.drafts.length > 0 ? (
          thread.drafts.map((draft, index) => (
            <DraftCard key={`${thread.thread_id}-${draft.customer_id}`} draft={draft} index={index} />
          ))
        ) : (
          <div className="flex items-start gap-3 rounded-md border border-line bg-surface-inset px-3.5 py-3">
            <Info className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden />
            <div className="min-w-0 text-2xs leading-relaxed text-ink-muted">
              <p className="text-[0.8125rem] text-ink-secondary">
                {thread.note ?? "No pending drafts could be read for this thread."}
              </p>
              <p className="mt-1">
                The run is still listed in <code className="font-mono">run_a_pending_review</code>, so it will
                be picked up by <CommandHint>python -m agents.lead_find_agent --review</CommandHint>.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewQueuePanel({
  queue,
  loading,
}: {
  queue: ReviewQueue | undefined;
  loading: boolean;
}) {
  if (loading && !queue) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-3 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!queue?.threads.length) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Nothing waiting for review"
        description="Lead Find records a run here whenever it drafts emails and pauses at the human-review gate without a person present — a scheduled run, or a terminal closed mid-review. An empty queue means nothing is held up."
        hint={
          <span className="space-y-1.5">
            <span className="block">
              Kick off a run: <CommandHint>uv run python -m agents.lead_find_agent Dallas</CommandHint>
            </span>
            <span className="block">
              Resolve what's waiting: <CommandHint>uv run python -m agents.lead_find_agent --review</CommandHint>
            </span>
          </span>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {!queue.checkpointer_available ? (
        <div className="flex items-start gap-3 rounded-md border border-status-awaiting/30 bg-status-awaiting/[0.07] px-4 py-3">
          <Terminal className="mt-0.5 size-4 shrink-0 text-status-awaiting" aria-hidden />
          <div className="min-w-0 text-[0.8125rem] leading-relaxed text-ink-secondary">
            <p className="font-medium text-ink">Draft bodies unavailable</p>
            <p className="mt-0.5">
              LangGraph's checkpoint tables aren't present in this database, so the queue can show which runs
              are paused but not the emails they drafted.
            </p>
          </div>
        </div>
      ) : null}

      {queue.threads.map((thread) => (
        <ThreadCard key={thread.thread_id} thread={thread} />
      ))}
    </div>
  );
}
