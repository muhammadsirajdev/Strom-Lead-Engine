import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";

import "@/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Polling drives freshness, so refetch-on-focus would only add
      // redundant requests.
      refetchOnWindowFocus: false,
      staleTime: 5_000,
      retry: (failureCount, error) => {
        // 4xx responses are deterministic -- retrying an unknown status filter
        // or a missing lead_id can't succeed.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element is missing from index.html");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider delayDuration={220} skipDelayDuration={400}>
          <App />
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
