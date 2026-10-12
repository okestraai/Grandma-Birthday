import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { CapacityAllocations, UpdateCapacityAllocationsRequest } from '@birthday/types';
import { api, errorMessage, isApiError } from '@/lib/api';
import { adminKeys, useAdminMutation } from '@/lib/admin-api';
import { allocationsQuery } from '@/lib/admin-queries';
import { ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AButton, AInput, Panel, adminButton } from '../ui';
import { Meter } from '../misc';
import { PEOPLE_COMING_NOTE, parsePlaces } from './allocations';

type Drafts = Record<string, string>;

function toDrafts(data: CapacityAllocations): Drafts {
  return Object.fromEntries(data.categories.map((c) => [c.categoryId, c.capacity === null ? '' : String(c.capacity)]));
}

const plural = (n: number | undefined, one: string, many = `${one}s`) => `${(n ?? 0).toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Splits the celebration capacity across guest categories (GET/PUT /admin/celebration/allocations).
 * Every category is sent on save; blank means "no separate limit".
 */
export function CategoryAllocations() {
  const queryClient = useQueryClient();
  const query = useQuery(allocationsQuery);
  const data = query.data;
  const [drafts, setDrafts] = useState<Drafts>({});
  const [serverErrors, setServerErrors] = useState<{ rows: Record<string, string>; summary?: string }>({ rows: {} });

  const initial = useMemo(() => (data ? toDrafts(data) : {}), [data]);
  const dirty = data ? data.categories.some((c) => (drafts[c.categoryId] ?? '') !== (initial[c.categoryId] ?? '')) : false;

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // Follow the server copy (first load, another tab saved, a category was added). Unsaved edits are kept.
  useEffect(() => {
    if (!data) return;
    setDrafts((current) => (dirtyRef.current ? { ...toDrafts(data), ...current } : toDrafts(data)));
  }, [data]);

  const save = useAdminMutation<CapacityAllocations, UpdateCapacityAllocationsRequest>({
    mutationFn: (body) => api.put<CapacityAllocations>('/admin/celebration/allocations', body),
    invalidate: [adminKeys.celebration, adminKeys.allocations, adminKeys.categories, adminKeys.dashboard],
    success: 'Category places saved.',
    toastError: false,
    onSuccess: (saved) => {
      queryClient.setQueryData(adminKeys.allocations, saved);
      setDrafts(toDrafts(saved));
      setServerErrors({ rows: {} });
    },
    onError: (error) => {
      if (isApiError(error, 'VALIDATION_FAILED') && error.details && data) {
        const rows: Record<string, string> = {};
        let summary: string | undefined;
        for (const [key, messages] of Object.entries(error.details)) {
          const match = /^allocations\.(\d+)\./.exec(key);
          const row = match ? data.categories[Number(match[1])] : undefined;
          if (row) rows[row.categoryId] = messages[0] ?? 'Invalid value';
          else summary = messages[0] ?? error.message;
        }
        setServerErrors({ rows, summary: summary ?? (Object.keys(rows).length ? undefined : error.message) });
        toast.error(summary ?? 'Please correct the highlighted places.');
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError || !data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const rows = data.categories.map((c) => {
    const raw = drafts[c.categoryId] ?? '';
    const places = parsePlaces(raw);
    let error: string | undefined;
    if (places === undefined) error = 'Enter a whole number, or leave blank for no limit.';
    else if (places !== null && places < c.confirmedPeople)
      error = `${plural(c.confirmedPeople, 'person is', 'people are')} already coming; allow at least ${c.confirmedPeople}.`;
    return { ...c, raw, places, error: error ?? serverErrors.rows[c.categoryId] };
  });
  const allocated = rows.reduce((sum, r) => sum + (typeof r.places === 'number' ? r.places : 0), 0);
  const overBy = allocated - data.capacity;
  const unallocated = Math.max(0, data.capacity - allocated);
  const hasRowErrors = rows.some((r) => r.places === undefined || (r.places !== null && r.places < r.confirmedPeople));
  const blocked = overBy > 0 || hasRowErrors;

  const onSave = () => {
    setServerErrors({ rows: {} });
    if (blocked) return;
    save.mutate({ allocations: rows.map((r) => ({ categoryId: r.categoryId, capacity: r.places ?? null })) });
  };

  const addLink = (
    <Link to="/admin/guest-categories" className={adminButton({ variant: 'outline', size: 'sm' })}>
      <Plus aria-hidden /> Add or edit categories
    </Link>
  );

  return (
    <Panel
      id="event-allocations"
      className="min-w-0"
      title="Guest categories"
      description="Set aside places for each category. When a category's places are taken, new RSVPs choosing it are refused; the rest of the capacity stays open to everyone else."
      actions={addLink}
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">
          There are no guest categories yet. Add some on the{' '}
          <Link to="/admin/guest-categories" className="font-medium text-navy underline underline-offset-2">
            Guest categories
          </Link>{' '}
          page to set aside places for them.
        </p>
      ) : (
        // A <div>, not a <form>: this panel renders inside the celebration form. Enter saves the places instead.
        <div
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
              e.preventDefault();
              onSave();
            }
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-left text-[13px]">
              <caption className="sr-only">Places set aside per guest category</caption>
              <thead>
                <tr className="border-b border-navy/10 text-xs font-medium text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Category
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    People coming
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Places set aside
                  </th>
                  <th scope="col" className="py-2 pl-2 font-medium">
                    Remaining
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const inputId = `alloc-${r.categoryId}`;
                  const remaining = typeof r.places === 'number' ? r.places - r.confirmedPeople : null;
                  return (
                    <tr key={r.categoryId} className="border-b border-navy/[0.06] align-top last:border-0">
                      <th scope="row" className="py-2 pr-2 font-medium text-navy">
                        <label htmlFor={inputId} className="flex items-start gap-2 pt-1">
                          <span
                            className="mt-1 size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                            style={{ backgroundColor: r.color ?? 'transparent' }}
                            aria-hidden
                          />
                          <span className="min-w-0">
                            <span className="block">{r.name}</span>
                            <span className="block text-xs font-normal text-muted">{plural(r.guestCount, 'invitation')}</span>
                          </span>
                        </label>
                      </th>
                      <td className="px-2 py-2 pt-3 text-right tabular-nums">{(r.confirmedPeople ?? 0).toLocaleString()}</td>
                      <td className="px-2 py-2">
                        <AInput
                          id={inputId}
                          aria-label={`Places set aside for ${r.name}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          placeholder="No limit"
                          value={r.raw}
                          onChange={(e) => {
                            const value = e.target.value;
                            setDrafts((d) => ({ ...d, [r.categoryId]: value }));
                          }}
                          className="w-24 tabular-nums"
                          aria-invalid={!!r.error}
                          aria-describedby={r.error ? `${inputId}-msg` : undefined}
                        />
                        {r.error && (
                          <p id={`${inputId}-msg`} role="alert" className="mt-1 max-w-44 text-xs text-error">
                            {r.error}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pl-2 pt-3">
                        {remaining === null ? (
                          <span className="text-xs text-muted">Shares the open seats</span>
                        ) : (
                          <div className="w-28">
                            <p className={cn('text-xs tabular-nums', remaining <= 0 ? 'font-medium text-error' : 'text-charcoal')}>
                              {remaining <= 0 ? 'Full' : `${plural(remaining, 'seat')} left`}
                            </p>
                            <Meter
                              className="mt-1"
                              value={r.confirmedPeople}
                              max={Math.max(r.places as number, 1)}
                              label={`${r.name}: ${r.confirmedPeople} of ${r.places} places taken`}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            className={cn(
              'mt-3 rounded-lg px-3 py-2 text-[13px]',
              overBy > 0 ? 'border border-error/30 bg-error/5 text-error' : 'bg-cream/60 text-charcoal',
            )}
            aria-live="polite"
          >
            <p className="tabular-nums">
              Allocated <strong>{allocated.toLocaleString()}</strong> of {plural(data.capacity, 'seat')} · {unallocated.toLocaleString()} not
              allocated · {plural(data.uncategorisedPeople, 'person', 'people')} coming with no category
            </p>
            {overBy > 0 && (
              <p role="alert" className="mt-1 flex items-start gap-1.5 font-medium">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                The categories add up to {allocated.toLocaleString()} seats, {overBy.toLocaleString()} more than the celebration capacity of{' '}
                {data.capacity.toLocaleString()}. Lower some categories, or raise the capacity first.
              </p>
            )}
            {serverErrors.summary && overBy <= 0 && (
              <p role="alert" className="mt-1 font-medium text-error">
                {serverErrors.summary}
              </p>
            )}
          </div>

          <p className="mt-2 text-xs text-muted">{PEOPLE_COMING_NOTE}</p>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {dirty && (
              <span className="mr-auto text-xs text-muted" aria-live="polite">
                Unsaved changes
              </span>
            )}
            <AButton
              variant="ghost"
              disabled={!dirty || save.isPending}
              onClick={() => {
                setDrafts(initial);
                setServerErrors({ rows: {} });
              }}
            >
              Reset
            </AButton>
            <AButton variant="emerald" loading={save.isPending} disabled={!dirty || blocked} onClick={onSave}>
              Save places
            </AButton>
          </div>
        </div>
      )}
    </Panel>
  );
}

