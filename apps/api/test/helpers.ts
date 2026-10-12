import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config/app-config';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';
import { PublicCache } from '../src/common/public-cache';
import { hashPassword } from '../src/auth/password';

type TestAgent = ReturnType<typeof request.agent>;

export const PASSWORD = 'Test-Password-70!';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: () => TestAgent;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, logger: ['error'] });
  configureApp(app, loadConfig());
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request.agent(app.getHttpServer()) };
}

let passwordHash: Promise<string> | null = null;

/** Empties every table, recreates defaults, opens RSVPs and creates one user per role. */
export async function resetDb(ctx: TestContext): Promise<void> {
  const tables = await ctx.prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await ctx.prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await ctx.app.get(SettingsService).ensureDefaults();
  // The truncate bypasses HTTP, so nothing else clears cached public responses.
  ctx.app.get(PublicCache).clear();
  await ctx.prisma.celebration.update({ where: { id: 1 }, data: { rsvpOpen: true, capacity: 100 } });
  passwordHash ??= hashPassword(PASSWORD);
  const hash = await passwordHash;
  await ctx.prisma.user.createMany({
    data: [
      { email: 'super@test.local', name: 'Super', role: 'SUPER_ADMIN', passwordHash: hash },
      { email: 'admin@test.local', name: 'Admin', role: 'ADMIN', passwordHash: hash },
      { email: 'staff@test.local', name: 'Staff', role: 'CHECK_IN_STAFF', passwordHash: hash },
    ],
  });
}

export interface Session {
  agent: TestAgent;
  csrf: string;
}

export async function login(ctx: TestContext, email: string, password = PASSWORD): Promise<Session> {
  const agent = ctx.http();
  const res = await agent.post('/api/auth/login').send({ email, password }).expect(200);
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const csrf = cookies.find((c) => c.startsWith('bp_csrf='))?.split(';')[0].split('=')[1] ?? '';
  return { agent, csrf };
}

/** Minimal valid PNG of the given size (solid colour). */
export async function pngBuffer(width = 64, height = 64): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width, height, channels: 3, background: '#0B3D35' } }).png().toBuffer();
}
