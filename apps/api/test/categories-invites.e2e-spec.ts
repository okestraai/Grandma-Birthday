import { createTestApp, login, pngBuffer, resetDb, type Session, type TestContext } from './helpers';

const rsvp = (email: string, categoryId: string, companions: string[] = []) => ({
  fullName: 'Guest Person',
  email,
  categoryId,
  response: 'ATTENDING',
  companions: companions.map((fullName) => ({ fullName })),
});

describe('Capacity per guest category, bulk invitations, private albums (e2e)', () => {
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

  const category = (name: string, capacity: number | null) =>
    ctx.prisma.guestCategory.create({ data: { name, defaultCompanions: 2, capacity } });

  it('refuses RSVPs once a category has used its places, while other categories still work', async () => {
    const family = await category('Family', 3);
    const friends = await category('Friends', null);
    await ctx.http().post('/api/rsvp').send(rsvp('a@example.com', family.id, ['One Plus'])).expect(201);
    const full = await ctx.http().post('/api/rsvp').send(rsvp('b@example.com', family.id, ['Two Plus'])).expect(409);
    expect(full.body.code).toBe('CATEGORY_CAPACITY_REACHED');
    expect(full.body.message).toMatch(/only 1 place remains for Family/);
    expect(await ctx.prisma.guest.count()).toBe(1);
    await ctx.http().post('/api/rsvp').send(rsvp('c@example.com', family.id)).expect(201);
    await ctx.http().post('/api/rsvp').send(rsvp('d@example.com', friends.id, ['X Y'])).expect(201);

    const form = await ctx.http().get('/api/rsvp/form').expect(200);
    const byName = Object.fromEntries(form.body.categories.map((c: { name: string; full: boolean }) => [c.name, c.full]));
    expect(byName).toEqual({ Family: true, Friends: false });
  });

  it('splits the event capacity across categories with server-side checks', async () => {
    const family = await category('Family', null);
    const friends = await category('Friends', null);
    await ctx.http().post('/api/rsvp').send(rsvp('a@example.com', family.id, ['One Plus'])).expect(201);
    const put = (allocations: object[]) =>
      admin.agent.put('/api/admin/celebration/allocations').set('X-CSRF-Token', admin.csrf).send({ allocations });

    const tooMany = await put([{ categoryId: family.id, capacity: 60 }, { categoryId: friends.id, capacity: 50 }]).expect(400);
    expect(tooMany.body.message).toMatch(/110 places.*capacity is 100/);
    const belowConfirmed = await put([{ categoryId: family.id, capacity: 1 }]).expect(400);
    expect(Object.keys(belowConfirmed.body.details)).toEqual(['allocations.0.capacity']);

    const ok = (await put([{ categoryId: family.id, capacity: 60 }, { categoryId: friends.id, capacity: null }]).expect(200)).body;
    expect(ok).toMatchObject({ capacity: 100, allocated: 60, unallocated: 40, confirmedPeople: 2 });
    expect(ok.categories.find((c: { name: string }) => c.name === 'Family')).toMatchObject({ capacity: 60, confirmedPeople: 2, remaining: 58 });

    // Event capacity cannot drop below what is set aside.
    const lower = await admin.agent.put('/api/admin/celebration').set('X-CSRF-Token', admin.csrf).send({ capacity: 50 }).expect(400);
    expect(lower.body.details.capacity[0]).toMatch(/60 places are set aside/);
  });

  it('sends invitations in bulk, skipping declined and revoked guests', async () => {
    const make = async (email: string, extra: object = {}) =>
      (await admin.agent.post('/api/admin/guests').set('X-CSRF-Token', admin.csrf).send({ fullName: 'Invited Guest', email, allowedCompanions: 1, ...extra }).expect(201)).body;
    const a = await make('a@example.com');
    await make('b@example.com', { rsvp: { response: 'DECLINED', companions: [] } });
    const c = await make('c@example.com');
    await admin.agent.post(`/api/admin/guests/${c.id}/invitation/revoke`).set('X-CSRF-Token', admin.csrf).send({}).expect(200);

    const res = await admin.agent.post('/api/admin/invitations/send').set('X-CSRF-Token', admin.csrf).send({ onlyUnsent: true }).expect(200);
    expect(res.body).toMatchObject({ sent: 1, skipped: 2, failed: 0 });
    const sent = await ctx.prisma.invitation.findFirstOrThrow({ where: { guestId: a.id } });
    expect(sent.sendCount).toBe(1);
    // Already sent → nothing left to send.
    expect((await admin.agent.post('/api/admin/invitations/send').set('X-CSRF-Token', admin.csrf).send({ onlyUnsent: true }).expect(200)).body.sent).toBe(0);
    await admin.agent.post('/api/admin/invitations/send').set('X-CSRF-Token', admin.csrf).send({}).expect(400);
    const staff = await login(ctx, 'staff@test.local');
    await staff.agent.post('/api/admin/invitations/send').set('X-CSRF-Token', staff.csrf).send({ onlyUnsent: true }).expect(403);
  });

  it('hides the photos of a private album from the public', async () => {
    const album = await ctx.prisma.album.create({ data: { slug: 'secret', title: 'Secret', isPublished: false } });
    const upload = await admin.agent
      .post('/api/admin/media')
      .set('X-CSRF-Token', admin.csrf)
      .field('albumId', album.id)
      .attach('files', await pngBuffer(), 'private.png')
      .expect(201);
    const id = upload.body.media[0].id;
    await ctx.http().get(`/api/media/${id}/thumb`).expect(404);
    await admin.agent.get(`/api/media/${id}/thumb`).expect(200);
    expect((await ctx.http().get('/api/albums').expect(200)).body).toEqual([]);
    await ctx.http().get('/api/albums/secret').expect(404);
    expect((await ctx.http().get('/api/media?album=secret').expect(200)).body.total).toBe(0);

    await ctx.prisma.album.update({ where: { id: album.id }, data: { isPublished: true } });
    await ctx.http().get(`/api/media/${id}/thumb`).expect(200);
    await ctx.prisma.media.deleteMany();
  });

  it('tells guests the real limits when an upload is refused', async () => {
    const token = (await ctx.prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).uploadToken;
    await ctx.prisma.settings.update({ where: { id: 1 }, data: { maxPhotoBytes: 1024, maxFilesPerUpload: 1, videoUploadsEnabled: false } });
    const big = await ctx.http().post(`/api/uploads/${token}`).attach('files', await pngBuffer(300, 300), 'big.png');
    const reason = big.status === 413 ? big.body.message : big.body.rejected[0].reason;
    expect(reason).toMatch(/1 KB/);
    const many = await ctx.http().post(`/api/uploads/${token}`).attach('files', Buffer.from('x'), 'a.jpg').attach('files', Buffer.from('y'), 'b.jpg').expect(400);
    expect(many.body.message).toMatch(/(up to|at most) 1 file at a time/);
  });
});
