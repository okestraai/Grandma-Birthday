/**
 * Loads the repository's demo dataset into a REMOTE environment through the public admin
 * API, as a signed-in super admin.
 *
 * Why not `npm run db:seed`: that seeds by writing to Prisma directly, needs database
 * access the UAT database does not expose, and only loads demo content when SEED_DEMO=true,
 * which the seed refuses under NODE_ENV=production. Driving the real API instead keeps the
 * remote environment in production mode and creates no accounts whose password is public.
 *
 *   UAT_BASE=https://... UAT_EMAIL=... UAT_PASSWORD=... npx tsx seed-uat.mts
 *
 * Safe to re-run: every step checks for what it already created.
 */
import {
  DEMO_ALBUMS, DEMO_CATEGORIES, DEMO_CELEBRANT, DEMO_EVENT, DEMO_FAMILY,
  DEMO_PROGRAMME, DEMO_TESTIMONIALS, DEMO_TIMELINE,
} from './src/seed/demo-content';
import { PALETTES, portrait, scene } from './src/seed/demo-images';

const BASE = (process.env.UAT_BASE ?? '').replace(/\/$/, '');
const EMAIL = process.env.UAT_EMAIL ?? '';
const PASSWORD = process.env.UAT_PASSWORD ?? '';
if (!BASE || !EMAIL || !PASSWORD) throw new Error('set UAT_BASE, UAT_EMAIL, UAT_PASSWORD');

let cookieHeader = '';
let csrf = '';
const ok = (s: string) => console.log('  ✓ ' + s);
const warn = (s: string) => console.log('  ! ' + s);

