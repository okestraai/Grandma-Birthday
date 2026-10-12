import { createTestApp, login, resetDb, type Session, type TestContext } from './helpers';

describe('Showing and hiding the programme (e2e)', () => {
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

  it('shows the programme by default', async () => {
    const event = await ctx.prisma.event.findFirstOrThrow();
    await post(`/api/admin/events/${event.id}/programme`, { startTime: '18:00', title: 'Dinner' }).expect(201);

    expect((await admin.agent.get('/api/admin/celebration').expect(200)).body.programmeVisible).toBe(true);
    expect((await ctx.http().get('/api/site').expect(200)).body.celebration.programmeVisible).toBe(true);
    expect((await ctx.http().get('/api/programme').expect(200)).body).toHaveLength(1);
    expect((await ctx.http().get('/api/sitemap.xml').expect(200)).text).toContain('/programme</loc>');
    expect((await ctx.http().get('/api/seo').query({ path: '/programme' }).expect(200)).body.noindex).toBe(false);
  });

  it('hides the programme from the public site when switched off, and keeps it for admins', async () => {
    const event = await ctx.prisma.event.findFirstOrThrow();
    await post(`/api/admin/events/${event.id}/programme`, { startTime: '18:00', title: 'Dinner' }).expect(201);

    const res = await put('/api/admin/celebration', { programmeVisible: false }).expect(200);
    expect(res.body.programmeVisible).toBe(false);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'ADMIN_CHANGED_EVENT_SETTINGS' }, orderBy: { createdAt: 'desc' } });
    expect(audit.metadata).toEqual({ fields: ['programmeVisible'] });

    expect((await ctx.http().get('/api/programme').expect(200)).body).toEqual([]);
    expect((await ctx.http().get('/api/site').expect(200)).body.celebration.programmeVisible).toBe(false);
    const sitemap = (await ctx.http().get('/api/sitemap.xml').expect(200)).text;
    expect(sitemap).not.toContain('/programme</loc>');
    expect(sitemap).toContain('/event</loc>');
    expect((await ctx.http().get('/api/seo').query({ path: '/programme' }).expect(200)).body.noindex).toBe(true);

    // Admins still see and edit the items.
    const items = await admin.agent.get(`/api/admin/events/${event.id}/programme`).expect(200);
    expect(items.body.map((i: { title: string }) => i.title)).toEqual(['Dinner']);
    await post(`/api/admin/events/${event.id}/programme`, { startTime: '19:00', title: 'Toasts' }).expect(201);

    await put('/api/admin/celebration', { programmeVisible: true }).expect(200);
    const groups = (await ctx.http().get('/api/programme').expect(200)).body;
    expect(groups[0].items.map((i: { title: string }) => i.title)).toEqual(['Dinner', 'Toasts']);
  });

  it('lets only admins change it', async () => {
    const staff = await login(ctx, 'staff@test.local');
    await staff.agent.put('/api/admin/celebration').set('X-CSRF-Token', staff.csrf).send({ programmeVisible: false }).expect(403);
    await put('/api/admin/celebration', { programmeVisible: 'no' }).expect(400);
  });
});
