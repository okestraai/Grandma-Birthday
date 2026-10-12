/**
 * Seeds the database.
 *
 *   npm run db:seed              first super admin (SEED_ADMIN_*) and, if SEED_DEMO=true, demo content
 *   npm run db:seed -- --fresh   wipes all content and stored files first (development only)
 *
 * Demo content goes through the real upload pipeline (previews, quota, blob storage).
 */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MediaIngestService } from '../media/media-ingest.service';
import { MediaService } from '../media/media.service';
import { hashPassword } from '../auth/password';
import { invitationCode, randomToken } from '../common/utils/crypto';
import {
  DEMO_ALBUMS,
  DEMO_CATEGORIES,
  DEMO_CELEBRANT,
  DEMO_CELEBRATION,
  DEMO_EVENTS,
  DEMO_FAMILY,
  DEMO_GUESTS,
  DEMO_PASSWORD,
  DEMO_PROGRAMME,
  DEMO_QUESTIONS,
  DEMO_RELATIONS,
  DEMO_SERVICE_PROGRAMME,
  DEMO_TESTIMONIALS,
  DEMO_TIMELINE,
  DEMO_USERS,
  type DemoProgrammeItem,
} from './demo-content';
import { PALETTES, portrait, scene } from './demo-images';

const log = new Logger('Seed');

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const fresh = process.argv.includes('--fresh');
  const demo = (process.env.SEED_DEMO ?? 'false').toLowerCase() === 'true';
  // The demo accounts share one password that is written in the public repository.
  if (demo && process.env.NODE_ENV === 'production') throw new Error('SEED_DEMO=true is refused when NODE_ENV=production: the demo password is public');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const prisma = app.get(PrismaService);
    const settingsService = app.get(SettingsService);
    await settingsService.ensureDefaults();

    if (fresh) {
      if (process.env.NODE_ENV === 'production') throw new Error('--fresh is refused when NODE_ENV=production');
      await wipe(prisma, app.get(MediaService));
      // The wipe removes the events too; put the placeholder back.
      await settingsService.ensureDefaults();
    }

    await seedAdmin(prisma);
    if (!demo) {
      log.log('SEED_DEMO is not true: skipped demo content.');
      return;
    }
    if ((await prisma.album.count()) > 0 || (await prisma.guest.count()) > 0) {
      log.log('Content already exists: skipped demo content. Use --fresh to start over.');
      return;
    }
    await seedDemo(prisma, app.get(MediaIngestService), settingsService);
    log.log(`Demo ready. Log in at /admin/login as ${DEMO_USERS.map((u) => u.email).join(', ')} (password ${DEMO_PASSWORD}).`);
  } finally {
    await app.close();
  }
}

async function wipe(prisma: PrismaService, media: MediaService): Promise<void> {
  const ids = (await prisma.media.findMany({ select: { id: true } })).map((m) => m.id);
  if (ids.length) await media.deleteMany(ids);
  await prisma.$transaction([
    prisma.checkIn.deleteMany(),
    prisma.rsvpEvent.deleteMany(),
    prisma.guestEvent.deleteMany(),
    prisma.companion.deleteMany(),
    prisma.rsvp.deleteMany(),
    prisma.invitation.deleteMany(),
    prisma.guest.deleteMany(),
    prisma.guestCategory.deleteMany(),
    prisma.rsvpQuestion.deleteMany(),
    prisma.testimonial.deleteMany(),
    prisma.familyRelationship.deleteMany(),
    prisma.familyMember.deleteMany(),
    prisma.timelineEntry.deleteMany(),
    prisma.programmeItem.deleteMany(),
    prisma.eventCategory.deleteMany(),
    prisma.event.deleteMany(),
    prisma.album.deleteMany(),
    prisma.uploadSession.deleteMany(),
    prisma.auditLog.deleteMany(),
  ]);
  log.log(`Wiped content and ${ids.length} stored files.`);
}

async function seedAdmin(prisma: PrismaService): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
    if (!(await prisma.user.findUnique({ where: { email } }))) {
      await prisma.user.create({ data: { email, name: 'Super Admin', role: 'SUPER_ADMIN', passwordHash: await hashPassword(password), passwordChangedAt: new Date() } });
      log.log(`Created super admin ${email}.`);
    }
  }
  if ((process.env.SEED_DEMO ?? '').toLowerCase() === 'true') {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    for (const user of DEMO_USERS) {
      await prisma.user.upsert({ where: { email: user.email }, create: { ...user, passwordHash, passwordChangedAt: new Date() }, update: {} });
    }
  }
  if ((await prisma.user.count()) === 0) log.warn('No users exist. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD and run the seed again.');
}

