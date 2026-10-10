import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { LIVE_REFRESH_MS } from '@/lib/query';
import { LiveRefresh } from '@/components/admin/live-refresh';
import { Check, Eye, EyeOff, Trash2, X } from 'lucide-react';
import type { AdminTestimonial, BulkTestimonialRequest, TestimonialFilter } from '@birthday/types';
import { testimonialCountsQuery, testimonialListParams, testimonialListQuery } from '@/lib/admin-queries';
import { AButton, BulkBar, FilterBar, FilterTabs, PageHeader, SearchInput, type FilterTab } from '@/components/admin/ui';
import { DataTable, Pagination, type Column } from '@/components/admin/data-table';
import { Confirm } from '@/components/admin/overlays';
import { DateCell } from '@/components/admin/misc';
import { PublicSwitch } from '@/components/admin/testimonials/PublicSwitch';
import { TestimonialActions } from '@/components/admin/testimonials/TestimonialActions';
import { TestimonialStatus } from '@/components/admin/testimonials/TestimonialStatus';
import { TestimonialViewDialog } from '@/components/admin/testimonials/TestimonialViewDialog';
import { TestimonialEditDialog } from '@/components/admin/testimonials/TestimonialEditDialog';
import { useTestimonialMutations } from '@/components/admin/testimonials/useTestimonialMutations';
import { ActionGuide } from '@/components/admin/action-guide';
import { TESTIMONIAL_ACTIONS } from '@/components/admin/action-guide-content';

const FILTERS: { value: TestimonialFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'featured', label: 'Featured' },
  { value: 'public', label: 'Public' },
];