function absorb(res: Response): void {
  const jar = new Map(cookieHeader ? cookieHeader.split('; ').map((c) => [c.slice(0, c.indexOf('=')), c.slice(c.indexOf('=') + 1)]) : []);
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const name = pair.slice(0, pair.indexOf('='));
    const value = pair.slice(pair.indexOf('=') + 1);
    if (value && value !== 'undefined') jar.set(name, value);
    if (name === 'bp_csrf') csrf = decodeURIComponent(value);
  }
  cookieHeader = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  absorb(res);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function upload(files: { name: string; buf: Buffer }[], albumId?: string, caption?: string): Promise<any> {
  const form = new FormData();
  for (const f of files) form.append('files', new Blob([new Uint8Array(f.buf)], { type: 'image/jpeg' }), f.name);
  if (albumId) form.append('albumId', albumId);
  if (caption) form.append('caption', caption);
  const res = await fetch(`${BASE}/api/admin/media`, {
    method: 'POST',
    headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf },
    body: form,
  });
  absorb(res);
  const text = await res.text();
  if (!res.ok) throw new Error(`upload -> ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const iso = (d: Date | string) => new Date(d).toISOString();

async function main(): Promise<void> {
  console.log(`\nSeeding ${BASE} as ${EMAIL}\n`);

  // --- sign in -------------------------------------------------------------
  const session = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  ok(`signed in as ${session.user.email} (${session.user.role})`);

  // --- celebrant and event -------------------------------------------------
  // Never overwrite real content. Once someone has replaced the placeholder celebrant
  // through the admin dashboard, writing DEMO_CELEBRANT over it would destroy their work.
  // Pass SEED_OVERWRITE=1 to force it.
  const current = await api('GET', '/admin/celebrant');
  const placeholder = !current.fullName || current.fullName === 'The Celebrant';
  if (!placeholder && process.env.SEED_OVERWRITE !== '1') {
    warn(`celebrant is already "${current.fullName}" - leaving celebrant and event alone (SEED_OVERWRITE=1 to replace)`);
  } else {
    const c = DEMO_CELEBRANT;
    await api('PUT', '/admin/celebrant', {
    fullName: c.fullName, preferredName: c.preferredName, honorific: c.honorific,
    birthDate: iso(c.birthDate), celebrationAge: c.celebrationAge,
    birthPlace: c.birthPlace, heroHeadline: c.heroHeadline,
    introduction: c.introduction, biography: c.biography, quote: c.quote,
      quoteAttribution: c.quoteAttribution, achievements: c.achievements, values: c.values,
    });
    ok('celebrant');

    const e = DEMO_EVENT;
    await api('PUT', '/admin/event', {
    name: e.name, tagline: e.tagline, description: e.description,
    startsAt: iso(e.startsAt), endsAt: iso(e.endsAt), timezone: e.timezone,
    venueName: e.venueName, address: e.address, city: e.city, mapUrl: e.mapUrl,
    latitude: e.latitude, longitude: e.longitude, theme: e.theme, dressCode: e.dressCode,
    parkingInfo: e.parkingInfo, contactName: e.contactName, contactEmail: e.contactEmail,
    contactPhone: e.contactPhone, capacity: e.capacity, rsvpOpen: e.rsvpOpen,
      rsvpMode: e.rsvpMode, rsvpDeadline: iso(e.rsvpDeadline),
    });
    ok('event');
  }

  // --- portrait: the hero's arched photo -----------------------------------
  const existingPortrait = await api('GET', '/admin/celebrant');
  if (existingPortrait.portraitMediaId) {
    ok('portrait already set');
  } else {
    const buf = await portrait(7, PALETTES.emerald);
    const up = await upload([{ name: 'portrait.jpg', buf }], undefined, 'Margaret');
    const media = up.media?.[0];
    if (!media) throw new Error('portrait upload returned no media: ' + JSON.stringify(up).slice(0, 300));
    await api('PUT', '/admin/celebrant', { portraitMediaId: media.id });
    ok('portrait uploaded and attached');
  }

  // --- programme -----------------------------------------------------------
  const programme = await api('GET', '/admin/programme');
  if (programme.length) ok(`programme already has ${programme.length} items`);
  else {
    for (const p of DEMO_PROGRAMME) await api('POST', '/admin/programme', p);
    ok(`programme (${DEMO_PROGRAMME.length})`);
  }

  // --- timeline ------------------------------------------------------------
  const timeline = await api('GET', '/admin/timeline');
  if (timeline.length) ok(`timeline already has ${timeline.length} entries`);
  else {
    for (const t of DEMO_TIMELINE) {
      await api('POST', '/admin/timeline', {
        year: t.year, month: t.month ?? null, title: t.title,
        description: t.description ?? null, category: t.category, isPublished: true,
      });
    }
    ok(`timeline (${DEMO_TIMELINE.length})`);
  }

  // --- albums, with generated photos ---------------------------------------
  const albums = await api('GET', '/admin/albums');
  const byTitle = new Map(albums.map((a: any) => [a.title, a]));
  for (const a of DEMO_ALBUMS) {
    let album: any = byTitle.get(a.title);
    if (!album) {
      album = await api('POST', '/admin/albums', {
        title: a.title, description: a.description, isPublished: true,
      });
      ok(`album "${a.title}"`);
    }
    const existing = await api('GET', `/admin/media?albumId=${album.id}&pageSize=1`);
    if ((existing.total ?? existing.items?.length ?? 0) > 0) { ok(`  photos already in "${a.title}"`); continue; }
    if (a.count === 0) continue;
    const files = [];
    for (let i = 0; i < a.count; i++) {
      files.push({ name: `${a.slug}-${i + 1}.jpg`, buf: await scene(a.slug.length * 17 + i, PALETTES[a.palette] ?? PALETTES.emerald) });
    }
    const up = await upload(files, album.id);
    // AdminUploadResult is { accepted: number, rejected: [], media: AdminMedia[] }, and
    // admin uploads arrive APPROVED, so there is nothing to moderate here.
    const added = up.media ?? [];
    if (up.rejected?.length) warn(`  ${up.rejected.length} rejected: ${JSON.stringify(up.rejected[0]).slice(0, 160)}`);
    ok(`  ${added.length} photos -> "${a.title}"`);
  }

  // --- guest categories ----------------------------------------------------
  const cats = await api('GET', '/admin/guest-categories');
  if (cats.length) ok(`guest categories already exist (${cats.length})`);
  else {
    for (const g of DEMO_CATEGORIES) await api('POST', '/admin/guest-categories', g);
    ok(`guest categories (${DEMO_CATEGORIES.length})`);
  }

  // --- family --------------------------------------------------------------
  const tree = await api('GET', '/admin/family');
  const members = tree.members ?? tree ?? [];
  if (members.length) ok(`family already has ${members.length} members`);
  else {
    let n = 0;
    for (const f of DEMO_FAMILY as any[]) {
      try {
        await api('POST', '/admin/family', {
          fullName: f.fullName, relationshipLabel: f.relationshipLabel,
          generation: f.generation ?? 0, birthYear: f.birthYear ?? null,
          deathYear: f.deathYear ?? null, bio: f.bio ?? null,
          isCelebrant: f.isCelebrant ?? false, isPublished: true,
        });
        n++;
      } catch (err) { warn(`family "${f.fullName}": ${(err as Error).message.slice(0, 150)}`); }
    }
    ok(`family (${n})`);
  }

  // --- testimonials --------------------------------------------------------
  const existingT = await api('GET', '/admin/testimonials?pageSize=1');
  if ((existingT.total ?? 0) > 0) ok(`testimonials already exist (${existingT.total})`);
  else {
    let n = 0;
    for (const t of DEMO_TESTIMONIALS as any[]) {
      try {
        const form = new FormData();
        form.append('authorName', t.authorName ?? t.name ?? 'A friend');
        form.append('relationship', t.relationship ?? 'Friend');
        form.append('message', t.message ?? t.body ?? '');
        const res = await fetch(`${BASE}/api/testimonials`, { method: 'POST', body: form });
        if (res.ok) n++;
      } catch { /* keep going */ }
    }
    ok(`testimonials submitted (${n})`);
  }

  // A tribute only appears publicly when it is BOTH approved and public, and those are
  // two separate bulk actions (the enum is upper-case). Run every time, so a re-run also
  // repairs tributes that were approved but never published.
  const all = await api('GET', '/admin/testimonials?pageSize=100');
  const ids = (all.items ?? []).map((t: any) => t.id);
  if (ids.length) {
    for (const action of ['APPROVE', 'PUBLISH'] as const) {
      await api('POST', '/admin/testimonials/bulk', { ids, action })
        .catch((err) => warn(`bulk ${action}: ${(err as Error).message.slice(0, 140)}`));
    }
    const pub = await api('GET', '/testimonials/public?page=1&pageSize=1');
    ok(`tributes: ${ids.length} total, ${pub.total} visible publicly`);
  }

  console.log('\nDone.\n');
}

main().catch((err) => { console.error('\nFAILED:', err.message); process.exit(1); });
