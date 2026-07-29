import {
  CalendarClock,
  CloudLightning,
  Home,
  Mail,
  MessageSquareQuote,
  Shield,
  User,
} from "lucide-react";

import { ErrorState } from "@/components/common/ErrorState";
import { Field, FieldGrid } from "@/components/common/Field";
import { JsonBlock } from "@/components/common/JsonBlock";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLead } from "@/hooks/useDashboardQueries";
import {
  formatCurrency,
  formatDate,
  formatFullDateTime,
  formatNumber,
  formatRelative,
  humanize,
} from "@/lib/format";
import { statusMeta } from "@/lib/status";
import type { LeadSummary } from "@/types/api";

/**
 * Row-click detail drawer. Fetches the full record from /api/leads/{lead_id}
 * (which adds the property fields and the verbatim storm_context JSONB) but
 * renders immediately from the summary row already in hand, so opening the
 * drawer never shows an empty shell.
 */
export function LeadDetailDrawer({
  lead,
  open,
  onOpenChange,
}: {
  lead: LeadSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useLead(open && lead ? lead.lead_id : null);
  const detail = query.data;
  const meta = lead ? statusMeta(lead.status) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0">
        {!lead ? null : (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={lead.status} withTooltip={false} />
                <SeverityBadge severity={lead.storm.severity} withTooltip={false} />
                {lead.is_terminal ? <Badge variant="outline">Terminal</Badge> : null}
                <span className="font-mono text-2xs text-ink-muted">lead #{lead.lead_id}</span>
              </div>
              <SheetTitle className="mt-3">{lead.full_name}</SheetTitle>
              <SheetDescription>
                <a href={`mailto:${lead.email}`} className="text-accent hover:underline">
                  {lead.email}
                </a>
                {lead.phone ? <span className="text-ink-muted"> · {lead.phone}</span> : null}
                <span className="text-ink-muted">
                  {" "}
                  · {lead.city}, {lead.state} {lead.zip}
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="scroll-subtle flex-1 overflow-y-auto px-6 py-5">
              {query.isError ? (
                <ErrorState
                  error={query.error}
                  onRetry={() => void query.refetch()}
                  title="Couldn't load full detail"
                  className="mb-5"
                />
              ) : null}

              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">
                    <User />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="storm">
                    <CloudLightning />
                    Storm context
                  </TabsTrigger>
                  <TabsTrigger value="thread">
                    <Mail />
                    Email thread
                  </TabsTrigger>
                </TabsList>

                {/* ---------------------------------------------------------- */}
                <TabsContent value="overview" className="space-y-6">
                  <section className="space-y-3">
                    <h3 className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-ink-muted">
                      <Shield className="size-3" aria-hidden />
                      Pipeline state
                    </h3>
                    <FieldGrid>
                      <Field label="Status">
                        <span className="flex flex-col gap-1">
                          <span>{meta?.label}</span>
                          <span className="text-2xs text-ink-muted">Written by {meta?.writtenBy}</span>
                        </span>
                      </Field>
                      <Field label="Calendly invite">
                        {lead.invite_sent ? "Sent" : "Not sent"}
                        <span className="text-2xs text-ink-muted"> · nudge_count {lead.nudge_count}</span>
                      </Field>
                      <Field label="Last activity">
                        {formatRelative(lead.last_contacted_at)}
                        <span className="block text-2xs text-ink-muted">
                          {formatFullDateTime(lead.last_contacted_at)}
                        </span>
                      </Field>
                      <Field label="First contacted">
                        {formatRelative(lead.created_at)}
                        <span className="block text-2xs text-ink-muted">
                          {formatFullDateTime(lead.created_at)}
                        </span>
                      </Field>
                      {lead.scheduled_at ? (
                        <Field label="Inspection booked for" className="col-span-2">
                          <span className="flex items-center gap-1.5 text-status-booked">
                            <CalendarClock className="size-3.5" aria-hidden />
                            {formatFullDateTime(lead.scheduled_at)}
                          </span>
                          <span className="block text-2xs text-ink-muted">
                            {formatRelative(lead.scheduled_at)}
                          </span>
                        </Field>
                      ) : null}
                    </FieldGrid>
                  </section>

                  {lead.triage_reason ? (
                    <>
                      <Separator />
                      <section className="space-y-2">
                        <h3 className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-ink-muted">
                          <MessageSquareQuote className="size-3" aria-hidden />
                          Triage rationale
                        </h3>
                        <blockquote className="rounded-md border-l-2 border-accent/50 bg-surface-inset px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink-secondary">
                          {lead.triage_reason}
                        </blockquote>
                        <p className="text-2xs text-ink-muted">
                          One-sentence LLM rationale stored in{" "}
                          <code className="font-mono">tracking.triage_reason</code> when Reply Triage
                          classified the customer's reply.
                        </p>
                      </section>
                    </>
                  ) : null}

                  <Separator />

                  <section className="space-y-3">
                    <h3 className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-ink-muted">
                      <Home className="size-3" aria-hidden />
                      Property &amp; account
                    </h3>
                    {query.isPending && !detail ? (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        {Array.from({ length: 6 }, (_, i) => (
                          <div key={i} className="space-y-1.5">
                            <Skeleton className="h-2.5 w-20" />
                            <Skeleton className="h-3.5 w-28" />
                          </div>
                        ))}
                      </div>
                    ) : detail ? (
                      <FieldGrid>
                        <Field label="Address" className="col-span-2">
                          {detail.street}, {detail.city}, {detail.state} {detail.zip}
                        </Field>
                        <Field label="Roof material">{humanize(detail.roof_material)}</Field>
                        <Field label="Roof age">{detail.roof_age_years} years</Field>
                        <Field label="Insurance carrier">{detail.insurance_carrier ?? "Not on file"}</Field>
                        <Field label="Marketing opt-in">
                          {detail.marketing_opt_in ? "Yes" : "No"}
                        </Field>
                        <Field label="Last job">
                          {humanize(detail.last_job_type)}
                          <span className="block text-2xs text-ink-muted">
                            {formatDate(detail.last_job_date)} · {formatCurrency(detail.last_job_value)}
                          </span>
                        </Field>
                        <Field label="Customer since">{formatDate(detail.customer_since)}</Field>
                        <Field label="Customer id" mono>
                          {detail.customer_id}
                        </Field>
                      </FieldGrid>
                    ) : null}
                  </section>
                </TabsContent>

                {/* ---------------------------------------------------------- */}
                <TabsContent value="storm" className="space-y-5">
                  <FieldGrid>
                    <Field label="Condition">{lead.storm.condition_text ?? "—"}</Field>
                    <Field label="Severity">
                      <SeverityBadge severity={lead.storm.severity} withTooltip={false} />
                    </Field>
                    <Field label="Wind">
                      {lead.storm.wind_mph !== null ? `${lead.storm.wind_mph} mph` : "—"}
                    </Field>
                    <Field label="Hail">
                      {lead.storm.hail_in !== null ? `${lead.storm.hail_in}"` : "—"}
                    </Field>
                    <Field label="Storm date">{formatDate(lead.storm.date)}</Field>
                    <Field label="ZIP on storm record">{lead.storm.zip ?? "—"}</Field>
                  </FieldGrid>

                  <div className="space-y-2">
                    <h3 className="text-2xs font-medium uppercase tracking-wider text-ink-muted">
                      Raw tracking.storm_context
                    </h3>
                    {query.isPending && !detail ? (
                      <Skeleton className="h-40 w-full" />
                    ) : (
                      <JsonBlock
                        value={detail?.storm_context_raw ?? null}
                        emptyLabel="null — no storm context recorded for this lead"
                      />
                    )}
                    <p className="text-2xs leading-relaxed text-ink-muted">
                      Verbatim JSONB. Lead Find writes{" "}
                      <code className="font-mono">{"{city, condition_text, wind_mph, date}"}</code>; the
                      synthetic seed generator writes{" "}
                      <code className="font-mono">{"{zip, hail_in, wind_mph, date}"}</code> — the fields above
                      are normalized across both.
                    </p>
                  </div>
                </TabsContent>

                {/* ---------------------------------------------------------- */}
                <TabsContent value="thread" className="space-y-5">
                  <FieldGrid>
                    <Field label="Gmail thread id" className="col-span-2" mono>
                      {lead.thread_id ?? "—"}
                    </Field>
                    <Field label="Messages processed">
                      {formatNumber(lead.processed_message_count)}
                    </Field>
                    <Field label="Recipient" mono>
                      {lead.email}
                    </Field>
                  </FieldGrid>

                  <p className="rounded-md border border-line bg-surface-inset px-3.5 py-3 text-2xs leading-relaxed text-ink-muted">
                    <code className="font-mono">processed_message_count</code> is how Reply Triage detects a
                    new reply without diffing message ids: it re-reads the thread and treats anything past
                    this index as unprocessed. Message bodies live in Gmail, not in this database, so they
                    aren't shown here.
                  </p>

                  {lead.thread_id ? (
                    <a
                      href={`https://mail.google.com/mail/u/0/#all/${lead.thread_id}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 text-[0.8125rem] text-accent hover:underline"
                    >
                      <Mail className="size-3.5" aria-hidden />
                      Open in Gmail
                    </a>
                  ) : null}
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
