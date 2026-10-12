import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import type { AdminEvent, AdminGuestListItem, RsvpResponse } from '@birthday/types';
import { categoriesQuery, eventsQuery } from '@/lib/admin-queries';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { formatRelative } from '@/lib/utils';
import { ACheckbox } from '../ui';

export function useGuestCategories() {
  return useQuery(categoriesQuery);
}

/** The celebration's events in display order (for filters and per-event details). */
export function useEvents() {
  return useQuery(eventsQuery);
}

/** Events a guest in `categoryId` is invited to by category rules (no categories ticked = everyone). */
export function coveredByCategory(event: Pick<AdminEvent, 'invitedCategoryIds'>, categoryId: string | null): boolean {
  return event.invitedCategoryIds.length === 0 || (!!categoryId && event.invitedCategoryIds.includes(categoryId));
}

/** One chip per event the guest will attend: name, people coming to it, and a tick once checked in there. */
export function EventChips({ guestEvents, events }: { guestEvents: AdminGuestListItem['events']; events: AdminEvent[] | undefined }) {
  if (guestEvents.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {guestEvents.map((g) => {
        const name = events?.find((e) => e.id === g.eventId)?.name ?? 'Event';
        const people = 1 + g.companionCount;
        return (
          <span
            key={g.eventId}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-navy/[0.06] px-2 py-0.5 text-xs text-navy"
            title={`${name}: ${people} ${people === 1 ? 'person' : 'people'}${g.checkedIn ? ', checked in' : ''}`}
          >
            {name}
            <span className="tabular-nums text-muted">· {people}</span>
            {g.checkedIn && (
              <>
                <Check className="size-3 text-success" aria-hidden />
                <span className="sr-only">checked in</span>
              </>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Category name with its colour dot (the name always carries the meaning). */
export function CategoryLabel({ name, color }: { name: string | null; color?: string | null }) {
  if (!name) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {color && <span className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }} aria-hidden />}
      {name}
    </span>
  );
}

export function RsvpBadge({ response }: { response: RsvpResponse | null }) {
  if (!response) return <Badge tone="neutral" className="text-muted">No reply</Badge>;
  return <StatusBadge status={response} />;
}

export function InvitationCell({ invitation }: { invitation: AdminGuestListItem['invitation'] }) {
  if (!invitation) return <span className="text-muted">No invitation</span>;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <StatusBadge status={invitation.status} />
      <span className="whitespace-nowrap text-xs text-muted">
        {invitation.lastSentAt ? `sent ${formatRelative(invitation.lastSentAt)}` : 'Never sent'}
      </span>
    </span>
  );
}

/** Inline warning shown when the API answers EVENT_CAPACITY_REACHED or CATEGORY_CAPACITY_REACHED, with the audited override. */
export function CapacityOverride({
  message,
  checked,
  onCheckedChange,
}: {
  message: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[13px]">
      <p className="flex items-start gap-2 font-medium text-[#8a5c12]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        {message}
      </p>
      <div className="mt-2 flex items-start gap-2 pl-6">
        <ACheckbox id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
        <label htmlFor={id} className="text-charcoal">
          Override capacity (this will be recorded in the audit log)
        </label>
      </div>
    </div>
  );
}
