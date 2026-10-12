import { createTestApp, login, resetDb, type TestContext } from './helpers';

const rsvp = (email: string, companions: string[] = [], extra: Record<string, unknown> = {}) => ({
  fullName: 'Guest Person',
  email,
  response: 'ATTENDING',
  companions: companions.map((fullName) => ({ fullName })),
  ...extra,
});

describe('RSVP, invitations and check-in (e2e)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  it('creates a guest, an invitation and a pass without exposing private data', async () => {
    const res = await ctx.http().post('/api/rsvp').send(rsvp('ada@example.com', ['Plus One'])).expect(201);
    expect(res.body).toMatchObject({ response: 'ATTENDING', companionCount: 1 });
    const pass = await ctx.http().get(`/api/invitations/${res.body.invitationToken}`).expect(200);
    expect(pass.body).toMatchObject({ partySize: 2, companions: ['Plus One'], status: 'ACTIVE' });
    expect(JSON.stringify(pass.body)).not.toContain('ada@example.com');
    await ctx.http().get(`/api/invitations/${res.body.invitationToken}/pass.pdf`).expect(200).expect('Content-Type', /pdf/);
    await ctx.http().get('/api/invitations/not-a-real-token-at-all-000000').expect(404);
  });

  it('enforces the companion limit on the server', async () => {
    await ctx.prisma.celebration.update({ where: { id: 1 }, data: { defaultCompanions: 1 } });
    const res = await ctx.http().post('/api/rsvp').send(rsvp('big@example.com', ['A One', 'B Two'])).expect(422);
    expect(res.body.code).toBe('COMPANION_LIMIT_EXCEEDED');
    await ctx.prisma.celebration.update({ where: { id: 1 }, data: { allowCompanions: false } });
    await ctx.http().post('/api/rsvp').send(rsvp('solo@example.com', ['A One'])).expect(422);
  });

  it('never lets concurrent RSVPs exceed capacity', async () => {
    await ctx.prisma.celebration.update({ where: { id: 1 }, data: { capacity: 5 } });
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => ctx.http().post('/api/rsvp').send(rsvp(`p${i}@example.com`, ['Friend Name']))),
    );
    const ok = results.filter((r) => r.status === 201).length;
    const full = results.filter((r) => r.body.code === 'EVENT_CAPACITY_REACHED').length;
    expect(ok).toBe(2); // 2 parties × 2 people = 4; a third would make 6 > 5
    expect(ok + full).toBe(8);
    const people = await ctx.prisma.rsvp.aggregate({ where: { response: 'ATTENDING' }, _count: { _all: true }, _sum: { companionCount: true } });
    expect(people._count._all + (people._sum.companionCount ?? 0)).toBeLessThanOrEqual(5);
    // A decline still goes through when the event is full.
    await ctx.http().post('/api/rsvp').send(rsvp('late@example.com', [], { response: 'DECLINED' })).expect(201);
  });

  it('respects closed RSVPs, invite-only mode and duplicate emails', async () => {
    await ctx.http().post('/api/rsvp').send(rsvp('twice@example.com')).expect(201);
    expect((await ctx.http().post('/api/rsvp').send(rsvp('TWICE@example.com'))).body.code).toBe('RSVP_ALREADY_EXISTS');
    await ctx.prisma.celebration.update({ where: { id: 1 }, data: { rsvpMode: 'INVITE_ONLY' } });
    expect((await ctx.http().post('/api/rsvp').send(rsvp('new@example.com'))).body.code).toBe('RSVP_INVITE_REQUIRED');
    await ctx.prisma.celebration.update({ where: { id: 1 }, data: { rsvpOpen: false } });
    expect((await ctx.http().post('/api/rsvp').send(rsvp('new@example.com'))).body.code).toBe('RSVP_CLOSED');
  });

  it('lets an invited guest reply through their link within their allowance', async () => {
    const { agent, csrf } = await login(ctx, 'admin@test.local');
    const guest = await agent
      .post('/api/admin/guests')
      .set('X-CSRF-Token', csrf)
      .send({ fullName: 'Invited Guest', email: 'invited@example.com', allowedCompanions: 2 })
      .expect(201);
    const token = guest.body.invitationDetail.token;
    const prefill = await ctx.http().get(`/api/rsvp/invite/${token}`).expect(200);
    expect(prefill.body.allowedCompanions).toBe(2);
    await ctx.http().post('/api/rsvp').send(rsvp('ignored@example.com', ['A One', 'B Two', 'C Three'], { inviteToken: token })).expect(422);
    await ctx.http().post('/api/rsvp').send(rsvp('ignored@example.com', ['A One', 'B Two'], { inviteToken: token })).expect(201);
    expect(await ctx.prisma.guest.count()).toBe(1);
  });

  it('saves an optional birthday message from the RSVP into testimonials, once per guest', async () => {
    const tribute = { message: 'Happy seventieth, Aunty! Thank you for everything.', relationship: 'Niece' };
    const first = await ctx.http().post('/api/rsvp').send(rsvp('tribute@example.com', [], { tribute })).expect(201);
    expect(first.body.tributeStatus).toBe('PENDING');
    const saved = await ctx.prisma.testimonial.findFirstOrThrow();
    expect(saved).toMatchObject({ authorName: 'Guest Person', relationship: 'Niece', status: 'PENDING', isPublic: false, email: 'tribute@example.com' });
    expect(saved.guestId).not.toBeNull();

    // Updating the RSVP through the invitation link edits the same message, and approval is reset.
    await ctx.prisma.testimonial.update({ where: { id: saved.id }, data: { status: 'APPROVED', isPublic: true } });
    const token = first.body.invitationToken;
    await ctx.http().post('/api/rsvp').send(rsvp('x@example.com', [], { inviteToken: token, tribute })).expect(201);
    expect(await ctx.prisma.testimonial.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ status: 'APPROVED', isPublic: true });
    await ctx.http().post('/api/rsvp').send(rsvp('x@example.com', [], { inviteToken: token, tribute: { message: 'A changed birthday message, with love.' } })).expect(201);
    expect(await ctx.prisma.testimonial.count()).toBe(1);
    expect(await ctx.prisma.testimonial.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ status: 'PENDING', isPublic: false, relationship: null });

    const prefill = await ctx.http().get(`/api/rsvp/invite/${token}`).expect(200);
    expect(prefill.body.existing.tribute).toMatchObject({ message: 'A changed birthday message, with love.', status: 'PENDING' });

    // The message is optional, validated, and skipped when messages are closed.
    await ctx.http().post('/api/rsvp').send(rsvp('short@example.com', [], { tribute: { message: 'hi' } })).expect(400);
    await ctx.prisma.settings.update({ where: { id: 1 }, data: { testimonialsOpen: false } });
    const closed = await ctx.http().post('/api/rsvp').send(rsvp('closed@example.com', [], { tribute })).expect(201);
    expect(closed.body.tributeStatus).toBeNull();
    expect(await ctx.prisma.testimonial.count()).toBe(1);

    const admin = await login(ctx, 'admin@test.local');
    const list = await admin.agent.get('/api/admin/testimonials').expect(200);
    expect(list.body.items[0].fromRsvp).toBe(true);
  });

  it('checks a guest in exactly once, even when scanned on two phones at once', async () => {
    const created = await ctx.http().post('/api/rsvp').send(rsvp('door@example.com', ['Plus One'])).expect(201);
    const staff = await login(ctx, 'staff@test.local');
    const verify = await staff.agent
      .post('/api/checkin/verify')
      .set('X-CSRF-Token', staff.csrf)
      .send({ value: `https://site.example/invitation/${created.body.invitationToken}` })
      .expect(200);
    expect(verify.body.status).toBe('VALID');
    const { invitationId } = verify.body.guest;

    const attempts = await Promise.all(
      Array.from({ length: 6 }, () => staff.agent.post('/api/checkin').set('X-CSRF-Token', staff.csrf).send({ invitationId })),
    );
    expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
    expect(attempts.filter((r) => r.body.code === 'ALREADY_CHECKED_IN')).toHaveLength(5);

    const again = await staff.agent.post('/api/checkin/verify').set('X-CSRF-Token', staff.csrf).send({ value: created.body.invitationCode }).expect(200);
    expect(again.body.status).toBe('ALREADY_CHECKED_IN');
    expect(again.body.checkIn.checkedInByName).toBe('Staff');

    // Staff cannot reverse; an admin can, after which the guest can be checked in again.
    const record = await ctx.prisma.checkIn.findFirstOrThrow();
    await staff.agent.post(`/api/admin/checkins/${record.id}/reverse`).set('X-CSRF-Token', staff.csrf).send({ reason: 'Wrong guest' }).expect(403);
    const admin = await login(ctx, 'admin@test.local');
    await admin.agent.post(`/api/admin/checkins/${record.id}/reverse`).set('X-CSRF-Token', admin.csrf).send({ reason: 'Wrong guest' }).expect(200);
    await staff.agent.post('/api/checkin').set('X-CSRF-Token', staff.csrf).send({ invitationId, partySize: 1 }).expect(201);
    await staff.agent.post('/api/checkin').set('X-CSRF-Token', staff.csrf).send({ invitationId }).expect(409);
  });

  it('refuses revoked, unknown and over-sized check-ins', async () => {
    const created = await ctx.http().post('/api/rsvp').send(rsvp('rev@example.com')).expect(201);
    const staff = await login(ctx, 'staff@test.local');
    const verify = async (value: string) =>
      (await staff.agent.post('/api/checkin/verify').set('X-CSRF-Token', staff.csrf).send({ value }).expect(200)).body;
    const { guest } = await verify(created.body.invitationToken);
    await staff.agent.post('/api/checkin').set('X-CSRF-Token', staff.csrf).send({ invitationId: guest.invitationId, partySize: 3 }).expect(400);

    await ctx.prisma.invitation.updateMany({ data: { status: 'REVOKED' } });
    expect((await verify(created.body.invitationToken)).status).toBe('REVOKED');
    await staff.agent.post('/api/checkin').set('X-CSRF-Token', staff.csrf).send({ invitationId: guest.invitationId }).expect(409);
    expect((await verify('not a code')).status).toBe('INVALID');
    expect((await verify('BP70-ZZZZZZ')).status).toBe('INVALID');
  });
});
