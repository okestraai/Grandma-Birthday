import { createTestApp, login, pngBuffer, resetDb, type TestContext } from './helpers';

describe('Guest uploads, storage quota and moderation (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    const leftovers = await ctx.prisma.media.findMany({ select: { id: true } });
    if (leftovers.length) {
      const { MediaService } = await import('../src/media/media.service');
      await ctx.app.get(MediaService).deleteMany(leftovers.map((m) => m.id));
    }
    await resetDb(ctx);
    token = (await ctx.prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).uploadToken;
  });
  afterAll(() => ctx.app.close());

  it('accepts real photos, rejects disguised files, and holds uploads for review', async () => {
    const res = await ctx
      .http()
      .post(`/api/uploads/${token}`)
      .field('uploaderName', 'Cousin Bola')
      .attach('files', await pngBuffer(), 'dance.png')
      .attach('files', Buffer.from('<svg onload="alert(1)"></svg>'), 'evil.png')
      .attach('files', Buffer.from('MZ\x90\x00 not an image'), 'photo.jpg')
      .expect(201);
    expect(res.body.accepted).toBe(1);
    expect(res.body.moderated).toBe(true);
    expect(res.body.rejected.map((r: { code: string }) => r.code)).toEqual(['UNSUPPORTED_FILE_TYPE', 'UNSUPPORTED_FILE_TYPE']);

    const media = await ctx.prisma.media.findFirstOrThrow();
    expect(media).toMatchObject({ status: 'PENDING', source: 'GUEST_UPLOAD', uploaderName: 'Cousin Bola', width: 64, height: 64 });
    expect(Number(media.storedBytes)).toBeGreaterThan(Number(media.sizeBytes));

    // Pending: invisible to the public, visible to admins.
    await ctx.http().get(`/api/media/${media.id}/thumb`).expect(404);
    const admin = await login(ctx, 'admin@test.local');
    await admin.agent.get(`/api/media/${media.id}/thumb`).expect(200).expect('Content-Type', 'image/webp');

    // Approve into the default album → public.
    const album = await ctx.prisma.album.create({ data: { slug: 'night', title: 'Night' } });
    await ctx.prisma.settings.update({ where: { id: 1 }, data: { guestUploadAlbumId: album.id } });
    await admin.agent.post('/api/admin/media/bulk').set('X-CSRF-Token', admin.csrf).send({ ids: [media.id], action: 'APPROVE' }).expect(200);
    await ctx.http().get(`/api/media/${media.id}/thumb`).expect(200).expect('Cache-Control', /public/);
    const list = await ctx.http().get('/api/media?album=night').expect(200);
    expect(list.body.items.map((m: { id: string }) => m.id)).toEqual([media.id]);
    expect(JSON.stringify(list.body)).not.toMatch(/storageKey|uploaderName|Cousin/);

    // Versioned URLs may be cached for good; a stale or missing version keeps the short policy.
    const thumbUrl: string = list.body.items[0].urls.thumb;
    expect(thumbUrl).toMatch(new RegExp(`^/api/media/${media.id}/thumb\\?v=[0-9a-z]+$`));
    await ctx.http().get(thumbUrl).expect(200).expect('Cache-Control', 'public, max-age=86400, immutable');
    await ctx.http().get(`/api/media/${media.id}/thumb?v=old`).expect(200).expect('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    expect(list.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=600');
  });

  it('caches the public site briefly and clears it when an admin changes settings', async () => {
    const first = await ctx.http().get('/api/site').expect(200);
    expect(first.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=600');
    const admin = await login(ctx, 'admin@test.local');
    await admin.agent.put('/api/admin/settings').set('X-CSRF-Token', admin.csrf).send({ siteTitle: 'Mama at Seventy' }).expect(200);
    const second = await ctx.http().get('/api/site').expect(200);
    expect(second.body.branding.siteTitle).toBe('Mama at Seventy');
    expect(second.body.branding.siteTitle).not.toBe(first.body.branding.siteTitle);
    // Admin responses are not marked cacheable.
    const settings = await admin.agent.get('/api/admin/settings').expect(200);
    expect(settings.headers['cache-control']).toBeUndefined();
  });

  it('rejects a damaged image cleanly instead of failing', async () => {
    const truncated = (await pngBuffer(300, 300)).subarray(0, 120);
    const res = await ctx.http().post(`/api/uploads/${token}`).attach('files', truncated, 'broken.png').expect(201);
    expect(res.body).toMatchObject({ accepted: 0, rejected: [{ code: 'UNSUPPORTED_FILE_TYPE' }] });
    expect(await ctx.prisma.media.count()).toBe(0);
  });

  it('rejects wrong or rotated upload links before reading files', async () => {
    await ctx.http().post('/api/uploads/wrong-token').attach('files', await pngBuffer(), 'a.png').expect(404);
    const admin = await login(ctx, 'admin@test.local');
    await admin.agent.post('/api/admin/settings/upload-token/rotate').set('X-CSRF-Token', admin.csrf).expect(200);
    const res = await ctx.http().post(`/api/uploads/${token}`).attach('files', await pngBuffer(), 'a.png').expect(404);
    expect(res.body.code).toBe('UPLOAD_TOKEN_INVALID');
  });

  it('enforces size limits, the video switch and closed uploads', async () => {
    await ctx.prisma.settings.update({ where: { id: 1 }, data: { maxPhotoBytes: 200 * 1024 } });
    const sharp = (await import('sharp')).default;
    // Random noise does not compress, so this PNG is well over the limit.
    const big = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: '#000', noise: { type: 'gaussian', mean: 128, sigma: 60 } } })
      .png()
      .toBuffer();
    expect(big.length).toBeGreaterThan(200 * 1024);
    const tooBig = await ctx.http().post(`/api/uploads/${token}`).attach('files', big, 'big.png');
    expect([413, 201]).toContain(tooBig.status);
    if (tooBig.status === 201) expect(tooBig.body.rejected[0].code).toBe('FILE_TOO_LARGE');
    else expect(tooBig.body.code).toBe('FILE_TOO_LARGE');

    await ctx.prisma.settings.update({ where: { id: 1 }, data: { videoUploadsEnabled: false } });
    const mp4 = Buffer.concat([Buffer.from('\0\0\0\x18ftypmp42', 'latin1'), Buffer.alloc(64)]);
    const video = await ctx.http().post(`/api/uploads/${token}`).attach('files', mp4, 'clip.mp4').expect(201);
    expect(video.body.rejected[0].code).toBe('VIDEO_UPLOADS_DISABLED');

    await ctx.prisma.settings.update({ where: { id: 1 }, data: { guestUploadsOpen: false } });
    const closed = await ctx.http().post(`/api/uploads/${token}`).attach('files', await pngBuffer(), 'a.png').expect(403);
    expect(closed.body.code).toBe('UPLOADS_CLOSED');
  });

  it('blocks uploads once the storage quota is used, and reports the level', async () => {
    await ctx.http().post(`/api/uploads/${token}`).attach('files', await pngBuffer(), 'one.png').expect(201);
    const used = await ctx.prisma.media.aggregate({ _sum: { storedBytes: true } });
    await ctx.prisma.settings.update({ where: { id: 1 }, data: { storageQuotaBytes: used._sum.storedBytes! + 10n } });

    const res = await ctx.http().post(`/api/uploads/${token}`).attach('files', await pngBuffer(80, 80), 'two.png').expect(413);
    expect(res.body.code).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(await ctx.prisma.media.count()).toBe(1);

    const admin = await login(ctx, 'admin@test.local');
    const storage = await admin.agent.get('/api/admin/storage').expect(200);
    expect(storage.body.level).toBe('CRITICAL');
    expect(storage.body.photoCount).toBe(1);

    await ctx.prisma.settings.update({ where: { id: 1 }, data: { storageQuotaBytes: used._sum.storedBytes! } });
    const config = await ctx.http().get(`/api/uploads/${token}`).expect(200);
    expect(config.body).toMatchObject({ open: false, closedReason: 'STORAGE_FULL' });
    await ctx.http().post(`/api/uploads/${token}`).attach('files', await pngBuffer(), 'three.png').expect(413);
  });

  it('never stores more than the quota under concurrent uploads', async () => {
    const one = await pngBuffer(120, 120);
    await ctx.http().post(`/api/uploads/${token}`).attach('files', one, 'probe.png').expect(201);
    const size = Number((await ctx.prisma.media.findFirstOrThrow()).storedBytes);
    await ctx.prisma.settings.update({ where: { id: 1 }, data: { storageQuotaBytes: BigInt(size * 3 + size / 2) } });
    await Promise.all(Array.from({ length: 6 }, (_, i) => ctx.http().post(`/api/uploads/${token}`).attach('files', one, `c${i}.png`)));
    const total = await ctx.prisma.media.aggregate({ _sum: { storedBytes: true }, _count: { _all: true } });
    expect(total._count._all).toBe(3);
    expect(Number(total._sum.storedBytes)).toBeLessThanOrEqual(size * 3.5);
  });
});

