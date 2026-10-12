import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { createTestApp, login, resetDb, type Session, type TestContext } from './helpers';

const DAY = 86_400_000;
const inDays = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 3600_000).toISOString();

const eventBody = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  startsAt: inDays(30),
  endsAt: inDays(30, 3),
  venueName: `${name} venue`,
  address: '1 Test Street',
  ...over,
});

const rsvp = (email: string, extra: Record<string, unknown> = {}) => ({
  fullName: 'Guest Person',
  email,
  response: 'ATTENDING',
  companions: [] as { fullName: string }[],
  ...extra,
});

describe('Several events in one celebration (e2e)', () => {
  let ctx: TestContext;
  let admin: Session;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(ctx);
    admin = await login(ctx, 'admin@test.local');
  });
  afterAll(() => ctx.app.close());

  const put = (path: string, body: unknown) => admin.agent.put(path).set('X-CSRF-Token', admin.csrf).send(body as object);
  const post = (path: string, body: unknown) => admin.agent.post(path).set('X-CSRF-Token', admin.csrf).send(body as object);
  const createEvent = async (name: string, over: Record<string, unknown> = {}) => (await post('/api/admin/events', eventBody(name, over)).expect(201)).body;
  const firstEvent = () => ctx.prisma.event.findFirstOrThrow();

  it('keeps a single-event site working as before', async () => {
    const only = await firstEvent();
    const site = await ctx.http().get('/api/site').expect(200);
    expect(site.body.events).toHaveLength(1);
    expect(site.body.celebration.startsAt).toBe(only.startsAt.toISOString());
    expect(site.body.celebration.rsvp.open).toBe(true);

    // An RSVP without a list of events attends the only event, with all companions.
    const res = await ctx.http().post('/api/rsvp').send(rsvp('solo@example.com', { companions: [{ fullName: 'Plus One' }] })).expect(201);
    expect(res.body.events).toEqual([expect.objectContaining({ id: only.id, partySize: 2 })]);
    const pass = await ctx.http().get(`/api/invitations/${res.body.invitationToken}`).expect(200);
    expect(pass.body.events).toEqual([expect.objectContaining({ id: only.id, partySize: 2, checkedIn: false })]);

    // Check-in may leave the event out when there is only one.
    const staff = await login(ctx, 'staff@test.local');
    const verify = await staff.agent.post('/api/checkin/verify').set('X-CSRF-Token', staff.csrf).send({ value: res.body.invitationCode }).expect(200);
    expect(verify.body).toMatchObject({ status: 'VALID', event: { id: only.id } });
    await staff.agent.post('/api/checkin').set('X-CSRF-Token', staff.csrf).send({ invitationId: verify.body.guest.invitationId }).expect(201);
  });

  it('lets admins add, edit, reorder and delete events, and records each change', async () => {
    const dinner = await createEvent('Birthday Dinner', { capacity: 20, isPublic: true });
    expect(dinner).toMatchObject({ slug: 'birthday-dinner', capacity: 20, attendingPeople: 0, rsvpEnabled: true, invitedCategoryIds: [] });
    const hidden = await createEvent('Private Lunch', { isPublic: false });

    const site = await ctx.http().get('/api/site').expect(200);
    expect(site.body.events.map((e: { name: string }) => e.name)).not.toContain('Private Lunch');

    const edited = await put(`/api/admin/events/${dinner.id}`, eventBody('Birthday Dinner', { dressCode: 'Black tie', capacity: null })).expect(200);
    expect(edited.body).toMatchObject({ dressCode: 'Black tie', capacity: null });
    await put(`/api/admin/events/${dinner.id}`, eventBody('Bad', { endsAt: inDays(29) })).expect(400);

    const first = await firstEvent();
    await put('/api/admin/events/reorder', { ids: [dinner.id, first.id, hidden.id] }).expect(204);
    const list = await admin.agent.get('/api/admin/events').expect(200);
    expect(list.body.map((e: { name: string }) => e.name)[0]).toBe('Birthday Dinner');

    // An event someone replied to cannot be deleted; an untouched one can; the last one never.
    await ctx.http().post('/api/rsvp').send(rsvp('guest@example.com', { events: [{ eventId: dinner.id, companionCount: 0 }] })).expect(201);
    expect((await admin.agent.delete(`/api/admin/events/${dinner.id}`).set('X-CSRF-Token', admin.csrf).expect(409)).body.code).toBe('CONFLICT');
    await admin.agent.delete(`/api/admin/events/${hidden.id}`).set('X-CSRF-Token', admin.csrf).expect(204);

    const audit = await ctx.prisma.auditLog.findMany({ where: { action: 'ADMIN_CHANGED_EVENT' } });
    expect(audit.map((a) => (a.metadata as { op: string }).op).sort()).toEqual(['create', 'create', 'delete', 'reorder', 'update']);

    // Check-in staff cannot manage events.
    const staff = await login(ctx, 'staff@test.local');
    await staff.agent.get('/api/admin/events').expect(403);
  });

  it('offers each guest only the events their category is invited to, with an admin override', async () => {
    const family = await ctx.prisma.guestCategory.create({ data: { name: 'Family', defaultCompanions: 2 } });
    const friends = await ctx.prisma.guestCategory.create({ data: { name: 'Friends', defaultCompanions: 1 } });
    const dinner = await firstEvent();
    const brunch = await createEvent('Family Brunch', { invitedCategoryIds: [family.id] });

    const form = await ctx.http().get('/api/rsvp/form').expect(200);
    const options = Object.fromEntries(form.body.events.map((e: { name: string; invitedCategoryIds: string[] }) => [e.name, e.invitedCategoryIds]));
    expect(options['Family Brunch']).toEqual([family.id]);

    // A friend cannot pick the family brunch; leaving events out attends what they may attend.
    const refused = await ctx.http().post('/api/rsvp').send(rsvp('friend@example.com', { categoryId: friends.id, events: [{ eventId: brunch.id, companionCount: 0 }] })).expect(400);
    expect(Object.keys(refused.body.details)).toContain('events.0.eventId');
    const friend = await ctx.http().post('/api/rsvp').send(rsvp('friend@example.com', { categoryId: friends.id })).expect(201);
    expect(friend.body.events.map((e: { id: string }) => e.id)).toEqual([dinner.id]);

    // Family may choose both, with fewer companions at one of them.
    const fam = await ctx.http()
      .post('/api/rsvp')
      .send(
        rsvp('cousin@example.com', {
          categoryId: family.id,
          companions: [{ fullName: 'Ada One' }, { fullName: 'Bo Two' }],
          events: [
            { eventId: dinner.id, companionCount: 2 },
            { eventId: brunch.id, companionCount: 1 },
          ],
        }),
      )
      .expect(201);
    expect(fam.body.events.map((e: { partySize: number }) => e.partySize)).toEqual([3, 2]);
    await ctx.http().post('/api/rsvp').send(rsvp('x@example.com', { categoryId: family.id, events: [{ eventId: brunch.id, companionCount: 1 }] })).expect(400);
    await ctx.http().post('/api/rsvp').send(rsvp('y@example.com', { categoryId: family.id, events: [] })).expect(400);

    // The invite link offers exactly this guest's events; an admin can add the friend to the brunch.
    const friendGuest = await ctx.prisma.guest.findUniqueOrThrow({ where: { email: 'friend@example.com' } });
    const prefill = await ctx.http().get(`/api/rsvp/invite/${friend.body.invitationToken}`).expect(200);
    expect(prefill.body.events.map((e: { id: string }) => e.id)).toEqual([dinner.id]);
    expect(prefill.body.existing.events).toEqual([{ eventId: dinner.id, companionCount: 0 }]);
    const detail = await put(`/api/admin/guests/${friendGuest.id}`, { extraEventIds: [brunch.id] }).expect(200);
    expect(detail.body).toMatchObject({ extraEventIds: [brunch.id], invitedEventIds: [dinner.id, brunch.id] });
    const after = await ctx.http().get(`/api/rsvp/invite/${friend.body.invitationToken}`).expect(200);
    expect(after.body.events.map((e: { id: string }) => e.id)).toEqual([dinner.id, brunch.id]);
    await ctx.http()
      .post('/api/rsvp')
      .send(rsvp('ignored@example.com', { inviteToken: friend.body.invitationToken, events: [{ eventId: brunch.id, companionCount: 0 }] }))
      .expect(201);

    // The guest list filters by event and shows each guest's events.
    const list = await admin.agent.get(`/api/admin/guests?eventId=${brunch.id}`).expect(200);
    expect(list.body.items.map((g: { email: string }) => g.email).sort()).toEqual(['cousin@example.com', 'friend@example.com']);
    expect(list.body.items.find((g: { email: string }) => g.email === 'cousin@example.com').events).toHaveLength(2);
  });

  it('never lets an event go over its own capacity, even with replies arriving together', async () => {
    const dinner = await firstEvent();
    const brunch = await createEvent('Brunch', { capacity: 4 });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        ctx.http()
          .post('/api/rsvp')
          .send(rsvp(`p${i}@example.com`, { companions: [{ fullName: 'Friend Name' }], events: [{ eventId: brunch.id, companionCount: 1 }] })),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.body.code === 'EVENT_FULL')).toHaveLength(4);
    const people = await ctx.prisma.rsvpEvent.aggregate({ where: { eventId: brunch.id }, _count: { _all: true }, _sum: { companionCount: true } });
    expect(people._count._all + (people._sum.companionCount ?? 0)).toBe(4);

    // The full event is marked in the form; the other event still takes replies, alone if need be.
    const form = await ctx.http().get('/api/rsvp/form').expect(200);
    expect(form.body.events.find((e: { id: string }) => e.id === brunch.id).full).toBe(true);
    expect(form.body.availability.open).toBe(true);
    await ctx.http().post('/api/rsvp').send(rsvp('later@example.com', { events: [{ eventId: dinner.id, companionCount: 0 }] })).expect(201);
    // An admin cannot lower the capacity below the people already coming.
    await put(`/api/admin/events/${brunch.id}`, eventBody('Brunch', { capacity: 3 })).expect(400);
  });

  it('checks a guest in once per event with the same QR code', async () => {
    const dinner = await firstEvent();
    const brunch = await createEvent('Brunch', { startsAt: inDays(31), endsAt: inDays(31, 3) });
    const lunch = await createEvent('Lunch');
    const res = await ctx.http()
      .post('/api/rsvp')
      .send(rsvp('door@example.com', { companions: [{ fullName: 'Plus One' }], events: [{ eventId: dinner.id, companionCount: 1 }, { eventId: brunch.id, companionCount: 0 }] }))
      .expect(201);
    const qr = `https://site.example/invitation/${res.body.invitationToken}`;
    const staff = await login(ctx, 'staff@test.local');
    const send = (path: string, body: object) => staff.agent.post(path).set('X-CSRF-Token', staff.csrf).send(body);

    // With several events, the event must be named.
    await send('/api/checkin/verify', { value: qr }).expect(400);

    const atDinner = await send('/api/checkin/verify', { value: qr, eventId: dinner.id }).expect(200);
    expect(atDinner.body).toMatchObject({ status: 'VALID', event: { id: dinner.id }, guest: { partySize: 2 } });
    expect(atDinner.body.guest.events.map((e: { id: string }) => e.id)).toEqual([dinner.id, brunch.id]);
    const { invitationId } = atDinner.body.guest;
    const attempts = await Promise.all(Array.from({ length: 4 }, () => send('/api/checkin', { invitationId, eventId: dinner.id })));
    expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
    expect(attempts.filter((r) => r.body.code === 'ALREADY_CHECKED_IN')).toHaveLength(3);

    // The same QR works at the brunch, for the party coming to it.
    const atBrunch = await send('/api/checkin/verify', { value: qr, eventId: brunch.id }).expect(200);
    expect(atBrunch.body).toMatchObject({ status: 'VALID', guest: { partySize: 1 } });
    await send('/api/checkin', { invitationId, eventId: brunch.id, partySize: 2 }).expect(400);
    const record = await send('/api/checkin', { invitationId, eventId: brunch.id }).expect(201);
    expect(record.body).toMatchObject({ eventId: brunch.id, eventName: 'Brunch', partySize: 1 });
    expect((await send('/api/checkin/verify', { value: qr, eventId: brunch.id })).body.status).toBe('ALREADY_CHECKED_IN');

    // Not chosen for lunch: refused at that door.
    expect((await send('/api/checkin/verify', { value: qr, eventId: lunch.id })).body.status).toBe('NOT_FOR_THIS_EVENT');
    await send('/api/checkin', { invitationId, eventId: lunch.id }).expect(409);

    // Counts and the lookup are per event.
    const overview = await staff.agent.get(`/api/checkin/recent?eventId=${brunch.id}`).expect(200);
    expect(overview.body).toMatchObject({ eventId: brunch.id, checkedInGuests: 1, checkedInPeople: 1, expectedPeople: 1 });
    // In time order: lunch (30 days away), brunch (31), the first event (60).
    expect(overview.body.events.map((e: { name: string }) => e.name)).toEqual(['Lunch', 'Brunch', dinner.name]);
    const search = await staff.agent.get(`/api/checkin/search?q=${res.body.invitationCode}&eventId=${lunch.id}`).expect(200);
    expect(search.body[0]).toMatchObject({ forThisEvent: false, checkedIn: false, partySize: 0 });

    // Reversing frees only that event.
    const dinnerCheckIn = await ctx.prisma.checkIn.findFirstOrThrow({ where: { eventId: dinner.id } });
    await post(`/api/admin/checkins/${dinnerCheckIn.id}/reverse`, { reason: 'Wrong guest' }).expect(200);
    await send('/api/checkin', { invitationId, eventId: dinner.id }).expect(201);
    await send('/api/checkin', { invitationId, eventId: brunch.id }).expect(409);

    const pass = await ctx.http().get(`/api/invitations/${res.body.invitationToken}`).expect(200);
    expect(pass.body.events.map((e: { checkedIn: boolean }) => e.checkedIn)).toEqual([true, true]);
    const dashboard = await admin.agent.get('/api/admin/dashboard').expect(200);
    expect(dashboard.body.events.find((e: { eventId: string }) => e.eventId === brunch.id)).toMatchObject({ attendingGuests: 1, checkedInPeople: 1 });
    expect(dashboard.body).toMatchObject({ checkedInGuests: 1, checkedInPeople: 2 });
  });

  it('records a whole-celebration reply against every event the guest may attend, within each event capacity', async () => {
    const family = await ctx.prisma.guestCategory.create({ data: { name: 'Family', defaultCompanions: 2 } });
    const friends = await ctx.prisma.guestCategory.create({ data: { name: 'Friends', defaultCompanions: 1 } });
    const dinner = await firstEvent();
    const brunch = await createEvent('Family Brunch', { invitedCategoryIds: [family.id], capacity: 2 });
    await createEvent('Church Service', { rsvpEnabled: false });
    await put('/api/admin/celebration', { rsvpScope: 'WHOLE_CELEBRATION' }).expect(200);
    expect((await ctx.http().get('/api/rsvp/form').expect(200)).body.rsvpScope).toBe('WHOLE_CELEBRATION');

    // Events sent by the guest are ignored: a yes covers dinner and brunch, not the information-only service.
    const cousin = await ctx.http()
      .post('/api/rsvp')
      .send(rsvp('cousin@example.com', { categoryId: family.id, companions: [{ fullName: 'Ada One' }], events: [{ eventId: dinner.id, companionCount: 0 }] }))
      .expect(201);
    expect(cousin.body.events.map((e: { id: string; partySize: number }) => [e.id, e.partySize])).toEqual([
      [dinner.id, 2],
      [brunch.id, 2],
    ]);
    const friend = await ctx.http().post('/api/rsvp').send(rsvp('friend@example.com', { categoryId: friends.id })).expect(201);
    expect(friend.body.events.map((e: { id: string }) => e.id)).toEqual([dinner.id]);

    // The brunch is now full, so another family reply is refused rather than half-recorded.
    const full = await ctx.http().post('/api/rsvp').send(rsvp('aunt@example.com', { categoryId: family.id })).expect(409);
    expect(full.body.code).toBe('EVENT_FULL');
    expect(await ctx.prisma.guest.count({ where: { email: 'aunt@example.com' } })).toBe(0);

    // Switching back leaves existing replies as they are; new replies choose events again.
    await put('/api/admin/celebration', { rsvpScope: 'PER_EVENT' }).expect(200);
    expect(await ctx.prisma.rsvpEvent.count()).toBe(3);
    const picked = await ctx.http().post('/api/rsvp').send(rsvp('later@example.com', { categoryId: family.id, events: [{ eventId: dinner.id, companionCount: 0 }] })).expect(201);
    expect(picked.body.events.map((e: { id: string }) => e.id)).toEqual([dinner.id]);
  });

  it('checks a guest in once for the whole celebration when the admin chooses so', async () => {
    const dinner = await firstEvent();
    const brunch = await createEvent('Brunch', { startsAt: inDays(31), endsAt: inDays(31, 3) });
    const res = await ctx.http().post('/api/rsvp').send(rsvp('once@example.com', { companions: [{ fullName: 'Plus One' }] })).expect(201);
    await put('/api/admin/celebration', { checkInScope: 'ONCE' }).expect(200);
    const staff = await login(ctx, 'staff@test.local');
    const send = (path: string, body: object) => staff.agent.post(path).set('X-CSRF-Token', staff.csrf).send(body);

    // No event needs naming; the check-in goes against the next event to start (the brunch).
    const verify = await send('/api/checkin/verify', { value: res.body.invitationCode }).expect(200);
    expect(verify.body).toMatchObject({ status: 'VALID', event: { id: brunch.id }, guest: { partySize: 2 } });
    const { invitationId } = verify.body.guest;
    const attempts = await Promise.all(Array.from({ length: 3 }, () => send('/api/checkin', { invitationId })));
    expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
    expect(attempts.filter((r) => r.body.code === 'ALREADY_CHECKED_IN')).toHaveLength(2);

    // Asking for the other event changes nothing: one check-in covers the celebration.
    await send('/api/checkin', { invitationId, eventId: dinner.id }).expect(409);
    expect((await send('/api/checkin/verify', { value: res.body.invitationCode, eventId: dinner.id })).body.status).toBe('ALREADY_CHECKED_IN');
    const overview = await staff.agent.get('/api/checkin/recent').expect(200);
    expect(overview.body).toMatchObject({ checkInScope: 'ONCE', checkedInGuests: 1, checkedInPeople: 2, expectedPeople: 2 });

    // Reversing frees the guest again, as before.
    const record = await ctx.prisma.checkIn.findFirstOrThrow();
    await post(`/api/admin/checkins/${record.id}/reverse`, { reason: 'Wrong guest' }).expect(200);
    await send('/api/checkin', { invitationId }).expect(201);
  });

  it('describes every public event for search engines, with the date range', async () => {
    const first = await firstEvent();
    await createEvent('Family Brunch', { startsAt: new Date(first.startsAt.getTime() + DAY).toISOString(), endsAt: new Date(first.startsAt.getTime() + DAY + 3600_000).toISOString() });
    await createEvent('Private', { isPublic: false });
    const seo = await ctx.http().get('/api/seo?path=/').expect(200);
    const events = seo.body.jsonLd.filter((x: { '@type': string }) => x['@type'] === 'Event');
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ name: expect.stringContaining('Family Brunch'), url: expect.stringContaining('/event#family-brunch') });
    expect(seo.body.description).toMatch(/ to .*: 2 events/);
  });

  it('keeps a programme per event and shows only public events with items', async () => {
    const dinner = await firstEvent();
    const brunch = await createEvent('Brunch');
    const hidden = await createEvent('Hidden', { isPublic: false });
    await post(`/api/admin/events/${dinner.id}/programme`, { startTime: '18:00', title: 'Dinner' }).expect(201);
    const late = await post(`/api/admin/events/${dinner.id}/programme`, { startTime: '00:30', title: 'Carriages', date: '2030-01-02' }).expect(201);
    expect(late.body).toMatchObject({ eventId: dinner.id, date: '2030-01-02' });
    await post(`/api/admin/events/${hidden.id}/programme`, { startTime: '12:00', title: 'Secret' }).expect(201);
    await post(`/api/admin/events/${brunch.id}/programme`, { startTime: '25:00', title: 'Bad' }).expect(400);

    const groups = await ctx.http().get('/api/programme').expect(200);
    expect(groups.body.map((g: { event: { id: string } }) => g.event.id)).toEqual([dinner.id]);
    expect(groups.body[0].items.map((i: { title: string }) => i.title)).toEqual(['Dinner', 'Carriages']);

    // Items belong to their event: they cannot be edited through another.
    await put(`/api/admin/events/${brunch.id}/programme/${late.body.id}`, { startTime: '01:00', title: 'Moved' }).expect(404);
    await put(`/api/admin/events/${dinner.id}/programme/reorder`, { ids: [late.body.id] }).expect(204);
    const items = await admin.agent.get(`/api/admin/events/${dinner.id}/programme`).expect(200);
    expect(items.body[0].title).toBe('Carriages');
  });
});

