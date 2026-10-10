import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { ACheckbox, AButton, ASelect } from './ui';

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** When set, the header becomes a sort button reporting this key. */
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  /** Hide below this breakpoint to keep tables readable on tablets. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  /** Selection is enabled when both are provided. */
  selected?: Set<string>;
  onSelectedChange?: (selected: Set<string>) => void;
  /** Accessible label for each row's checkbox, e.g. the guest's name. */
  rowLabel?: (row: T) => string;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  onRowClick?: (row: T) => void;
  /** Rendered instead of the table below `md`, one card per row. */
  mobileCard?: (row: T) => ReactNode;
  caption?: string;
  skeletonRows?: number;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
}

const hideClass = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' };

/** Toggle helper for selection sets. */
export function toggleInSet(set: Set<string>, id: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  selected,
  onSelectedChange,
  rowLabel,
  sort,
  onSortChange,
  onRowClick,
  mobileCard,
  caption,
  skeletonRows = 6,
  className,
  rowClassName,
}: DataTableProps<T>) {
  const selectable = !!selected && !!onSelectedChange;
  const ids = rows?.map(getRowId) ?? [];
  const selectedOnPage = ids.filter((id) => selected?.has(id)).length;
  const headerState: boolean | 'indeterminate' =
    ids.length > 0 && selectedOnPage === ids.length ? true : selectedOnPage > 0 ? 'indeterminate' : false;

  const toggleAll = (on: boolean) => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onSelectedChange(next);
  };

  if (error && !loading) return <ErrorState error={error} onRetry={onRetry} className={className} />;

  const isEmpty = !loading && rows && rows.length === 0;
  if (isEmpty) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} className={cn('bg-white', className)} />;

  const colCount = columns.length + (selectable ? 1 : 0);

  return (
    <div className={className}>
      {mobileCard && (
        <ul className="space-y-2 md:hidden" aria-label={caption}>
          {loading || !rows
            ? Array.from({ length: 4 }, (_, i) => <li key={i} className="h-20 animate-pulse rounded-xl bg-navy/[0.06]" aria-hidden />)
            : rows.map((row) => {
                const id = getRowId(row);
                return (
                  <li key={id} className="flex gap-3 rounded-xl border border-navy/10 bg-white p-3">
                    {selectable && (
                      <ACheckbox
                        className="mt-1"
                        checked={selected!.has(id)}
                        onCheckedChange={(on) => onSelectedChange!(toggleInSet(selected!, id, on))}
                        aria-label={`Select ${rowLabel?.(row) ?? 'row'}`}
                      />
                    )}
                    <div className="min-w-0 flex-1">{mobileCard(row)}</div>
                  </li>
                );
              })}
        </ul>
      )}
      <div className={cn('overflow-x-auto rounded-xl border border-navy/10 bg-white', mobileCard && 'hidden md:block')}>
        <table className="w-full min-w-[640px] border-collapse text-left text-[13px]" aria-busy={loading || undefined}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-navy/10 bg-cream/50 text-xs font-medium text-muted">
              {selectable && (
                <th scope="col" className="w-10 px-3 py-2.5">
                  <ACheckbox checked={headerState} onCheckedChange={(on) => toggleAll(on && headerState !== true)} aria-label="Select all rows on this page" />
                </th>
              )}
              {columns.map((col) => {
                const active = sort && col.sortKey && sort.key === col.sortKey;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn('whitespace-nowrap px-3 py-2.5 font-medium', col.hideBelow && hideClass[col.hideBelow], col.headerClassName)}
                  >
                    {col.sortKey && onSortChange ? (
                      <button
                        type="button"
                        className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-navy"
                        onClick={() =>
                          onSortChange({ key: col.sortKey!, dir: active && sort!.dir === 'asc' ? 'desc' : 'asc' })
                        }
                      >
                        {col.header}
                        {active ? (
                          sort!.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading || !rows
              ? Array.from({ length: skeletonRows }, (_, i) => (
                  <tr key={i} className="border-b border-navy/[0.06] last:border-0">
                    <td colSpan={colCount} className="px-3 py-3">
                      <div className="h-4 animate-pulse rounded bg-navy/[0.06]" aria-hidden />
                    </td>
                  </tr>
                ))
              : rows.map((row) => {
                  const id = getRowId(row);
                  const isSelected = selected?.has(id) ?? false;
                  return (
                    <tr
                      key={id}
                      aria-selected={selectable ? isSelected : undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        'border-b border-navy/[0.06] align-middle transition-colors last:border-0 hover:bg-cream/40',
                        isSelected && 'bg-champagne/25 hover:bg-champagne/35',
                        onRowClick && 'cursor-pointer',
                        rowClassName?.(row),
                      )}
                    >
                      {selectable && (
                        <td className="w-10 px-3 py-2">
                          <ACheckbox
                            checked={isSelected}
                            onCheckedChange={(on) => onSelectedChange!(toggleInSet(selected!, id, on))}
                            aria-label={`Select ${rowLabel?.(row) ?? 'row'}`}
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.id} className={cn('px-3 py-2', col.hideBelow && hideClass[col.hideBelow], col.className)}>
                          {col.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizes = [25, 50, 100],
  className,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizes?: number[];
  className?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className={cn('mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted', className)}>
      <p aria-live="polite">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Rows</span>
            <ASelect
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="w-20"
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </ASelect>
          </label>
        )}
        <AButton size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft aria-hidden /> <span className="hidden sm:inline">Prev</span>
        </AButton>
        <span className="tabular-nums">
          Page {page} of {Math.max(1, totalPages)}
        </span>
        <AButton size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
          <span className="hidden sm:inline">Next</span> <ChevronRight aria-hidden />
        </AButton>
      </div>
    </nav>
  );
}
