import { Inbox, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { StatTile } from "@/components/common/StatTile";
import { formatPercent } from "@/lib/format";
import { STATUS_ORDER, statusMeta } from "@/lib/status";
import type { Stats } from "@/types/api";

/**
 * Total leads plus one tile per lifecycle status. Each status tile deep-links
 * into the leads table pre-filtered to that status, which is the action an
 * operator actually wants after reading the number.
 */
export function KpiRow({ stats, loading }: { stats: Stats | undefined; loading: boolean }) {
  const navigate = useNavigate();
  const counts = new Map(stats?.status_counts.map((s) => [s.status, s.count]));
  const total = stats?.total_leads ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
      <StatTile
        label="Total leads"
        value={stats?.total_leads}
        icon={Inbox}
        tone="text-accent"
        loading={loading}
        meta={
          stats ? (
            <span>
              of {stats.opted_in_customers.toLocaleString()} opted-in
            </span>
          ) : null
        }
        hint="One row per tracking record — every outreach email the pipeline has sent."
        onClick={() => navigate("/leads")}
      />

      {STATUS_ORDER.map((status) => {
        const meta = statusMeta(status);
        const count = counts.get(status) ?? 0;
        const share = total > 0 ? count / total : null;

        return (
          <StatTile
            key={status}
            label={meta.label}
            value={count}
            icon={meta.icon}
            tone={meta.text}
            loading={loading}
            meta={share === null ? null : <span className="tabular-nums">{formatPercent(share)} of book</span>}
            hint={meta.description}
            onClick={() => navigate(`/leads?status=${status}`)}
          />
        );
      })}

      <StatTile
        label="Customers"
        value={stats?.total_customers}
        icon={Users}
        loading={loading}
        meta={
          stats ? (
            <span className="tabular-nums">
              {formatPercent(
                stats.total_customers > 0 ? stats.opted_in_customers / stats.total_customers : null,
              )}{" "}
              opted in
            </span>
          ) : null
        }
        hint="Rows in the customers table. Only marketing_opt_in customers are ever targeted."
      />
    </div>
  );
}
