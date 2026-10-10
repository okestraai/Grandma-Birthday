import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FilterX, X } from 'lucide-react';
import { AUDIT_PAGE_SIZES, auditParams, auditQuery } from '@/lib/admin-queries';
import { AButton, AInput, FilterBar, PageHeader, SearchInput } from '@/components/admin/ui';
import { Pagination } from '@/components/admin/data-table';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { AuditTable } from '@/components/admin/audit/AuditTable';

/** Text input with a datalist that reports its value after the user pauses typing. */
function EntityTypeInput({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onChangeRef.current(draft.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [draft, value]);

  return (
    <div className="w-full sm:w-52">
      <AInput
        list="audit-entity-types"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onChangeRef.current(draft.trim());
        }}
        placeholder="Entity type"
        aria-label="Filter by entity type"
        autoComplete="off"
      />
      <datalist id="audit-entity-types">
        {options.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>
    </div>
  );
}

export default function AuditLogsPage() {
  const [params, setParams] = useSearchParams();
  const filters = auditParams(params);
  const { action, entityType, actorId, pageSize } = filters;

  const [actorLabels, setActorLabels] = useState<Record<string, string>>({});
  const [entityTypes, setEntityTypes] = useState<string[]>([]);

  const update = (changes: Record<string, string | number | null>, resetPage = true) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, String(value));
        }
        if (resetPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  const query = useQuery({ ...auditQuery(filters), placeholderData: keepPreviousData });

  // Remember every entity type and actor seen, for the datalist and the actor chip.
  useEffect(() => {
    const items = query.data?.items;
    if (!items?.length) return;
    setEntityTypes((prev) => {
      const set = new Set(prev);
      let changed = false;
      for (const item of items) {
        if (!set.has(item.entityType)) {
          set.add(item.entityType);
          changed = true;
        }
      }
      return changed ? [...set].sort() : prev;
    });
    setActorLabels((prev) => {
      const missing = items.filter((i) => i.actorId && i.actorEmail && prev[i.actorId] !== i.actorEmail);
      if (!missing.length) return prev;
      const next = { ...prev };
      for (const i of missing) next[i.actorId!] = i.actorEmail!;
      return next;
    });
  }, [query.data]);

  const hasFilters = !!(action || entityType || actorId);
  const data = query.data;

  return (
    <>
      <PageHeader title="Audit log" description="A permanent record of every change made in the dashboard, and by whom." />

      <FilterBar>
        <SearchInput value={action} onChange={(v) => update({ action: v.trim() })} label="Filter by action" placeholder="Action, e.g. guest.create" />
        <EntityTypeInput value={entityType} onChange={(v) => update({ entityType: v })} options={entityTypes} />
        {actorId && (
          <span className="inline-flex h-10 items-center gap-1 rounded-lg border border-gold/50 bg-champagne/30 pl-3 pr-1 text-[13px] text-navy md:h-9">
            <span className="text-muted">Actor:</span>
            <span className="max-w-48 truncate font-medium">{actorLabels[actorId] ?? `${actorId.slice(0, 8)}…`}</span>
            <button
              type="button"
              onClick={() => update({ actorId: null })}
              className="flex size-8 items-center justify-center rounded-md text-muted hover:text-navy md:size-7"
              aria-label="Remove actor filter"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        )}
        {hasFilters && (
          <AButton variant="ghost" onClick={() => update({ action: null, entityType: null, actorId: null })}>
            <FilterX aria-hidden /> Clear filters
          </AButton>
        )}
        {query.isFetching && !query.isPending && (
          <span className="ml-auto self-center text-xs text-muted" aria-live="polite">
            Updating…
          </span>
        )}
      </FilterBar>

      {query.isError && !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No entries match these filters' : 'No activity recorded yet'}
          description={hasFilters ? 'Try a different action or entity type, or clear the filters.' : 'Changes made in the dashboard will appear here.'}
          action={
            hasFilters ? (
              <AButton onClick={() => update({ action: null, entityType: null, actorId: null })}>
                <FilterX aria-hidden /> Clear filters
              </AButton>
            ) : undefined
          }
          className="bg-white"
        />
      ) : (
        <div className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <AuditTable
            rows={data?.items}
            loading={query.isPending}
            onFilterActor={(id, label) => {
              setActorLabels((prev) => ({ ...prev, [id]: label }));
              update({ actorId: id });
            }}
          />
        </div>
      )}

      {data && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={pageSize}
          pageSizes={AUDIT_PAGE_SIZES}
          onPageChange={(p) => update({ page: p }, false)}
          onPageSizeChange={(size) => update({ pageSize: size })}
        />
      )}
    </>
  );
}
