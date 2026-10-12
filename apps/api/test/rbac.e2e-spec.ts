import { createTestApp, login, resetDb, type TestContext } from './helpers';

describe('Authorization (e2e)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  const adminRoutes = [
    '/api/admin/dashboard',
    '/api/admin/guests',
    '/api/admin/settings',
    '/api/admin/celebration',
    '/api/admin/events',
    '/api/admin/media',
    '/api/admin/testimonials',
    '/api/admin/storage',
    '/api/admin/audit-logs',
    '/api/admin/users',
    '/api/admin/checkins',
  ];

  it('rejects anonymous requests to every admin route', async () => {
    for (const route of adminRoutes) {
      const res = await ctx.http().get(route);
      expect([route, res.status]).toEqual([route, 401]);
    }
  });

  it('limits check-in staff to check-in', async () => {
    const { agent, csrf } = await login(ctx, 'staff@test.local');
    for (const route of adminRoutes) {
      const res = await agent.get(route);
      expect([route, res.status]).toEqual([route, 403]);
    }
    await agent.put('/api/admin/celebration').set('X-CSRF-Token', csrf).send({ capacity: 1 }).expect(403);
    await agent.get('/api/checkin/recent').expect(200);
    expect((await ctx.prisma.celebration.findUniqueOrThrow({ where: { id: 1 } })).capacity).toBe(100);
  });

  it('reserves user management for super admins', async () => {
    const admin = await login(ctx, 'admin@test.local');
    await admin.agent.get('/api/admin/users').expect(403);
    await admin.agent.get('/api/admin/guests').expect(200);
    const sup = await login(ctx, 'super@test.local');
    const users = await sup.agent.get('/api/admin/users').expect(200);
    expect(users.body).toHaveLength(3);
    expect(JSON.stringify(users.body)).not.toMatch(/passwordHash|\$argon2/);
  });

  it('stops a super admin removing themselves or the last super admin', async () => {
    const sup = await login(ctx, 'super@test.local');
    const me = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'super@test.local' } });
    await sup.agent.delete(`/api/admin/users/${me.id}`).set('X-CSRF-Token', sup.csrf).expect(403);
    await sup.agent.put(`/api/admin/users/${me.id}`).set('X-CSRF-Token', sup.csrf).send({ role: 'ADMIN' }).expect(403);
  });

  it('ends sessions when a user is disabled', async () => {
    const staff = await login(ctx, 'staff@test.local');
    await ctx.prisma.user.update({ where: { email: 'staff@test.local' }, data: { status: 'DISABLED' } });
    await staff.agent.get('/api/checkin/recent').expect(401);
  });

  it('rejects unknown fields and malformed ids', async () => {
    const { agent, csrf } = await login(ctx, 'admin@test.local');
    const res = await agent.put('/api/admin/celebration').set('X-CSRF-Token', csrf).send({ capacity: 5, isAdmin: true }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    await agent.get('/api/admin/guests/not-a-uuid').expect(400);
    await agent.get('/api/admin/guests/00000000-0000-4000-8000-000000000000').expect(404);
  });
});
