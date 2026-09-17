import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@src/components/ui/table';
import React from 'react';
import { cn } from '@src/lib/utils';

/** Per-column layout classes, set through `meta` on a column definition. */
interface ColumnMeta {
  className?: string;
}
import { DataTablePagination } from '@src/pages/panel/data-table-pagination';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Filters and actions rendered above the table. */
  toolbar?: React.ReactNode;
  /** Rendered instead of the table body when there is nothing to show. */
  empty?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  isRowActive?: (row: TData) => boolean;
  /** Passed through to columns via `table.options.meta`. */
  meta?: Record<string, unknown>;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  toolbar,
  empty,
  onRowClick,
  isRowActive,
  meta,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
    meta,
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <div className="flex h-full flex-col gap-2">
      {toolbar}
      <div className="min-h-0 flex-grow overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'h-9 px-3 text-[11px] uppercase tracking-wide',
                      (header.column.columnDef.meta as ColumnMeta)?.className,
                    )}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="select-text">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn('cursor-pointer align-top', isRowActive?.(row.original) && 'bg-accent/60')}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell
                      key={cell.id}
                      className={cn('px-3 py-2', (cell.column.columnDef.meta as ColumnMeta)?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  {empty ?? <div className="py-10 text-center text-sm text-muted-foreground">No results.</div>}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}