/**
 * Runs the migrations in a scratch schema: the three before multiple events, some data in the
 * old shape, then the multiple-events migration, and checks that nothing was lost.
 */
describe('Multiple events migration (e2e)', () => {
  const dir = join(__dirname, '..', 'prisma', 'migrations');
  const migrations = readdirSync(dir).filter((name) => /^\d+_/.test(name)).sort();
  const target = migrations.findIndex((name) => name.endsWith('_multiple_events'));
  const schema = `migration_check_${Date.now()}`;
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}";`);
  });
  afterAll(async () => {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  it('turns the single event into the first event and attaches programme, replies and check-ins to it', async () => {
    expect(target).toBeGreaterThan(0);
    for (const name of migrations.slice(0, target)) await client.query(readFileSync(join(dir, name, 'migration.sql'), 'utf8'));

    await client.query(`
      INSERT INTO "event" ("id", "name", "starts_at", "ends_at", "venue_name", "address", "dress_code", "updated_at")
        VALUES (1, 'Margaret at Seventy', '2026-11-21T16:00:00Z', '2026-11-21T22:00:00Z', 'The Emerald Ballroom', '12 Palm Grove Avenue', 'Black tie', now());
      INSERT INTO "programme_items" ("id", "start_time", "title", "sort_order", "updated_at")
        VALUES (gen_random_uuid(), '17:00', 'Arrival', 0, now()), (gen_random_uuid(), '18:00', 'Dinner', 1, now());
      INSERT INTO "guests" ("id", "full_name", "email", "source", "updated_at") VALUES
        ('00000000-0000-4000-8000-000000000001', 'Ada', 'ada@example.com', 'SELF_REGISTERED', now()),
        ('00000000-0000-4000-8000-000000000002', 'Bo', 'bo@example.com', 'SELF_REGISTERED', now());
      INSERT INTO "rsvps" ("id", "guest_id", "response", "companion_count", "updated_at") VALUES
        ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'ATTENDING', 2, now()),
        ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000002', 'DECLINED', 0, now());
      INSERT INTO "invitations" ("id", "guest_id", "code", "token", "updated_at")
        VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'BP70-AAAAAA', 'token-aaaaaaaaaaaaaaaaaaaaaaaa', now());
      INSERT INTO "check_ins" ("id", "invitation_id", "guest_id", "party_size")
        VALUES (gen_random_uuid(), '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 3);
    `);

    await client.query(readFileSync(join(dir, migrations[target], 'migration.sql'), 'utf8'));

    const events = (await client.query('SELECT "id", "slug", "name", "venue_name", "dress_code", "starts_at" FROM "events"')).rows;
    expect(events).toEqual([expect.objectContaining({ slug: 'main', name: 'Margaret at Seventy', venue_name: 'The Emerald Ballroom', dress_code: 'Black tie' })]);
    expect(new Date(events[0].starts_at).toISOString()).toBe('2026-11-21T16:00:00.000Z');
    const eventId = events[0].id;
    expect((await client.query('SELECT DISTINCT "event_id" FROM "programme_items"')).rows).toEqual([{ event_id: eventId }]);
    expect((await client.query('SELECT "rsvp_id", "event_id", "companion_count" FROM "rsvp_events"')).rows).toEqual([
      { rsvp_id: '00000000-0000-4000-8000-0000000000a1', event_id: eventId, companion_count: 2 },
    ]);
    expect((await client.query('SELECT "event_id" FROM "check_ins"')).rows).toEqual([{ event_id: eventId }]);
    const columns = (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'event'`, [schema])).rows.map((r) => r.column_name);
    expect(columns).not.toContain('venue_name');

    // One active check-in per guest per event.
    await expect(
      client.query(`INSERT INTO "check_ins" ("id", "invitation_id", "guest_id", "event_id", "party_size")
        VALUES (gen_random_uuid(), '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', '${eventId}', 1)`),
    ).rejects.toThrow(/check_ins_one_active_per_guest_event/);
  });
});
