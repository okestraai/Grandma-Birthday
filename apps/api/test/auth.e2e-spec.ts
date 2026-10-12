import { createTestApp, login, PASSWORD, resetDb, type TestContext } from './helpers';

describe('Auth (e2e)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  it('logs in with httpOnly session cookies and a readable CSRF cookie', async () => {
    const res = await ctx.http().post('/api/auth/login').send({ email: 'ADMIN@test.local ', password: PASSWORD }).expect(200);
    expect(res.body.user).toMatchObject({ email: 'admin@test.local', role: 'ADMIN' });
    expect(res.body.user.permissions).toContain('guests:manage');
    expect(res.body.user.permissions).not.toContain('users:manage');
    const cookies = ([] as string[]).concat(res.headers['set-cookie']);
    expect(cookies.find((c) => c.startsWith('bp_access='))).toMatch(/HttpOnly/);
    expect(cookies.find((c) => c.startsWith('bp_refresh='))).toMatch(/HttpOnly/);
    expect(cookies.find((c) => c.startsWith('bp_csrf='))).not.toMatch(/HttpOnly/);
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it('gives the same error for an unknown email and a wrong password', async () => {
    const a = await ctx.http().post('/api/auth/login').send({ email: 'nobody@test.local', password: 'whatever-123' }).expect(401);
    const b = await ctx.http().post('/api/auth/login').send({ email: 'admin@test.local', password: 'wrong-password' }).expect(401);
    expect(a.body.code).toBe('INVALID_CREDENTIALS');
    expect(b.body.message).toBe(a.body.message);
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    for (let i = 0; i < 4; i++) await ctx.http().post('/api/auth/login').send({ email: 'admin@test.local', password: 'nope-nope' }).expect(401);
    await ctx.http().post('/api/auth/login').send({ email: 'admin@test.local', password: 'nope-nope' }).expect(423);
    const locked = await ctx.http().post('/api/auth/login').send({ email: 'admin@test.local', password: PASSWORD }).expect(423);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('refuses disabled accounts', async () => {
    await ctx.prisma.user.update({ where: { email: 'admin@test.local' }, data: { status: 'DISABLED' } });
    const res = await ctx.http().post('/api/auth/login').send({ email: 'admin@test.local', password: PASSWORD }).expect(403);
    expect(res.body.code).toBe('ACCOUNT_DISABLED');
  });

  it('requires the CSRF header for cookie-authenticated changes', async () => {
    const { agent, csrf } = await login(ctx, 'admin@test.local');
    const denied = await agent.put('/api/admin/celebration').send({ capacity: 120 }).expect(403);
    expect(denied.body.code).toBe('CSRF_TOKEN_INVALID');
    await agent.put('/api/admin/celebration').set('X-CSRF-Token', 'forged').send({ capacity: 120 }).expect(403);
    await agent.put('/api/admin/celebration').set('X-CSRF-Token', csrf).send({ capacity: 120 }).expect(200);
  });

  it('rotates refresh tokens and ends the session family when an old one is replayed', async () => {
    const agent = ctx.http();
    const res = await agent.post('/api/auth/login').send({ email: 'admin@test.local', password: PASSWORD }).expect(200);
    const cookies = ([] as string[]).concat(res.headers['set-cookie']);
    const value = (name: string) => cookies.find((c) => c.startsWith(`${name}=`))!.split(';')[0].split('=')[1];
    const oldRefresh = value('bp_refresh');
    const csrf = value('bp_csrf');

    await agent.post('/api/auth/refresh').set('X-CSRF-Token', csrf).expect(200);
    const tokens = await ctx.prisma.refreshToken.findMany({ orderBy: { createdAt: 'asc' } });
    expect(tokens).toHaveLength(2);
    expect(tokens[0].revokedAt).not.toBeNull();
    expect(tokens[0].replacedById).toBe(tokens[1].id);

    // A replay within seconds is a race between tabs: tolerated, no new refresh token issued.
    const replay = () =>
      ctx.http().post('/api/auth/refresh').set('Cookie', [`bp_refresh=${oldRefresh}`, `bp_csrf=${csrf}`]).set('X-CSRF-Token', csrf);
    await replay().expect(200);
    expect(await ctx.prisma.refreshToken.count()).toBe(2);

    // A replay long after rotation looks like theft: every token in the family is revoked.
    await ctx.prisma.refreshToken.update({ where: { id: tokens[0].id }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    const stolen = await replay().expect(401);
    expect(stolen.body.code).toBe('UNAUTHENTICATED');
    expect(await ctx.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'REFRESH_TOKEN_REUSE_DETECTED' } })).toBe(1);
  });

  it('logs out and clears the session', async () => {
    const { agent, csrf } = await login(ctx, 'admin@test.local');
    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf).expect(204);
    await agent.get('/api/auth/me').expect(401);
    expect(await ctx.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('resets a password with a one-time token and ends existing sessions', async () => {
    const { agent, csrf } = await login(ctx, 'admin@test.local');
    await ctx.http().post('/api/auth/password/forgot').send({ email: 'admin@test.local' }).expect(202);
    await ctx.http().post('/api/auth/password/forgot').send({ email: 'ghost@test.local' }).expect(202);
    expect(await ctx.prisma.passwordResetToken.count()).toBe(1);

    const { sha256 } = await import('../src/common/utils/crypto');
    const token = 'known-reset-token-for-the-test-0001';
    await ctx.prisma.passwordResetToken.updateMany({ data: { tokenHash: sha256(token) } });
    const weak = await ctx.http().post('/api/auth/password/reset').send({ token, password: 'short' }).expect(400);
    expect(weak.body.code).toBe('WEAK_PASSWORD');
    await ctx.http().post('/api/auth/password/reset').send({ token, password: 'A-much-better-password-70' }).expect(204);
    await ctx.http().post('/api/auth/password/reset').send({ token, password: 'Another-good-password-70' }).expect(400);
    await agent.post('/api/auth/refresh').set('X-CSRF-Token', csrf).expect(401);
    await login(ctx, 'admin@test.local', 'A-much-better-password-70');
  });
});
