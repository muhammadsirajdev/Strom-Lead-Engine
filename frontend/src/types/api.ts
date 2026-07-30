/**
 * Mirrors backend/schemas.py one-for-one.
 *
 * Field names match the real database columns (`lead_id`, `nudge_count`,
 * `triage_reason`, `last_contacted_at`, ...) rather than UI-friendly aliases,
 * so a value on screen traces straight back to the column the pipeline wrote.
 */

/** tracking.status -- the CHECK constraint in db/schema.sql. */
export type LeadStatus =
  | "awaiting_reply"
  | "interested"
  | "booked"
  | "not_interested"
  | "no_response"
  | "unsubscribed";

export type Severity = "severe" | "elevated" | "calm" | "unknown";

/**
 * Normalized `tracking.storm_context`. Two producers write that JSONB with
 * different shapes -- agents/lead_find_agent.py writes
 * {city, condition_text, wind_mph, date} and db/generate_data.py writes
 * {zip, hail_in, wind_mph, date} -- so every field here is nullable and the
 * backend fills in `severity` + `label` for both.
 */
export interface StormSummary {
  condition_text: string | null;
  wind_mph: number | null;
  hail_in: number | null;
  date: string | null;
  zip: string | null;
  severity: Severity;
  label: string | null;
}

export interface StatusCount {
  status: LeadStatus | string;
  count: number;
}

export interface FunnelStage {
  key: "sent" | "replied" | "interested" | "booked" | string;
  label: string;
  count: number;
  description: string;
  conversion_from_previous: number | null;
  conversion_from_start: number | null;
}

export interface PipelineHealth {
  total_leads: number;
  active_leads: number;
  reply_rate: number | null;
  interest_rate: number | null;
  booking_rate: number | null;
  /** status='interested' AND nudge_count=0 -- Calendly link not sent yet. */
  awaiting_invite: number;
  pending_review_threads: number;
  /** awaiting_reply and silent 7+ days -- what close_stale_leads closes next. */
  stale_awaiting: number;
  last_activity_at: string | null;
}

export interface Stats {
  total_leads: number;
  total_customers: number;
  opted_in_customers: number;
  status_counts: StatusCount[];
  funnel: FunnelStage[];
  health: PipelineHealth;
  generated_at: string;
}

export interface LeadSummary {
  lead_id: number;
  customer_id: number;
  thread_id: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  city: string;
  state: string;
  zip: string;
  status: LeadStatus;
  is_terminal: boolean;
  storm: StormSummary;
  triage_reason: string | null;
  nudge_count: number;
  /** nudge_count > 0 -- doubles as the Calendly-invite-sent marker. */
  invite_sent: boolean;
  processed_message_count: number;
  scheduled_at: string | null;
  last_contacted_at: string;
  created_at: string;
  days_since_contact: number;
}

export interface LeadDetail extends LeadSummary {
  street: string;
  roof_material: string;
  roof_age_years: number;
  last_job_type: string;
  last_job_date: string | null;
  last_job_value: number | null;
  insurance_carrier: string | null;
  marketing_opt_in: boolean;
  customer_since: string | null;
  storm_context_raw: Record<string, unknown> | null;
}

export interface LeadsPage {
  leads: LeadSummary[];
  total: number;
  returned: number;
  limit: number;
  generated_at: string;
}

export interface CityStorm {
  city: string;
  state: string;
  customer_count: number;
  opted_in_count: number;
  lead_count: number;
  active_lead_count: number;
  booked_count: number;
  status_counts: StatusCount[];
  latest_storm: StormSummary | null;
  latest_storm_at: string | null;
  severity: Severity;
}

export interface CitiesResponse {
  cities: CityStorm[];
  severe_count: number;
  generated_at: string;
}

export interface ReviewDraft {
  customer_id: number;
  to_email: string;
  subject: string;
  body: string;
  /** EmailDraft.status in agents/lead_find_agent.py. */
  status: string;
  feedback: string | null;
  storm: StormSummary;
  full_name: string | null;
  city: string | null;
  state: string | null;
  roof_material: string | null;
  roof_age_years: number | null;
}

export interface ReviewThread {
  thread_id: string;
  service_cities: string[];
  created_at: string;
  drafts: ReviewDraft[];
  pending_count: number;
  drafts_available: boolean;
  note: string | null;
}

export interface ReviewQueue {
  threads: ReviewThread[];
  total_threads: number;
  total_pending_drafts: number;
  checkpointer_available: boolean;
  generated_at: string;
}

export interface Booking {
  lead_id: number;
  customer_id: number;
  full_name: string;
  email: string;
  city: string;
  state: string;
  thread_id: string | null;
  scheduled_at: string | null;
  last_contacted_at: string;
  triage_reason: string | null;
  storm: StormSummary;
  is_upcoming: boolean;
}

export interface BookingsResponse {
  bookings: Booking[];
  total: number;
  upcoming_count: number;
  unscheduled_count: number;
  generated_at: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  database: boolean;
  checkpointer_tables: boolean;
  pending_review_table: boolean;
  version: string;
}

export interface LeadFilters {
  status?: LeadStatus | null;
  city?: string | null;
  search?: string | null;
  limit?: number | null;
}
