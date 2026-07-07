"use client";

import { useRef } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

const DEFAULT_ROW_HEIGHT = 36;

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowId: (row: T) => string;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  activeId: string | null;
  onActiveIdChange: (id: string) => void;
  onRowActivate?: (row: T) => void;
  rowHeight?: number;
  emptyMessage?: string;
}

/**
 * Generic virtualized table: renders only the rows within (+ overscan of)
 * the visible scroll area, so it stays fast at thousands of rows. Adds a
 * checkbox selection column and keyboard navigation (arrow keys move the
 * active row, Enter activates it, Space toggles its selection) on top of
 * @tanstack/react-table's column model.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  selectedIds,
  onSelectionChange,
  activeId,
  onActiveIdChange,
  onRowActivate,
  rowHeight = DEFAULT_ROW_HEIGHT,
  emptyMessage = "No rows.",
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const rows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  function activeIndex(): number {
    if (!activeId) return -1;
    return rows.findIndex((row) => getRowId(row.original) === activeId);
  }

  function moveActive(delta: number) {
    if (rows.length === 0) return;
    const current = activeIndex();
    const next = Math.min(Math.max(current + delta, 0), rows.length - 1);
    onActiveIdChange(getRowId(rows[next].original));
    virtualizer.scrollToIndex(next, { align: "auto" });
  }

  function toggleSelection(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  function toggleSelectAll() {
    if (selectedIds.size === data.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(getRowId)));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter") {
      const current = activeIndex();
      if (current >= 0 && onRowActivate) onRowActivate(rows[current].original);
    } else if (e.key === " ") {
      e.preventDefault();
      const current = activeIndex();
      if (current >= 0) toggleSelection(getRowId(rows[current].original));
    }
  }

  if (data.length === 0) {
    return <p className="px-4 py-8 text-sm text-neutral-500">{emptyMessage}</p>;
  }

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex border-b border-neutral-200 bg-white text-left dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex w-9 shrink-0 items-center justify-center py-1.5">
          <input
            type="checkbox"
            aria-label="Select all rows"
            checked={selectedIds.size === data.length && data.length > 0}
            onChange={toggleSelectAll}
          />
        </div>
        {table.getHeaderGroups().map((headerGroup) =>
          headerGroup.headers.map((header) => (
            <div
              key={header.id}
              className="flex-1 truncate px-2 py-1.5 font-medium text-neutral-600 dark:text-neutral-400"
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
            </div>
          )),
        )}
      </div>

      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-auto outline-none"
      >
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const id = getRowId(row.original);
            const selected = selectedIds.has(id);
            const active = id === activeId;

            return (
              <div
                key={row.id}
                data-index={virtualRow.index}
                onClick={() => onActiveIdChange(id)}
                onDoubleClick={() => onRowActivate?.(row.original)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={`flex cursor-pointer items-center border-b border-neutral-100 dark:border-neutral-900 ${
                  active
                    ? "bg-blue-50 dark:bg-blue-950/40"
                    : selected
                      ? "bg-neutral-50 dark:bg-neutral-900"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                }`}
              >
                <div className="flex w-9 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    aria-label={`Select row ${id}`}
                    checked={selected}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelection(id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                {row.getVisibleCells().map((cell) => (
                  <div key={cell.id} className="flex-1 truncate px-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
