/** Date, number and string formatting shared across the console. */

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const fullFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const clockFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | Date | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : fallback;
}

export function formatDate(value: string | Date | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : fallback;
}

export function formatFullDateTime(value: string | Date | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  return date ? fullFormatter.format(date) : fallback;
}

export function formatClock(value: string | Date | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  return date ? clockFormatter.format(date) : fallback;
}

/**
 * Compact relative time: "just now", "14m ago", "3h ago", "6d ago", and the
 * future direction ("in 8d") for scheduled appointments.
 */
export function formatRelative(value: string | Date | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;

  const deltaMs = date.getTime() - Date.now();
  const future = deltaMs > 0;
  const seconds = Math.abs(deltaMs) / 1000;

  if (seconds < 45) return future ? "in moments" : "just now";

  const units: Array<[limit: number, divisor: number, suffix: string]> = [
    [3600, 60, "m"],
    [86400, 3600, "h"],
    [2592000, 86400, "d"],
    [31536000, 2592000, "mo"],
    [Number.POSITIVE_INFINITY, 31536000, "y"],
  ];

  for (const [limit, divisor, suffix] of units) {
    if (seconds < limit) {
      const amount = Math.round(seconds / divisor);
      return future ? `in ${amount}${suffix}` : `${amount}${suffix} ago`;
    }
  }
  return fallback;
}

/** Whole percent for rates that are already 0-1. Null-safe. */
export function formatPercent(value: number | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return `${Math.round(value * 100)}%`;
}

export function formatNumber(value: number | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return value.toLocaleString();
}

export function formatCurrency(value: number | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** `asphalt_shingle` -> `Asphalt shingle`; also handles plain words. */
export function humanize(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : fallback;
}

/** Shortens long ids for display while keeping them recognizable. */
export function truncateId(value: string | null | undefined, head = 10, fallback = "—"): string {
  if (!value) return fallback;
  return value.length <= head + 3 ? value : `${value.slice(0, head)}…`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
