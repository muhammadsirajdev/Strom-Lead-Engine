import { useEffect, useState } from "react";

/**
 * A ticking clock, so relative timestamps ("14m ago") stay honest between
 * data refetches instead of going stale until the next poll.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