async function seedDemo(prisma: PrismaService, ingest: MediaIngestService, settingsService: SettingsService): Promise<void> {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@demo.local' } });
  let seed = 7;
  const photo = async (buffer: Buffer, name: string, extra: { albumId?: string; caption?: string; altText?: string } = {}) => {
    const settings = await settingsService.getSettings();
    return ingest.ingestBuffer(buffer, name, { source: 'ADMIN', status: 'APPROVED', settings, uploadedById: admin.id, ...extra });
  };

  // Celebration, celebrant, events and programmes. The guest categories come first: events are limited by them.
  await prisma.celebration.update({ where: { id: 1 }, data: DEMO_CELEBRATION });
  const portraitMedia = await photo(await portrait(1), 'portrait.jpg', { caption: 'Margaret, 2026', altText: 'Portrait of Margaret' });
  await prisma.celebrant.update({ where: { id: 1 }, data: { ...DEMO_CELEBRANT, portraitMediaId: portraitMedia.id } });
  const categories: Record<string, string> = {};
  for (const [i, c] of DEMO_CATEGORIES.entries()) categories[c.name] = (await prisma.guestCategory.create({ data: { ...c, sortOrder: i } })).id;
  // The placeholder event from first boot makes way for the demo events.
  await prisma.event.deleteMany();
  const events: Record<string, string> = {};
  for (const [i, { categories: invited, ...e }] of DEMO_EVENTS.entries()) {
    const row = await prisma.event.create({
      data: { ...e, sortOrder: i, invitedCategories: { create: invited.map((name) => ({ categoryId: categories[name] })) } },
    });
    events[e.slug] = row.id;
  }
  const programmes: [string, DemoProgrammeItem[]][] = [
    ['thanksgiving-service', DEMO_SERVICE_PROGRAMME],
    ['birthday-dinner', DEMO_PROGRAMME],
  ];
  for (const [slug, items] of programmes) {
    await prisma.programmeItem.createMany({ data: items.map((p, i) => ({ ...p, eventId: events[slug], sortOrder: i })) });
  }
  log.log('Celebration, celebrant, events and programmes');

  // Albums and photos
  const albums: Record<string, string> = {};
  for (const [i, a] of DEMO_ALBUMS.entries()) {
    const album = await prisma.album.create({ data: { slug: a.slug, title: a.title, description: a.description, sortOrder: i } });
    albums[a.slug] = album.id;
    for (let n = 0; n < a.count; n++) {
      const tall = n % 3 === 1;
      const buffer = await scene(seed++, PALETTES[a.palette], tall ? 1067 : 1600, tall ? 1500 : 1067, 1 + (n % 4));
      await photo(buffer, `${a.slug}-${n + 1}.jpg`, { albumId: album.id, caption: `${a.title}, photograph ${n + 1}`, altText: `${a.title}: a demo photograph` });
    }
  }
  log.log('Albums and photos');

  // Timeline
  for (const [i, t] of DEMO_TIMELINE.entries()) {
    const media = t.image ? await photo(await scene(seed++, PALETTES[t.image], 1600, 1067, 2), `timeline-${t.year}.jpg`, { altText: t.title }) : null;
    await prisma.timelineEntry.create({
      data: { year: t.year, month: t.month, title: t.title, description: t.description, category: t.category, mediaId: media?.id ?? null, sortOrder: i },
    });
  }
  log.log('Timeline');

  // Family
  const members: Record<string, string> = {};
  for (const [i, f] of DEMO_FAMILY.entries()) {
    const { key, ...data } = f;
    const pic = await photo(await portrait(seed++, Object.values(PALETTES)[i % 7], 800, 1000), `family-${key}.jpg`, { altText: f.fullName });
    const row = await prisma.familyMember.create({ data: { ...data, photoMediaId: pic.id, sortOrder: i } });
    members[key] = row.id;
  }
  await prisma.familyRelationship.createMany({ data: DEMO_RELATIONS.map(([from, to, type]) => ({ fromId: members[from], toId: members[to], type })) });
  log.log('Family tree');

  // Guests, RSVPs, invitations
  const questions = [];
  for (const [i, q] of DEMO_QUESTIONS.entries()) questions.push(await prisma.rsvpQuestion.create({ data: { ...q, sortOrder: i } }));
  for (const [i, g] of DEMO_GUESTS.entries()) {
    const email = `${g.name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@demo.local`;
    const category = DEMO_CATEGORIES.find((c) => c.name === g.category)!;
    const guest = await prisma.guest.create({
      data: {
        fullName: g.name,
        email,
        phone: `+234 800 000 ${String(1000 + i).slice(-4)}`,
        categoryId: categories[g.category],
        allowedCompanions: Math.max(category.defaultCompanions, g.companions.length),
        source: i % 3 === 0 ? 'SELF_REGISTERED' : 'ADMIN_INVITED',
        createdAt: new Date(Date.now() - (DEMO_GUESTS.length - i) * 86_400_000),
      },
    });
    if (g.response) {
      await prisma.rsvp.create({
        data: {
          guestId: guest.id,
          response: g.response,
          companionCount: g.response === 'ATTENDING' ? g.companions.length : 0,
          dietary: g.dietary ?? null,
          accessibility: g.accessibility ?? null,
          answers: g.response === 'ATTENDING' ? { [questions[0].id]: i % 2 ? 'Yes' : 'Not sure yet' } : {},
          submittedAt: new Date(Date.now() - (DEMO_GUESTS.length - i) * 86_400_000),
          companions: { create: g.response === 'ATTENDING' ? g.companions.map((fullName) => ({ fullName })) : [] },
          events: {
            create:
              g.response === 'ATTENDING'
                ? (g.events ?? []).map((slug) => ({ eventId: events[slug], companionCount: g.fewer?.[slug] ?? g.companions.length }))
                : [],
          },
        },
      });
    }
    await prisma.invitation.create({
      data: {
        guestId: guest.id,
        code: invitationCode(),
        token: randomToken(),
        status: g.revoked ? 'REVOKED' : 'ACTIVE',
        revokedAt: g.revoked ? new Date() : null,
        revokedReason: g.revoked ? 'Duplicate registration (demo)' : null,
      },
    });
  }
  log.log(`Guests (${DEMO_GUESTS.length}) with invitations`);

  // Testimonials
  for (const [i, t] of DEMO_TESTIMONIALS.entries()) {
    const media = t.photo
      ? await ingest.ingestBuffer(await portrait(seed++, PALETTES.rose, 800, 1000), `tribute-${i}.jpg`, {
          source: 'TESTIMONIAL',
          status: t.status,
          settings: await settingsService.getSettings(),
          uploaderName: t.authorName,
        })
      : null;
    await prisma.testimonial.create({
      data: {
        authorName: t.authorName,
        relationship: t.relationship || null,
        message: t.message,
        status: t.status,
        isPublic: t.isPublic ?? false,
        isFeatured: t.isFeatured ?? false,
        photoMediaId: media?.id ?? null,
        sortOrder: i,
        reviewedAt: t.status === 'PENDING' ? null : new Date(),
        createdAt: new Date(Date.now() - (DEMO_TESTIMONIALS.length - i) * 3600_000 * 7),
      },
    });
  }
  log.log('Testimonials');

  // Guest uploads waiting for moderation
  const session = await prisma.uploadSession.create({ data: { uploaderName: 'Aunty Chioma', message: 'From the rehearsal dinner!', fileCount: 5 } });
  const settings = await settingsService.getSettings();
  for (let n = 0; n < 5; n++) {
    await ingest.ingestBuffer(await scene(seed++, PALETTES.night, 1600, 1067, 3), `IMG_20${n}.jpg`, {
      source: 'GUEST_UPLOAD',
      status: n === 4 ? 'REJECTED' : 'PENDING',
      settings,
      uploaderName: session.uploaderName,
      uploaderMessage: session.message,
      uploadSessionId: session.id,
    });
  }
  log.log('Guest uploads (pending moderation)');

  // Branding and settings
  const hero = await photo(await scene(seed++, PALETTES.emerald, 2000, 1200, 0), 'hero.jpg', { altText: 'Gold light over a dark emerald background' });
  await prisma.settings.update({
    where: { id: 1 },
    data: { isDemo: true, guestUploadAlbumId: albums['celebration-night'], heroMediaId: hero.id, ogImageMediaId: portraitMedia.id, siteTitle: 'Margaret at Seventy' },
  });
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
