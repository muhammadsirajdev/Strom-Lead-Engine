import { motion, useReducedMotion } from "framer-motion";

import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPercent, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CityStorm, FunnelStage, Stats } from "@/types/api";

/**
 * The Overview's one bold moment: a sentence that states what the pipeline
 * has done, and a tapering "storm-to-booking" ribbon drawn over faint isobars.
 *
 * The ribbon is the funnel. Band thickness at each stage is proportional to
 * its lead count, and every stage carries its number and conversion as text,
 * so nothing depends on reading the shape.
 */

const RAMP = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

const VIEW_W = 1000;
const VIEW_H = 64;
const MAX_BAND = 56;
const MIN_BAND = 8;

/** Closed path for a band that holds flat across each stage and eases between them. */
function ribbonPath(counts: number[]): string {
  const max = Math.max(...counts, 1);
  const n = counts.length;
  const col = VIEW_W / n;
  const mid = VIEW_H / 2;
  const half = counts.map((c) => (c > 0 ? Math.max(MIN_BAND, (c / max) * MAX_BAND) : MIN_BAND) / 2);

  // Each stage is flat over the middle 50% of its column; the outer quarters ease into the neighbour.
  const top: string[] = [`M 0 ${mid - half[0]!}`];
  const bottom: string[] = [];
  for (let i = 0; i < n; i++) {
    const x1 = i * col + col * 0.75;
    const h = half[i]!;
    top.push(`L ${x1} ${mid - h}`);
    if (i < n - 1) {
      const nx = (i + 1) * col + col * 0.25;
      const nh = half[i + 1]!;
      const c = (nx - x1) / 2;
      top.push(`C ${x1 + c} ${mid - h}, ${nx - c} ${mid - nh}, ${nx} ${mid - nh}`);
    }
  }
  top.push(`L ${VIEW_W} ${mid - half[n - 1]!}`);
  bottom.push(`L ${VIEW_W} ${mid + half[n - 1]!}`);
  for (let i = n - 1; i >= 0; i--) {
    const x0 = i * col + col * 0.25;
    const h = half[i]!;
    bottom.push(`L ${x0} ${mid + h}`);
    if (i > 0) {
      const px = (i - 1) * col + col * 0.75;
      const ph = half[i - 1]!;
      const c = (x0 - px) / 2;
      bottom.push(`C ${x0 - c} ${mid + h}, ${px + c} ${mid + ph}, ${px} ${mid + ph}`);
    }
  }
  bottom.push(`L 0 ${mid + half[0]!} Z`);
  return [...top, ...bottom].join(" ");
}

/** Faint isobars behind the ribbon -- the chart-paper the storm is drawn on. */
function Isobars() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full text-ink"
      viewBox="0 0 800 400"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <g fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <ellipse
            key={i}
            cx="690"
            cy="70"
            rx={90 + i * 78}
            ry={60 + i * 52}
            transform="rotate(-14 690 70)"
            opacity={0.085 - i * 0.01}
          />
        ))}
      </g>
    </svg>
  );
}

interface StormHeroProps {
  stats: Stats | undefined;
  cities: CityStorm[] | undefined;
  loading: boolean;
}

export function StormHero({ stats, cities, loading }: StormHeroProps) {
  const reduceMotion = useReducedMotion();
  const funnel: FunnelStage[] = stats?.funnel ?? [];
  const sent = funnel.find((s) => s.key === "sent")?.count ?? stats?.total_leads ?? 0;
  const booked = funnel.find((s) => s.key === "booked")?.count ?? 0;

  const stormCities = (cities ?? []).filter((c) => c.latest_storm !== null);
  const severe = (cities ?? []).filter((c) => c.severity === "severe");
  const lead = severe[0] ?? stormCities[0];

  const headline =
    sent === 0
      ? "Watching the forecast. No storm has triggered outreach yet."
      : `${formatNumber(sent)} ${pluralize(sent, "homeowner")} contacted after storms in ${formatNumber(
          Math.max(stormCities.length, 1),
        )} ${pluralize(Math.max(stormCities.length, 1), "city", "cities")}. ${formatNumber(booked)} ${pluralize(
          booked,
          "inspection",
        )} booked.`;

  return (
    <section
      aria-labelledby="hero-headline"
      className="relative isolate overflow-hidden rounded-[1.25rem] border border-line bg-surface"
    >
      <Isobars />

      <div className="relative px-5 pb-6 pt-7 sm:px-8 sm:pt-9 lg:px-10">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-11 w-[22ch]" />
                <Skeleton className="h-11 w-[16ch]" />
              </div>
            ) : (
              <h2
                id="hero-headline"
                className="max-w-[19ch] text-balance font-display text-[2.375rem] font-semibold leading-[1.02] tracking-[-0.005em] text-ink sm:text-[3.25rem] xl:text-[3.75rem]"
              >
                {headline}
              </h2>
            )}
            <p className="mt-4 max-w-[58ch] text-[0.9375rem] leading-relaxed text-ink-secondary">
              Four agents watch the weather across the service area. When a storm crosses the damage
              threshold, they draft outreach to opted-in customers, triage the replies, and book roof
              inspections on Calendly. A person approves every email before it sends.
            </p>
          </div>

          <StormReadout city={lead} severeCount={severe.length} loading={loading} />
        </div>

        <StormRibbon funnel={funnel} loading={loading} animate={!reduceMotion} />
      </div>
    </section>
  );
}

