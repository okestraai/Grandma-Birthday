import type { Celebration } from '../generated/prisma/client';
import { AppException } from '../common/errors';
import { chooseEvents } from '../rsvp/rsvp.service';
import { SettingsService } from '../settings/settings.service';
import { defaultEvent, eventsForGuest, isInvited, spanOf, type EventRow } from './events.service';

const at = (iso: string) => new Date(iso);

function event(id: string, over: Partial<EventRow> = {}, categoryIds: string[] = []): EventRow {
  return {
    id,
    slug: id,
    name: `Event ${id}`,
    description: null,
    startsAt: at('2026-11-21T09:00:00Z'),
    endsAt: at('2026-11-21T11:00:00Z'),
    venueName: 'Venue',
    address: 'Address',
    city: null,
    mapUrl: null,
    latitude: null,
    longitude: null,
    dressCode: null,
    theme: null,
    parkingInfo: null,
    capacity: null,
    rsvpEnabled: true,
    isPublic: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    invitedCategories: categoryIds.map((categoryId) => ({ eventId: id, categoryId, category: { name: categoryId, sortOrder: 0 } })),
    ...over,
  };
}

describe('who is invited to an event', () => {
  const everyone = event('dinner');
  const family = event('brunch', {}, ['family']);

  it('invites everyone when no category is set, otherwise only those categories', () => {
    expect(isInvited(everyone, null)).toBe(true);
    expect(isInvited(family, 'family')).toBe(true);
    expect(isInvited(family, 'friends')).toBe(false);
    expect(isInvited(family, null)).toBe(false);
  });

  it('adds events an admin chose and events the guest already replied to', () => {
    expect(isInvited(family, 'friends', ['brunch'])).toBe(true);
    const friend = { categoryId: 'friends', extraEventIds: [], chosenEventIds: [] };
    expect(eventsForGuest(friend, [everyone, family]).map((e) => e.id)).toEqual(['dinner']);
    expect(eventsForGuest({ ...friend, chosenEventIds: ['brunch'] }, [everyone, family]).map((e) => e.id)).toEqual(['dinner', 'brunch']);
  });
});

describe('chooseEvents', () => {
  const service = event('service');
  const dinner = event('dinner');

  it('defaults to every allowed event with all companions', () => {
    expect(chooseEvents([service, dinner], undefined, 2).map((c) => [c.event.id, c.companionCount])).toEqual([
      ['service', 2],
      ['dinner', 2],
    ]);
  });

  it('keeps current choices when given (admin edits), capped at the companions named', () => {
    const kept = chooseEvents([service, dinner], undefined, 1, [{ eventId: 'dinner', companionCount: 3 }]);
    expect(kept.map((c) => [c.event.id, c.companionCount])).toEqual([['dinner', 1]]);
  });

  it('accepts allowed events once each, and refuses others, too many companions and an empty list', () => {
    const chosen = chooseEvents([service, dinner], [{ eventId: 'dinner', companionCount: 1 }, { eventId: 'dinner', companionCount: 1 }], 1);
    expect(chosen).toHaveLength(1);
    expect(() => chooseEvents([service], [{ eventId: 'dinner', companionCount: 0 }], 0)).toThrow(AppException);
    expect(() => chooseEvents([service], [{ eventId: 'service', companionCount: 2 }], 1)).toThrow(AppException);
    expect(() => chooseEvents([service], [], 0)).toThrow(AppException);
    expect(() => chooseEvents([], undefined, 0)).toThrow(AppException);
  });
});

describe('defaultEvent (the event pre-selected at the door)', () => {
  const service = event('service', { startsAt: at('2026-11-21T09:00:00Z'), endsAt: at('2026-11-21T11:00:00Z') });
  const dinner = event('dinner', { startsAt: at('2026-11-21T16:00:00Z'), endsAt: at('2026-11-21T22:00:00Z') });
  const brunch = event('brunch', { startsAt: at('2026-11-22T11:00:00Z'), endsAt: at('2026-11-22T14:00:00Z') });
  const all = [brunch, dinner, service];

  it('picks the event in progress, else the next one, else the last one', () => {
    expect(defaultEvent(all, at('2026-11-21T10:00:00Z'))?.id).toBe('service');
    expect(defaultEvent(all, at('2026-11-21T12:00:00Z'))?.id).toBe('dinner');
    expect(defaultEvent(all, at('2026-11-01T12:00:00Z'))?.id).toBe('service');
    expect(defaultEvent(all, at('2026-12-01T12:00:00Z'))?.id).toBe('brunch');
    expect(defaultEvent([], new Date())).toBeNull();
  });

  it('spans the events from the first start to the last end', () => {
    expect(spanOf(all)).toEqual({ startsAt: service.startsAt, endsAt: brunch.endsAt });
  });
});

describe('RSVP availability across events', () => {
  const settings = new SettingsService(null as never, null as never);
  const celebration = { rsvpOpen: true, rsvpDeadline: null, capacity: 100, rsvpMode: 'OPEN' } as Celebration;
  const now = at('2026-11-21T12:00:00Z');
  const past = { endsAt: at('2026-11-21T11:00:00Z'), rsvpEnabled: true, full: false };
  const open = { endsAt: at('2026-11-21T22:00:00Z'), rsvpEnabled: true, full: false };

  it('stays open while one event still takes replies', () => {
    expect(settings.availability(celebration, 10, [past, open], now).closedReason).toBeNull();
  });
  it('is ended after the last event, full when every open event is full, closed when none takes replies', () => {
    expect(settings.availability(celebration, 10, [past], now).closedReason).toBe('EVENT_ENDED');
    expect(settings.availability(celebration, 10, [past, { ...open, full: true }], now).closedReason).toBe('CAPACITY_REACHED');
    expect(settings.availability(celebration, 100, [open], now).closedReason).toBe('CAPACITY_REACHED');
    expect(settings.availability(celebration, 10, [{ ...open, rsvpEnabled: false }], now).closedReason).toBe('CLOSED_BY_ADMIN');
  });
});
