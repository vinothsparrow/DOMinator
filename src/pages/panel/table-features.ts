import {
  columnVisibilityFeature,
  createCoreRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type ReactTable,
} from '@tanstack/react-table';

/**
 * Feature set shared by the panel tables.
 *
 * Table v9 no longer bundles every feature by default: each row model, and each
 * built-in sorting function, has to be opted into here.
 */
export const panelTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  rowPaginationFeature,
  coreRowModel: createCoreRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
});

export type PanelTableFeatures = typeof panelTableFeatures;

/** Concrete type of the tables produced by `useTable` with this feature set. */
export type PanelTable<TData> = ReactTable<PanelTableFeatures, TData>;