/** The live-weather callout. The amber signal colour appears here and nowhere else. */
function StormReadout({
  city,
  severeCount,
  loading,
}: {
  city: CityStorm | undefined;
  severeCount: number;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-24 w-64 rounded-xl" />;

  const storm = city?.latest_storm;
  const isSevere = city?.severity === "severe";

  return (
    <div className="w-full rounded-xl border border-line bg-surface-raised/80 p-4 backdrop-blur-sm sm:w-72">
      <p className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
        <span
          className={cn("size-2 rounded-full", isSevere ? "bg-signal" : "bg-ink-muted/60")}
          aria-hidden
        />
        {isSevere
          ? `Severe weather in ${severeCount} ${pluralize(severeCount, "city", "cities")}`
          : "Latest storm on file"}
      </p>
      {city && storm ? (
        <>
          <p className="mt-2 font-display text-[1.75rem] font-semibold leading-none text-ink">
            {city.city}, {city.state}
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-muted">
            {[
              storm.condition_text
                ? storm.condition_text.charAt(0).toUpperCase() + storm.condition_text.slice(1)
                : null,
              storm.wind_mph !== null ? `${Math.round(storm.wind_mph)} mph wind` : null,
              storm.hail_in !== null && storm.hail_in > 0 ? `${storm.hail_in} in hail` : null,
            ]
              .filter(Boolean)
              .join(", ") || "Storm context recorded"}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          No storm recorded yet. Lead Find checks the forecast every morning.
        </p>
      )}
    </div>
  );
}

function StormRibbon({
  funnel,
  loading,
  animate,
}: {
  funnel: FunnelStage[];
  loading: boolean;
  animate: boolean;
}) {
  if (loading) {
    return <Skeleton className="mt-10 h-40 w-full rounded-xl" />;
  }
  if (funnel.length === 0) return null;

  const counts = funnel.map((s) => s.count);
  const path = ribbonPath(counts);

  return (
    <div className="mt-10">
      {/* Ribbon: decorative restatement of the numbers below, hidden from AT. */}
      <div className="relative hidden h-16 sm:block" aria-hidden>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="h-full w-full [clip-path:inset(0_round_9999px)]"
        >
          <defs>
            <linearGradient id="ribbon-ramp" x1="0" x2="1" y1="0" y2="0">
              {RAMP.map((color, i) => (
                <stop key={color} offset={`${(i / (RAMP.length - 1)) * 100}%`} stopColor={color} />
              ))}
            </linearGradient>
            <clipPath id="ribbon-reveal">
              <motion.rect
                x="0"
                y="0"
                height={VIEW_H}
                initial={{ width: animate ? 0 : VIEW_W }}
                animate={{ width: VIEW_W }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              />
            </clipPath>
          </defs>
          <path d={path} fill="url(#ribbon-ramp)" clipPath="url(#ribbon-reveal)" />
        </svg>
        {/* Stage markers sit in HTML so they stay round while the SVG stretches. */}
        {funnel.map((stage, i) => (
          <motion.span
            key={stage.key}
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink"
            style={{ left: `${((i + 0.5) / funnel.length) * 100}%` }}
            initial={{ opacity: animate ? 0 : 1, scale: animate ? 0.4 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: animate ? 0.35 + i * 0.22 : 0 }}
          />
        ))}
      </div>

      <ol className="grid grid-cols-2 gap-x-6 gap-y-6 sm:mt-4 sm:grid-cols-4">
        {funnel.map((stage, i) => (
          <li key={stage.key} className="min-w-0 sm:text-center">
            <p className="font-display text-[2.75rem] font-semibold leading-none text-ink sm:text-[3.5rem]">
              {formatNumber(stage.count)}
            </p>
            <p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-ink sm:justify-center">
              <span className="size-2 shrink-0 rounded-full sm:hidden" style={{ background: RAMP[i] }} aria-hidden />
              {stage.label}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {stage.conversion_from_previous === null
                ? "Approved and sent"
                : `${formatPercent(stage.conversion_from_previous)} of previous stage`}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
