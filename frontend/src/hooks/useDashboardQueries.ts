/**
 * TanStack Query hooks, one per endpoint.
 *
 * The live views (`stats`, `leads`, `review-queue`) poll on POLL_INTERVAL_MS.
 * `placeholderData: keepPreviousData` holds the last good render while a
 * refetch is in flight, so polling never flashes a skeleton or jumps the
 * layout -- the "last updated" stamp is what tells the user data moved.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, queryKeys } from "@/lib/api";
import type { LeadFilters } from "@/types/api";

/** ~12s: inside the 10-15s band, and a divisor of the 30-min triage cadence. */
export const POLL_INTERVAL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? 12_000);

/** Cities and bookings move far more slowly than the live queues. */
const SLOW_POLL_INTERVAL_MS = POLL_INTERVAL_MS * 5;

export function useStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: ({ signal }) => api.stats(signal),
    refetchInterval: POLL_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useLeads(filters: LeadFilters = {}) {
  return useQuery({
    queryKey: queryKeys.leads(filters),
    queryFn: ({ signal }) => api.leads(filters, signal),
    refetchInterval: POLL_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useLead(leadId: number | null) {
  return useQuery({
    queryKey: queryKeys.lead(leadId),
    queryFn: ({ signal }) => api.lead(leadId as number, signal),
    enabled: leadId !== null,
    staleTime: 5_000,
  });
}

export function useCities() {
  return useQuery({
    queryKey: queryKeys.cities,
    queryFn: ({ signal }) => api.cities(signal),
    refetchInterval: SLOW_POLL_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useReviewQueue() {
  return useQuery({
    queryKey: queryKeys.reviewQueue,
    queryFn: ({ signal }) => api.reviewQueue(signal),
    refetchInterval: POLL_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useBookings(limit = 50) {
  return useQuery({
    queryKey: queryKeys.bookings(limit),
    queryFn: ({ signal }) => api.bookings(limit, signal),
    refetchInterval: SLOW_POLL_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useApiHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => api.health(signal),
    refetchInterval: SLOW_POLL_INTERVAL_MS,
    retry: false,
  });
}