describe('Testimonials (e2e)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  it('shows only approved messages that an admin chose to publish', async () => {
    const submit = (name: string) =>
      ctx.http().post('/api/testimonials').field('authorName', name).field('message', 'Happy seventieth birthday, with love!').expect(201);
    const a = (await submit('Alpha')).body.id;
    const b = (await submit('Bravo')).body.id;
    await submit('Charlie');
    expect((await ctx.http().get('/api/testimonials/public')).body.total).toBe(0);

    const admin = await login(ctx, 'admin@test.local');
    const patch = (id: string, body: object) => admin.agent.patch(`/api/admin/testimonials/${id}`).set('X-CSRF-Token', admin.csrf).send(body);
    expect((await patch(a, { isPublic: true }).expect(409)).body.code).toBe('TESTIMONIAL_NOT_APPROVED');
    await patch(a, { status: 'APPROVED' }).expect(200);
    await patch(b, { status: 'APPROVED' }).expect(200);
    expect((await ctx.http().get('/api/testimonials/public')).body.total).toBe(0);

    await patch(a, { isFeatured: true }).expect(200);
    const pub = await ctx.http().get('/api/testimonials/public').expect(200);
    expect(pub.body.items.map((t: { authorName: string }) => t.authorName)).toEqual(['Alpha']);
    expect(pub.body.items[0]).not.toHaveProperty('email');

    await patch(a, { status: 'REJECTED' }).expect(200);
    expect((await ctx.http().get('/api/testimonials/public')).body.total).toBe(0);
    const counts = await admin.agent.get('/api/admin/testimonials/counts').expect(200);
    expect(counts.body).toMatchObject({ all: 3, pending: 1, approved: 1, rejected: 1, public: 0, featured: 0 });
  });

  it('validates submissions and honours the closed switch', async () => {
    const short = await ctx.http().post('/api/testimonials').field('authorName', 'X').field('message', 'hi').expect(400);
    expect(Object.keys(short.body.details)).toEqual(expect.arrayContaining(['authorName', 'message']));
    await ctx.prisma.settings.update({ where: { id: 1 }, data: { testimonialsOpen: false } });
    const closed = await ctx.http().post('/api/testimonials').field('authorName', 'Someone').field('message', 'A lovely long message').expect(403);
    expect(closed.body.code).toBe('TESTIMONIALS_CLOSED');
  });
});
