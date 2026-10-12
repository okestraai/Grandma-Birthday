import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, UserPlus } from 'lucide-react';
import type { AdminGuestListItem } from '@birthday/types';
import { adminHref } from '@/lib/admin-api';
import { GUEST_PAGE_SIZES, GUEST_SORTS, guestListParams, guestListQuery } from '@/lib/admin-queries';
import { AButton, AField, AInput, ASelect, FilterBar, PageHeader, SearchInput, adminButton } from '@/components/admin/ui';
import { DataTable, Pagination, type Column } from '@/components/admin/data-table';
import { DateCell } from '@/components/admin/misc';
import { GuestDetailDrawer } from '@/components/admin/guests/GuestDetailDrawer';
import { GuestFormDialog } from '@/components/admin/guests/GuestFormDialog';
import { CategoryLabel, EventChips, InvitationCell, RsvpBadge, useEvents, useGuestCategories } from '@/components/admin/guests/shared';
import { ActionGuide } from '@/components/admin/action-guide';
import { INVITATION_ACTIONS } from '@/components/admin/action-guide-content';

const FILTER_KEYS = ['q', 'categoryId', 'eventId', 'rsvp', 'checkIn', 'from', 'to', 'sort'] as const;

export default function GuestsPage() {
  const [params, setParams] = useSearchParams();
  const categories = useGuestCategories();
  const events = useEvents();
  const multiple = (events.data?.length ?? 0) > 1;
  const [adding, setAdding] = useState(false);

  const listParams = guestListParams(params);
  const { page: _page, pageSize, ...filters } = listParams;
  const guestId = params.get('guest');

  const update = (next: Record<string, string | number | null>, keepPage = false) =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(next)) {
          if (value === null || value === '') out.delete(key);
          else out.set(key, String(value));
        }
        if (!keepPage) out.delete('page');
        return out;
      },
      { replace: true },
    );

  const list = useQuery({ ...guestListQuery(listParams), placeholderData: keepPreviousData });

  const colorFor = (categoryId: string | null) => categories.data?.find((c) => c.id === categoryId)?.color ?? null;
  const openGuest = (id: string | null) =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (id) out.set('guest', id);
        else out.delete('guest');
        return out;
      },
      { replace: !id },
    );

  const activeFilters = FILTER_KEYS.filter((k) => k !== 'sort' && filters[k] !== '').length;

  const columns: Column<AdminGuestListItem>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (g) => (
        <div>
          <p className="font-medium text-navy">{g.fullName}</p>
          {g.source === 'SELF_REGISTERED' && <p className="text-xs text-muted">Self-registered</p>}
        </div>
      ),
    },
    { id: 'email', header: 'Email', cell: (g) => <span className="break-all">{g.email}</span> },
    // With several events the Events column takes their place; both stay in the guest's details.
    ...(multiple ? [] : [{ id: 'phone', header: 'Phone', hideBelow: 'xl', cell: (g) => g.phone ?? <span className="text-muted">—</span> } satisfies Column<AdminGuestListItem>]),
    { id: 'category', header: 'Category', hideBelow: 'lg', cell: (g) => <CategoryLabel name={g.categoryName} color={colorFor(g.categoryId)} /> },
    {
      id: 'party',
      header: 'Party',
      className: 'tabular-nums',
      cell: (g) => (
        <span title={`${g.companionCount} of ${g.allowedCompanions} companions`}>
          {g.partySize}
          <span className="text-muted"> / {g.allowedCompanions + 1}</span>
        </span>
      ),
    },
    { id: 'rsvp', header: 'RSVP', cell: (g) => <RsvpBadge response={g.rsvpResponse} /> },
    ...(multiple
      ? [{ id: 'events', header: 'Events', hideBelow: 'lg', cell: (g) => <EventChips guestEvents={g.events} events={events.data} /> } satisfies Column<AdminGuestListItem>]
      : []),
    { id: 'invitation', header: 'Invitation', hideBelow: 'lg', cell: (g) => <InvitationCell invitation={g.invitation} /> },
    {
      id: 'checkedIn',
      header: 'Checked in',
      cell: (g) => (g.checkedInAt ? <DateCell iso={g.checkedInAt} /> : <span className="text-muted">—</span>),
    },
    ...(multiple ? [] : [{ id: 'registered', header: 'Registered', hideBelow: 'xl', cell: (g) => <DateCell iso={g.createdAt} /> } satisfies Column<AdminGuestListItem>]),
  ];

  const exportQuery = Object.fromEntries(FILTER_KEYS.map((k) => [k, filters[k]]));

  return (
    <>
      <PageHeader
        title="Guests"
        description="Everyone invited or registered, with their RSVP, invitation and check-in status."
        actions={
          <>
            <a href={adminHref('/admin/guests/export.csv', exportQuery)} download className={adminButton({ variant: 'outline', size: 'md' })}>
              <Download aria-hidden /> Export CSV
            </a>
            <AButton variant="emerald" onClick={() => setAdding(true)}>
              <UserPlus aria-hidden /> Add guest
            </AButton>
          </>
        }
      />
      <ActionGuide page="guests" rows={INVITATION_ACTIONS} />

      <FilterBar>
        <SearchInput value={filters.q} onChange={(q) => update({ q })} placeholder="Name, email, phone or code" label="Search guests" />
        <ASelect aria-label="Category" value={filters.categoryId} onChange={(e) => update({ categoryId: e.target.value })} className="w-full sm:w-44">
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </ASelect>
        {(multiple || filters.eventId) && (
          <ASelect aria-label="Event" value={filters.eventId} onChange={(e) => update({ eventId: e.target.value })} className="w-full sm:w-48">
            <option value="">All events</option>
            {events.data?.map((e) => (
              <option key={e.id} value={e.id}>
                Attending {e.name}
              </option>
            ))}
          </ASelect>
        )}
        <ASelect aria-label="RSVP" value={filters.rsvp} onChange={(e) => update({ rsvp: e.target.value })} className="w-full sm:w-36">
          <option value="">Any RSVP</option>
          <option value="ATTENDING">Attending</option>
          <option value="DECLINED">Declined</option>
          <option value="NONE">No reply</option>
        </ASelect>
        <ASelect aria-label="Check-in" value={filters.checkIn} onChange={(e) => update({ checkIn: e.target.value })} className="w-full sm:w-40">
          <option value="">Any check-in</option>
          <option value="IN">{filters.eventId ? 'Checked in there' : 'Checked in'}</option>
          <option value="OUT">{filters.eventId ? 'Not checked in there' : 'Not checked in'}</option>
        </ASelect>
        <AField label="Registered from" htmlFor="guests-from" className="w-[calc(50%-0.25rem)] sm:w-40">
          <AInput id="guests-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
        </AField>
        <AField label="Registered to" htmlFor="guests-to" className="w-[calc(50%-0.25rem)] sm:w-40">
          <AInput id="guests-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
        </AField>
        <ASelect aria-label="Sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? null : e.target.value })} className="w-full sm:w-40">
          {GUEST_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </ASelect>
        {activeFilters > 0 && (
          <AButton variant="ghost" onClick={() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}>
            Clear filters
          </AButton>
        )}
      </FilterBar>

      <DataTable
        caption="Guests"
        columns={columns}
        rows={list.data?.items}
        getRowId={(g) => g.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        onRowClick={(g) => openGuest(g.id)}
        rowClassName={(g) => (g.id === guestId ? 'bg-champagne/25' : undefined)}
        emptyTitle={activeFilters > 0 ? 'No guests match these filters' : 'No guests yet'}
        emptyDescription={activeFilters > 0 ? 'Try clearing a filter.' : 'Add a guest, or wait for guests to register on the website.'}
        emptyAction={
          activeFilters === 0 ? (
            <AButton variant="emerald" onClick={() => setAdding(true)}>
              <UserPlus aria-hidden /> Add guest
            </AButton>
          ) : undefined
        }
        mobileCard={(g) => (
          <button type="button" className="block w-full space-y-1.5 text-left" onClick={() => openGuest(g.id)}>
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-medium text-navy">{g.fullName}</span>
                <span className="block truncate text-xs text-muted">{g.email}</span>
              </span>
              <RsvpBadge response={g.rsvpResponse} />
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <CategoryLabel name={g.categoryName} color={colorFor(g.categoryId)} />
              <span>Party of {g.partySize}</span>
              <span>{g.checkedInAt ? 'Checked in' : 'Not checked in'}</span>
            </span>
            {multiple && g.events.length > 0 && <EventChips guestEvents={g.events} events={events.data} />}
            <InvitationCell invitation={g.invitation} />
          </button>
        )}
      />

      {list.data && (
        <Pagination
          page={list.data.page}
          totalPages={list.data.totalPages}
          total={list.data.total}
          pageSize={pageSize}
          pageSizes={GUEST_PAGE_SIZES}
          onPageChange={(p) => update({ page: p <= 1 ? null : p }, true)}
          onPageSizeChange={(size) => update({ pageSize: size === 25 ? null : size })}
        />
      )}

      <GuestDetailDrawer guestId={guestId} onClose={() => openGuest(null)} />
      <GuestFormDialog open={adding} onOpenChange={setAdding} onSaved={(g) => openGuest(g.id)} />
    </>
  );
}