export default function TestimonialsAdminPage() {
  const [params, setParams] = useSearchParams();
  const [pageSize, setPageSize] = useState(25);
  const listParams = testimonialListParams(params, pageSize);
  const { filter, q } = listParams;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewId, setViewId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminTestimonial | null>(null);
  const [deleting, setDeleting] = useState<AdminTestimonial | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const setQuery = (next: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(next)) {
          if (value === null || value === '') out.delete(key);
          else out.set(key, value);
        }
        return out;
      },
      { replace: true },
    );
    setSelected(new Set());
  };

  const list = useQuery({ ...testimonialListQuery(listParams), placeholderData: keepPreviousData, refetchInterval: LIVE_REFRESH_MS });
  const counts = useQuery({ ...testimonialCountsQuery, refetchInterval: LIVE_REFRESH_MS });

  const { patch, bulk, remove } = useTestimonialMutations({
    onDeleted: (id) => {
      setDeleting(null);
      if (viewId === id) setViewId(null);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onBulkDone: () => {
      setSelected(new Set());
      setBulkDeleteOpen(false);
    },
  });

  const rows = list.data?.items;
  const viewing = useMemo(() => rows?.find((r) => r.id === viewId) ?? null, [rows, viewId]);

  const tabs: FilterTab<TestimonialFilter>[] = FILTERS.map((f) => ({ ...f, count: counts.data?.[f.value] }));
  const runBulk = (action: BulkTestimonialRequest['action']) => bulk.mutate({ ids: [...selected], action });

  const actionsFor = (t: AdminTestimonial) => ({
    onPatch: (p: Parameters<typeof patch>[1]) => patch(t.id, p),
    onEdit: () => setEditing(t),
    onDelete: () => setDeleting(t),
  });

  const columns: Column<AdminTestimonial>[] = [
    {
      id: 'guest',
      header: 'Guest',
      cell: (t) => (
        <div className="min-w-0">
          <p className="font-medium text-navy">
            {t.authorName}
            {t.fromRsvp && <span className="ml-1.5 rounded-full bg-emerald/10 px-1.5 py-0.5 align-middle text-[11px] font-medium text-emerald" title="Written in the RSVP form">via RSVP</span>}
          </p>
          {t.email && <p className="truncate text-xs text-muted">{t.email}</p>}
        </div>
      ),
    },
    { id: 'relationship', header: 'Relationship', hideBelow: 'lg', cell: (t) => t.relationship ?? <span className="text-muted">—</span> },
    {
      id: 'message',
      header: 'Message',
      className: 'max-w-[22rem]',
      cell: (t) => <p className="line-clamp-2 text-charcoal">{t.message}</p>,
    },
    { id: 'status', header: 'Status', cell: (t) => <TestimonialStatus testimonial={t} /> },
    {
      id: 'public',
      header: 'Public',
      cell: (t) => (
        <span onClick={(e) => e.stopPropagation()}>
          <PublicSwitch testimonial={t} onChange={(isPublic) => patch(t.id, { isPublic })} />
        </span>
      ),
    },
    { id: 'submitted', header: 'Submitted', hideBelow: 'xl', cell: (t) => <DateCell iso={t.createdAt} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (t) => <TestimonialActions testimonial={t} onView={() => setViewId(t.id)} {...actionsFor(t)} />,
    },
  ];

  const emptyTitle =
    q !== '' ? 'No testimonials match your search' : filter === 'pending' ? 'Nothing waiting for review' : 'No testimonials here yet';

  return (
    <>
      <PageHeader
        title="Testimonials"
        description="Approve messages from guests, then choose which appear on the public website. Approving does not publish."
        actions={
          <LiveRefresh
            updatedAt={list.dataUpdatedAt}
            fetching={list.isFetching}
            onRefresh={() => {
              void list.refetch();
              void counts.refetch();
            }}
          />
        }
      />
      <ActionGuide page="testimonials" rows={TESTIMONIAL_ACTIONS} />

      <FilterBar className="justify-between">
        <FilterTabs label="Filter testimonials" tabs={tabs} value={filter} onChange={(value) => setQuery({ filter: value === 'all' ? null : value, page: null })} />
        <SearchInput value={q} onChange={(value) => setQuery({ q: value, page: null })} placeholder="Search name, email or message" label="Search testimonials" />
      </FilterBar>

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <AButton size="sm" variant="emerald" loading={bulk.isPending && bulk.variables?.action === 'APPROVE'} onClick={() => runBulk('APPROVE')}>
          <Check aria-hidden /> Approve
        </AButton>
        <AButton size="sm" loading={bulk.isPending && bulk.variables?.action === 'REJECT'} onClick={() => runBulk('REJECT')}>
          <X aria-hidden /> Reject
        </AButton>
        <AButton size="sm" loading={bulk.isPending && bulk.variables?.action === 'PUBLISH'} onClick={() => runBulk('PUBLISH')}>
          <Eye aria-hidden /> Publish
        </AButton>
        <AButton size="sm" loading={bulk.isPending && bulk.variables?.action === 'UNPUBLISH'} onClick={() => runBulk('UNPUBLISH')}>
          <EyeOff aria-hidden /> Unpublish
        </AButton>
        <AButton size="sm" variant="danger-ghost" onClick={() => setBulkDeleteOpen(true)}>
          <Trash2 aria-hidden /> Delete
        </AButton>
      </BulkBar>
      {selected.size > 0 && (
        <p className="-mt-1 mb-3 text-xs text-muted">Only approved testimonials can be published.</p>
      )}

      <DataTable
        caption="Testimonials"
        columns={columns}
        rows={rows}
        getRowId={(t) => t.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        emptyTitle={emptyTitle}
        emptyDescription={filter === 'all' && !q ? 'Messages guests send from the public site appear here for review.' : undefined}
        selected={selected}
        onSelectedChange={setSelected}
        rowLabel={(t) => `testimonial from ${t.authorName}`}
        onRowClick={(t) => setViewId(t.id)}
        rowClassName={(t) => (t.status === 'PENDING' ? 'bg-warning/[0.03]' : undefined)}
        mobileCard={(t) => (
          <div className="space-y-2">
            <button type="button" className="block w-full text-left" onClick={() => setViewId(t.id)}>
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-navy">
                  {t.authorName}
                  {t.fromRsvp && <span className="ml-1.5 rounded-full bg-emerald/10 px-1.5 py-0.5 align-middle text-[11px] font-medium text-emerald" title="Written in the RSVP form">via RSVP</span>}
                </span>
                <TestimonialStatus testimonial={t} />
              </span>
              {t.relationship && <span className="block text-xs text-muted">{t.relationship}</span>}
              <span className="mt-1 line-clamp-2 block text-[13px] text-charcoal">{t.message}</span>
            </button>
            <PublicSwitch testimonial={t} showLabel onChange={(isPublic) => patch(t.id, { isPublic })} />
            <TestimonialActions testimonial={t} layout="buttons" {...actionsFor(t)} />
          </div>
        )}
      />

      {list.data && (
        <Pagination
          page={list.data.page}
          totalPages={list.data.totalPages}
          total={list.data.total}
          pageSize={pageSize}
          onPageChange={(p) => setQuery({ page: p <= 1 ? null : String(p) })}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setQuery({ page: null });
          }}
        />
      )}

      <TestimonialViewDialog
        testimonial={viewing}
        open={viewId !== null}
        onOpenChange={(open) => !open && setViewId(null)}
        onPatch={(p) => viewing && patch(viewing.id, p)}
        onEdit={() => viewing && setEditing(viewing)}
        onDelete={() => viewing && setDeleting(viewing)}
      />

      <TestimonialEditDialog testimonial={editing} open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} />

      <Confirm
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this testimonial?"
        description={
          <>
            The message from <strong>{deleting?.authorName}</strong> and any attached photo or video will be removed permanently.
          </>
        }
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />

      <Confirm
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selected.size} testimonial${selected.size === 1 ? '' : 's'}?`}
        description="The selected messages and their photos or videos will be removed permanently."
        confirmLabel="Delete"
        loading={bulk.isPending && bulk.variables?.action === 'DELETE'}
        onConfirm={() => runBulk('DELETE')}
      />
    </>
  );
}
