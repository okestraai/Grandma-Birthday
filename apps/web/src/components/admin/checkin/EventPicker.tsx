import type { CheckInEventCount } from '@birthday/types';
import { cn } from '@/lib/utils';

/** The event the door staff last chose, kept for this browser tab only. */
export const CHECKIN_EVENT_KEY = 'bp_checkin_event';

export function readCheckInEvent(): string | null {
  try {
    return window.sessionStorage.getItem(CHECKIN_EVENT_KEY);
  } catch {
    return null;
  }
}

export function saveCheckInEvent(eventId: string): void {
  try {
    window.sessionStorage.setItem(CHECKIN_EVENT_KEY, eventId);
  } catch {
    // Private mode or blocked storage: the choice lasts until the page reloads.
  }
}

/** Which event the door is checking guests in to. One tap each, 44px high. */
export function EventPicker({
  events,
  value,
  onChange,
}: {
  events: CheckInEventCount[];
  value: string | undefined;
  onChange: (eventId: string) => void;
}) {
  return (
    <div role="group" aria-label="Event to check in to" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1">
      {events.map((e) => {
        const active = e.eventId === value;
        return (
          <button
            key={e.eventId}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(e.eventId)}
            className={cn(
              'flex h-11 shrink-0 items-center rounded-xl border px-4 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-rich',
              active ? 'border-navy bg-navy text-white' : 'border-navy/15 bg-white text-navy hover:border-navy/30',
            )}
          >
            {e.name}
          </button>
        );
      })}
    </div>
  );
}

/** Counts for the events not being checked in to, so staff can see the whole day at a glance. */
export function OtherEvents({ events, onSelect }: { events: CheckInEventCount[]; onSelect: (eventId: string) => void }) {
  if (events.length === 0) return null;
  return (
    <section className="rounded-xl border border-navy/10 bg-white p-3" aria-labelledby="other-events">
      <h2 id="other-events" className="mb-1 text-[13px] font-semibold text-navy">
        Other events
      </h2>
      <ul className="divide-y divide-navy/[0.06]">
        {events.map((e) => (
          <li key={e.eventId}>
            <button
              type="button"
              onClick={() => onSelect(e.eventId)}
              className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[13px] hover:text-emerald"
              aria-label={`Switch to ${e.name}: ${e.checkedInPeople} of ${e.expectedPeople} people checked in`}
            >
              <span className="min-w-0 truncate text-navy">{e.name}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {e.checkedInPeople.toLocaleString()} / {e.expectedPeople.toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
