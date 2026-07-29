/**
 * Typed client for the StormLead operations API.
 *
 * Paths are relative by default so Vite's dev proxy handles them on one
 * origin; set VITE_API_BASE_URL to point at a backend on another host.
 */

import type {
  BookingsResponse,
  CitiesResponse,
  HealthResponse,
  LeadDetail,
  LeadFilters,
  LeadsPage,
  ReviewQueue,
  Stats,
} from "@/types/api";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

/** Thrown for any non-2xx response, carrying the server's detail message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly path: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

function buildUrl(path: string, params?: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return `${BASE_URL}${path}${suffix ? `?${suffix}` : ""}`;
}

async function request<T>(
  path: string,
  params?: Record<string, string | number | null | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (cause) {
    // Fetch only rejects on network-level failures -- most often the backend
    // simply isn't running yet, which is worth saying plainly.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "Could not reach the API. Is the FastAPI backend running on port 8000?", path);
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = JSON.stringify(body.detail);
    } catch {
      /* response wasn't JSON -- keep the status line */
    }
    throw new ApiError(response.status, detail, path);
  }

  return (await response.json()) as T;
}

export const api = {
  health: (signal?: AbortSignal) => request<HealthResponse>("/api/health", undefined, signal),

  stats: (signal?: AbortSignal) => request<Stats>("/api/stats", undefined, signal),

  leads: (filters: LeadFilters = {}, signal?: AbortSignal) =>
    request<LeadsPage>(
      "/api/leads",
      {
        status: filters.status,
        city: filters.city,
        search: filters.search,
        limit: filters.limit,
      },
      signal,
    ),

  lead: (leadId: number, signal?: AbortSignal) =>
    request<LeadDetail>(`/api/leads/${leadId}`, undefined, signal),

  cities: (signal?: AbortSignal) => request<CitiesResponse>("/api/cities", undefined, signal),

  reviewQueue: (signal?: AbortSignal) => request<ReviewQueue>("/api/review-queue", undefined, signal),

  bookings: (limit = 100, signal?: AbortSignal) =>
    request<BookingsResponse>("/api/bookings", { limit }, signal),
};

/** Query keys, centralized so invalidation can't drift from the fetchers. */
export const queryKeys = {
  health: ["health"] as const,
  stats: ["stats"] as const,
  leads: (filters: LeadFilters) => ["leads", filters] as const,
  lead: (leadId: number | null) => ["lead", leadId] as const,
  cities: ["cities"] as const,
  reviewQueue: ["review-queue"] as const,
  bookings: (limit: number) => ["bookings", limit] as const,
};
