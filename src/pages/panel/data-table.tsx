import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@src/components/ui/table';
import React from 'react';
import { Input } from '@src/components/ui/input';
import { DataTablePagination } from '@src/pages/panel/data-table-pagination';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function DataTable<TData, TValue>({ columns, data }: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      columnFilters,
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none pt-2 pb-4 flex items-center justify-between">
        <div className="flex flex-1 items-center space-x-2">
          {table.getColumn('message') && (
            <Input
              placeholder="Filter messages..."
              value={(table.getColumn('message')?.getFilterValue() as string) ?? ''}
              onChange={event => table.getColumn('message')?.setFilterValue(event.target.value)}
              className="h-8 w-[150px] lg:w-[250px]"
            />
          )}
          {table.getColumn('listener') && (
            <Input
              placeholder="Filter listeners..."
              value={(table.getColumn('listener')?.getFilterValue() as string) ?? ''}
              onChange={event => table.getColumn('listener')?.setFilterValue(event.target.value)}
              className="h-8 w-[150px] lg:w-[250px]"
            />
          )}
        </div>
      </div>
      <div className="rounded-md border flex-grow overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="w-full overflow-auto select-text">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow className="cursor-pointer" key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
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
