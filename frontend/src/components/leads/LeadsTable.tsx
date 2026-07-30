import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { CommandHint, EmptyState } from "@/components/common/EmptyState";
import { DEFAULT_HIDDEN_COLUMNS, leadColumns } from "@/components/leads/leadColumns";
import { LeadsToolbar } from "@/components/leads/LeadsToolbar";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { LeadStatus, LeadSummary } from "@/types/api";

interface LeadsTableProps {
  leads: LeadSummary[];
  total: number;
  returned: number;
  loading: boolean;
  /** True while a poll is in flight -- dims the body instead of re-skeletoning. */
  refreshing: boolean;
  cityOptions: string[];
  search: string;
  onSearchChange: (value: string) => void;
  status: LeadStatus | null;
  onStatusChange: (value: LeadStatus | null) => void;
  city: string | null;
  onCityChange: (value: string | null) => void;
  onRowClick: (lead: LeadSummary) => void;
  selectedLeadId: number | null;
}

const initialVisibility: VisibilityState = Object.fromEntries(
  DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false]),
);

export function LeadsTable({
  leads,
  total,
  returned,
  loading,
  refreshing,
  cityOptions,
  search,
  onSearchChange,
  status,
  onStatusChange,
  city,
  onCityChange,
  onRowClick,
  selectedLeadId,
}: LeadsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "last_contacted_at", desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialVisibility);

  const columns = useMemo(() => leadColumns, []);

  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
  });

  const isFiltered = status !== null || city !== null || search.trim() !== "";
  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-3">
      <LeadsToolbar
        table={table}
        search={search}
        onSearchChange={onSearchChange}
        status={status}
        onStatusChange={onStatusChange}
        city={city}
        onCityChange={onCityChange}
        cityOptions={cityOptions}
        total={total}
        returned={returned}
      />

      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        {loading ? (
          <div className="space-y-px p-3">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex items-center gap-4 px-1 py-2.5">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="ml-auto h-3.5 w-28" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            {isFiltered ? (
              <EmptyState
                icon={Users}
                title="No leads match these filters"
                description="Nothing in the tracking table matches this combination of status, city and search text. Try clearing one of them."
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title="No leads yet"
                description="A lead row appears the moment Lead Find sends an approved outreach email and writes to the tracking table."
                hint={
                  <span className="space-y-1.5">
                    <span className="block">
                      Run a storm check: <CommandHint>uv run python -m agents.lead_find_agent Dallas</CommandHint>
                    </span>
                    <span className="block">
                      Or seed synthetic leads: <CommandHint>uv run python db/generate_data.py</CommandHint>{" "}
                      <span className="text-ink-muted">
                        (replaces the customers and tracking tables)
                      </span>
                    </span>
                  </span>
                }
              />
            )}
          </div>
        ) : (
          <div className="scroll-subtle max-h-[calc(100vh-19rem)] overflow-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const sortDirection = header.column.getIsSorted();
                      const canSort = header.column.getCanSort();

                      return (
                        <TableHead key={header.id} style={{ minWidth: header.column.columnDef.minSize }}>
                          {canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-center gap-1.5 rounded transition-colors hover:text-ink-secondary"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sortDirection === "asc" ? (
                                <ArrowUp className="size-3 text-accent" aria-hidden />
                              ) : sortDirection === "desc" ? (
                                <ArrowDown className="size-3 text-accent" aria-hidden />
                              ) : (
                                <ChevronsUpDown className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                              )}
                              <span className="sr-only">
                                {sortDirection === "asc"
                                  ? "sorted ascending"
                                  : sortDirection === "desc"
                                    ? "sorted descending"
                                    : "not sorted"}
                              </span>
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>

              <TableBody className={cn("transition-opacity", refreshing && "opacity-60")}>
                {rows.map((row) => {
                  const selected = row.original.lead_id === selectedLeadId;
                  return (
                    <TableRow
                      key={row.id}
                      onClick={() => onRowClick(row.original)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open details for ${row.original.full_name}`}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row.original);
                        }
                      }}
                      className={cn(
                        "cursor-pointer",
                        selected ? "bg-accent/[0.07]" : "hover:bg-surface-inset/70",
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {returned < total ? (
        <p className="text-2xs text-ink-muted">
          Showing the {returned.toLocaleString()} most recently active leads of {total.toLocaleString()}{" "}
          matching. Narrow the filters to see the rest.
        </p>
      ) : null}
    </div>
  );
}
