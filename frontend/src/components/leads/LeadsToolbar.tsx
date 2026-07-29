import type { Table } from "@tanstack/react-table";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLUMN_LABELS } from "@/components/leads/leadColumns";
import { STATUS_ORDER, statusMeta } from "@/lib/status";
import type { LeadStatus, LeadSummary } from "@/types/api";

const ALL = "__all__";

interface LeadsToolbarProps {
  table: Table<LeadSummary>;
  search: string;
  onSearchChange: (value: string) => void;
  status: LeadStatus | null;
  onStatusChange: (value: LeadStatus | null) => void;
  city: string | null;
  onCityChange: (value: string | null) => void;
  cityOptions: string[];
  /** Rows matching the server-side filters, before the row limit. */
  total: number;
  returned: number;
}

/**
 * One filter row above the table, scoping every column at once. Status, city
 * and search are server-side (they go to /api/leads); sorting and column
 * visibility are client-side.
 */
export function LeadsToolbar({
  table,
  search,
  onSearchChange,
  status,
  onStatusChange,
  city,
  onCityChange,
  cityOptions,
  total,
  returned,
}: LeadsToolbarProps) {
  const filtered = status !== null || city !== null || search.trim() !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[15rem] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name, email, city or thread id…"
          aria-label="Search leads"
          className="pl-9 pr-9"
        />
        {search ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
          >
            <X />
          </Button>
        ) : null}
      </div>

      <Select
        value={status ?? ALL}
        onValueChange={(value) => onStatusChange(value === ALL ? null : (value as LeadStatus))}
      >
        <SelectTrigger className="w-[10.5rem]" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {STATUS_ORDER.map((value) => (
            <SelectItem key={value} value={value}>
              {statusMeta(value).label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={city ?? ALL} onValueChange={(value) => onCityChange(value === ALL ? null : value)}>
        <SelectTrigger className="w-[10.5rem]" aria-label="Filter by city">
          <SelectValue placeholder="All cities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All cities</SelectItem>
          {cityOptions.map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="default">
            <SlidersHorizontal />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {table
            .getAllLeafColumns()
            .filter((column) => column.getCanHide())
            .map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                onSelect={(event) => event.preventDefault()}
              >
                {COLUMN_LABELS[column.id] ?? column.id}
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {filtered ? (
        <Button
          variant="ghost"
          size="default"
          onClick={() => {
            onSearchChange("");
            onStatusChange(null);
            onCityChange(null);
          }}
        >
          <X />
          Clear filters
        </Button>
      ) : null}

      <span className="ml-auto whitespace-nowrap text-2xs tabular-nums text-ink-muted">
        {returned === total ? (
          <>
            {total.toLocaleString()} {total === 1 ? "lead" : "leads"}
          </>
        ) : (
          <>
            Showing {returned.toLocaleString()} of {total.toLocaleString()}
          </>
        )}
      </span>
    </div>
  );
}
