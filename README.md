# 70th Birthday Celebration Platform

A website for a 70th birthday celebration, with an admin dashboard to run it.

Guests can:

- read the celebrant's story, timeline and family tree, and browse photo albums
- RSVP, and get a digital invitation with a personal QR code
- leave a birthday message: optionally as part of their RSVP, or on the tributes page with an optional photo. Both are saved to the same testimonials list and reviewed before anything appears publicly
- scan a QR code at the party and upload their own photos

The family and event staff can:

- edit every piece of content from the admin dashboard (nothing is hard-coded)
- approve or reject guest photos and messages, and choose which messages appear publicly
- manage guests, invitations and the event capacity
- check guests in at the door by scanning their QR codes on a phone
- see storage use against a quota, and an audit log of sensitive actions

The repository ships with fictional demo content so you can see everything working.

---

## Contents

1. [How it is built](#how-it-is-built)
2. [Quick start](#quick-start)
3. [Environment variables](#environment-variables)
4. [Database, migrations and seed data](#database-migrations-and-seed-data)
5. [Running the apps](#running-the-apps)
6. [Tests](#tests)
7. [Docker](#docker)
8. [Storage (Azure Blob Storage)](#storage-azure-blob-storage)
9. [Admin accounts and roles](#admin-accounts-and-roles)
10. [Guests, invitations and capacity](#guests-invitations-and-capacity)
11. [QR codes: invitations, check-in and photo uploads](#qr-codes-invitations-check-in-and-photo-uploads)
12. [Storage quota](#storage-quota)
13. [SEO](#seo)
14. [Security](#security)
15. [Deployment](#deployment)
16. [Troubleshooting](#troubleshooting)

---

## How it is built

```
birthday-platform/
├── apps/
│   ├── api/        NestJS API (TypeScript), Prisma, PostgreSQL, Azure Blob Storage
│   └── web/        Vite + React + TypeScript site and admin dashboard
├── packages/
│   └── types/      The API contract: request and response types shared by both apps
├── e2e/            Playwright browser tests
├── docs/           API route list, deployment guide, design decisions
├── docker/         Database init script
└── docker-compose.yml
```

| Part | Technology |
|---|---|
| Front end | Vite 8, React 19, TypeScript, React Router 7, Tailwind CSS 4, Radix UI (the primitives behind shadcn/ui), Motion, TanStack Query, React Hook Form, Zod, Lucide icons |
| API | NestJS 11, TypeScript, class-validator DTOs, Swagger at `/api/docs` |
| Database | PostgreSQL 17 with Prisma 7 (migrations in `apps/api/prisma/migrations`) |
| Files | Azure Blob Storage. Locally, Azurite (Microsoft's official emulator) |
| Email | Any SMTP server. Locally, Mailpit catches every email |
| Tests | Jest and Supertest (API), Vitest and React Testing Library (web), Playwright (browser) |

**How a request flows.** The browser talks only to the web server. The web server sends everything under `/api` to the API, so the site and the API share one address and login cookies work simply. The API stores data in PostgreSQL and files in a private Azure Blob Storage container. Files are never served straight from storage. The API streams them after checking that the viewer may see them.

The API contract lives in `packages/types/index.d.ts`, and every route is listed in [docs/api-routes.md](docs/api-routes.md). Design decisions and their reasons are in [docs/architecture.md](docs/architecture.md).

---

## Quick start

You need **Node.js 22 or later** (24 recommended), **npm 10+** and **Docker**.

```bash
npm install
```

```bash
cp .env.example apps/api/.env
```

```bash
npm run infra:up
```

That starts PostgreSQL (port 5437), Azurite (port 10100) and Mailpit (web inbox on http://localhost:8125).

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open:

| What | Address |
|---|---|
| Public site | http://localhost:5173 |
| Admin dashboard | http://localhost:5173/admin |
| API documentation | http://localhost:4100/api/docs |
| Emails sent by the app | http://localhost:8125 |

Demo logins (password `Celebrate70!Demo` for all three). These exist only when you seed with `SEED_DEMO=true`:

| Email | Role |
|---|---|
| `superadmin@demo.local` | Super admin: everything, including user accounts |
| `admin@demo.local` | Admin: everything except user accounts |
| `staff@demo.local` | Check-in staff: the check-in screen only |

---

## Environment variables

The API reads `apps/api/.env`. Every variable is listed, with comments, in [`.env.example`](.env.example). The API checks them all when it starts. If anything is missing or unsafe, it stops and prints the full list of problems.

The important ones:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | Database for the API tests. Its name must end in `_test` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Two different random strings of 32+ characters. Generate with `openssl rand -base64 48` |
| `AZURE_STORAGE_CONNECTION_STRING` | Connection string for the storage account (the Azurite development string locally) |
| `AZURE_STORAGE_CONTAINER` | Private container for photos and videos. Created automatically in development |
| `PUBLIC_WEB_URL` | The public address of the site. Used in emails, QR codes, canonical links and the sitemap |
| `CORS_ORIGIN` | Browser origins allowed to call the API (comma-separated) |
| `COOKIE_SECURE` | `true` in production (needs HTTPS) |
| `MAX_STORAGE_BYTES`, `MAX_PHOTO_SIZE`, `MAX_VIDEO_SIZE` | Starting values for the storage quota and file size limits. Admins change them later in Settings |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Email. Leave `SMTP_HOST` empty to log emails instead of sending them |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO` | Used by the seed script (see below) |

The web app needs no variables in development. For production builds, `VITE_SITE_URL` sets the site address used in canonical links, and `VITE_API_URL` is only needed if the API is on a different origin.

In production the API refuses to start if the secrets still have their example values or `docker-compose.yml`'s local fallbacks, if `COOKIE_SECURE` is not `true`, if `CORS_ORIGIN` is `*`, or if the storage connection string points at the local emulator.

---

## Database, migrations and seed data

| Command | What it does |
|---|---|
| `npm run db:migrate` | Applies migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev -w apps/api` | Creates a new migration after you change `schema.prisma` |
| `npm run db:seed` | Creates the first admin and, with `SEED_DEMO=true`, the demo content |
| `npm run db:seed:fresh -w apps/api` | Deletes all content and stored files, then seeds again (refused in production) |
| `npm run db:reset` | Drops and recreates the database (development only) |

**Seeding.** The seed is safe to run more than once. It never overwrites existing content.

- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` create the first super admin. Use this in production.
- `SEED_DEMO=true` adds the demo content: a fictional celebrant (Dr. Margaret Adaeze Okonkwo), an event, a programme, six albums with generated artwork, a timeline, a family tree, 18 guests, testimonials in every moderation state, guest photos waiting for review, and the three demo logins.
- The site shows a small "Demo content" label while demo data is loaded. The label comes from a flag in Settings.

All demo images are generated abstract artwork: no real people, no text. Demo photos go through the same upload pipeline as real ones, so the previews, storage accounting and blob storage are exercised too.

The migration adds database-level rules that Prisma cannot express. For example: at most one active check-in per invitation, only approved testimonials can be public, and single-row tables stay single.

---

## Running the apps

| Command | What it does |
|---|---|
| `npm run dev` | API (watch mode, port 4100) and web dev server (port 5173) together |
| `npm run dev:api` / `npm run dev:web` | One at a time |
| `npm run build` | Production build of both apps |
| `npm run typecheck` | TypeScript checks for both apps |

The Vite dev server forwards `/api` and `/sitemap.xml` to the API, like the production web server does.

---

## Tests

| Command | What runs | Needs |
|---|---|---|
| `npm run test:unit -w apps/api` | API unit tests: file-type detection, moderation rules, RSVP answers, QR parsing, quota levels, passwords, config | nothing |
| `npm run test:e2e -w apps/api` | API tests over HTTP against a real test database and Azurite: login, lockout, CSRF, refresh-token reuse, roles, RSVP limits, capacity under concurrent RSVPs, duplicate check-ins from two phones at once, uploads, damaged and disguised files, quota under concurrent uploads, testimonial visibility | `npm run infra:up` |
| `npm run test -w apps/web` | Web component and form tests (Vitest) | nothing |
| `npm run test:e2e` | Playwright tests in a real browser: RSVP to digital invitation, birthday message, guest photo upload to moderation queue, admin login, staff check-in, mobile layout | infra up, database migrated and seeded with demo data |

For Playwright, either install its browser with `npx playwright install chromium`, or use your installed Chrome with `PW_CHANNEL=chrome npm run test:e2e`. It starts the API and web server if they are not already running (build the API first with `npm run build -w apps/api`).

The login and RSVP endpoints are rate limited. Running the browser tests many times in a row can hit those limits; wait a minute, or restart the API to clear its counters.

---

## Docker

`docker-compose.yml` has two uses.

**Infrastructure only** (for local development):

```bash
docker compose up -d postgres azurite mailpit
```

**The whole platform** (PostgreSQL, Azurite, Mailpit, migrations, API and web server):

```bash
docker compose --profile app up -d --build
```

Then load demo data once:

```bash
docker compose --profile seed run --rm seed
```

The site is then on http://localhost:8080. This stack runs in development mode with local-only secrets and Azurite, so you can try everything on one machine; for a real deployment follow [docs/deployment.md](docs/deployment.md). A one-off `migrate` container applies migrations before the API starts. The API image runs as a non-root user. The web image contains only the built site and the small Node server in `apps/web/server/index.mjs`.

Ports on your machine (change them with the `*_HOST_PORT` variables): PostgreSQL 5437, Azurite 10100, Mailpit 8125 (inbox) and 1125 (SMTP), web 8080.

---

## Storage (Azure Blob Storage)

Photos and videos are stored in one private blob container. The database stores only metadata: file name, type, size, dimensions, storage key, album and moderation status.

- **Locally**, Azurite emulates Blob Storage. The connection string in `.env.example` is Azurite's public development key, not a secret. The API creates the container on first start.
- **In production**, create a storage account and a container with **no public access**. Put the account's connection string in `AZURE_STORAGE_CONNECTION_STRING` and the container name in `AZURE_STORAGE_CONTAINER`.

What happens to every uploaded photo:

1. The file streams to a temporary folder. Upload size limits come from the live Settings, so an oversized file is cut off mid-upload.
2. The server checks the file's first bytes to learn its real type. The browser's claimed type and the file name are not trusted. Allowed: JPEG, PNG, WebP, GIF and AVIF photos; MP4, MOV and WebM videos. SVG, HTML and HEIC are refused.
3. For photos, the server checks the dimensions and makes three copies: the full-size original with location data (EXIF/GPS) removed, a 1600px web copy and a 400px thumbnail.
4. The files are written to Blob Storage. Then, under a database lock, the server checks the quota and records the upload. If the quota check fails, the stored files are deleted again.
5. Guest uploads start as **Pending**. Only **Approved** media are visible to the public.

Videos are stored as uploaded. The server does not transcode them or make preview images.

---

## Admin accounts and roles

| Role | Can do |
|---|---|
| **SUPER_ADMIN** | Everything, including creating and editing admin accounts |
| **ADMIN** | Content, media, testimonials, guests, invitations, event, programme, settings, storage, audit log, check-in and reversing check-ins |
| **CHECK_IN_STAFF** | Sign in, scan QR codes, check guests in and see the details door staff need: name, party size, companions, dietary and accessibility notes. No email addresses, phone numbers or admin notes |

The API enforces every rule. Hiding a menu item in the browser is only for convenience.

**First admin in production.** Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (12+ characters), run the seed once, sign in, then remove those two variables. Create other accounts in **Admin → Users**.

**Sessions.** Signing in sets an access cookie (15 minutes) and a refresh cookie (7 days). Both are `httpOnly`, so page scripts cannot read them. Each refresh swaps the refresh token for a new one. If an old refresh token is used again, every session from that login ends, because that suggests the cookie was stolen. Changing a password, a role or disabling a user ends that user's sessions.

**Lockout.** Five wrong passwords lock an account for 15 minutes. The login endpoint also allows only 10 attempts per minute from one IP address.

**Password reset.** "Forgot password" emails a one-time link that expires after an hour.

---

## Guests, invitations and capacity

**How a guest gets an invitation.** Every invitation has a personal link and QR code. It is created in one of two ways:

1. **The guest RSVPs on the website** and says they are attending. The invitation is created at once, shown on screen, and emailed to them.
2. **An admin adds the guest** in **Admin → Guests**. The invitation is created straight away. It is emailed if "Send invitation now" is ticked; otherwise it waits.

Admins can send or re-send invitations at any time: one at a time from a guest's details, or in bulk from **Admin → Invitations** ("Send to selected" or "Send to everyone not yet sent"). Guests who declined and revoked invitations are skipped.

**Capacity.** The event has one total capacity (Event page). You can also set aside places for each guest category, for example Family 90, Friends 60, Colleagues 40. When a category's places are taken, new RSVPs choosing that category are refused with a clear message, and the RSVP form marks the category as full. Places not set aside stay open to everyone else. The categories together can never hold more than the event capacity, and a category's places can never be set below the guests already confirmed in it.

**Private albums.** An album can be public (shown in the gallery) or private (only admins can see it). Photos in a private album cannot be opened from the public site, even with a direct link.

**Branding** (Settings → Branding) changes how the public site looks without code: the primary colour (dark backgrounds such as the header, hero and footer), the accent colour (gold buttons, highlights and the "70"), the logo, the large home-page photo, the image shown when the link is shared on WhatsApp or social media, and the site title and description used in browser tabs and search results. Each colour has a "Reset to default" button.

---

## QR codes: invitations, check-in and photo uploads

There are two kinds of QR code.

**1. Invitation QR codes (one per guest).** When a guest confirms they are attending, they get an invitation with:

- a human-readable code such as `BP70-7K3Q9D`, printed on the pass
- a random 256-bit token. The QR code encodes the invitation link, which contains only this token. No name, email or other personal data is in the code.

The digital invitation is at `/invitation/<token>`. Guests can download it as a PDF or print it.

**Check-in at the door** (`/admin/check-in`, works well on a phone):

1. Staff sign in and scan the guest's QR code with the phone camera. If the camera does not work, they can type the invitation code or search by name.
2. The API checks the invitation and replies with one of: **Valid**, **Already checked in** (with the time and the staff member), **Revoked**, **Expired**, **Not attending** or **Invalid**.
3. Staff press **Check in**. They can admit fewer people than the full party if some have not arrived yet.

A guest can be checked in only once. The database enforces this with a unique index, so two staff scanning the same code at the same moment still produce one check-in. An admin can reverse a check-in, with a reason, which allows checking in again. Every check-in records the staff member, the time and the device.

**2. The photo-upload QR code (one per event).** In **Admin → Settings → Guest upload QR** you can view, download (PNG or SVG), print (an A4 poster PDF) or regenerate the code. It links to `/memories/upload/<token>`. That page lets guests pick photos, add an optional name and message, and upload. The token only allows uploading; it gives no other access. Regenerating it makes printed posters stop working.

QR codes are plain black on white with a wide margin, so they scan reliably in dim light.

**What guests see after scanning the photo QR code.** The page works like a small party camera on their own phone:

- **Open camera:** a camera inside the page with a Photo / Video switch, front/back flip and flash where the phone allows it. Guests can take shot after shot.
- **Use my phone's camera app:** opens the phone's real Camera app for full quality (best on iPhone), then brings the shot back to the page.
- **Choose from my photos:** pick photos and videos already on the phone.
- Everything lands in **My shots**, which is stored on the guest's phone in the browser, so it survives a refresh. **Nothing is sent until the guest ticks shots and taps "Share selected".** They can delete shots they don't want, and only ticked shots are uploaded.
- **Save to my phone:** a web page cannot write into the Photos app by itself. The page offers the phone's share sheet ("Save Images" on iPhone) for the selected shots, and on Android a "Keep a copy on this phone" switch downloads each new shot automatically. The page also suggests the simplest way to keep everything: use the normal Camera app, then "Choose from my photos".

**Trying the camera on a real phone during development.** Browsers only allow the camera over HTTPS (or on the computer itself via `localhost`). To test on a phone on the same Wi-Fi:

```bash
./scripts/dev-cert.sh
```

```bash
DEV_HTTPS=1 npm run dev:web
```

Open the `https://<your-computer-ip>:<port>` address Vite prints on the phone and accept the certificate warning (it is a development certificate the script just made). The live site uses a real HTTPS certificate, so guests see no warning.

---

## Storage quota

- The default quota is **10 GB**. Admins can choose 5, 10, 25 or 50 GB in **Settings → Uploads**.
- Usage counts every stored byte: originals plus the generated web copies and thumbnails. It is always calculated from the files actually stored, never from sizes the browser reports.
- The dashboard and **Admin → Storage** show used and remaining space, photo and video counts, the largest files, and a breakdown by source and status.
- At **80%** the storage page shows a warning; at **95%** a critical warning. At **100%** new uploads are refused with the error `STORAGE_QUOTA_EXCEEDED`, and the guest upload page says uploads are closed.
- Separate size limits apply to photos (default 10 MB) and videos (default 100 MB). Video uploads can be switched off.
- Guests can upload at most `GUEST_UPLOAD_FILES_PER_HOUR` files (default 60) per hour from one IP address.

Deleting rejected or unwanted media frees space immediately.

---

## SEO

The site is a single-page React app, but search engines and link previews still get proper metadata.

- **In the browser**, every page sets its own title, description, canonical link, Open Graph and Twitter tags, and JSON-LD structured data (Event, Person, ImageGallery). This uses React 19's built-in `<title>` and `<meta>` support.
- **For crawlers that do not run JavaScript** (most link-preview bots), the production web server (`apps/web/server/index.mjs`) asks the API for that page's metadata (`GET /api/seo?path=…`) and writes it into the HTML before sending the page. Unknown pages return a real 404.
- `/sitemap.xml` is generated by the API from the published pages and albums.
- `/robots.txt` allows the public pages and blocks `/admin`, `/invitation/`, `/memories/upload/` and `/api/`. Invitation and upload pages are also marked `noindex`.
- Icons, an Apple touch icon, a web manifest and a default social-sharing image are in `apps/web/public`.

**Limitation.** Page content (not metadata) is still drawn by JavaScript. Google renders JavaScript and indexes it; some other search engines may see less. If you host the built files on a static host (not the included web server), crawlers get only the default tags in `index.html`. The deployment guide explains how to keep per-page metadata on each host.

---

## Security

- Passwords are hashed with Argon2id; plaintext passwords are never stored or logged.
- Sessions use `httpOnly`, `SameSite=Lax` cookies (`Secure` in production). Every state-changing request must also send a CSRF token that matches a readable cookie.
- Every admin route checks, in order: signed in, account active, role permission. Some actions add record-level rules; for example, nobody can delete or demote their own account, and the last super admin cannot be removed.
- All input goes through strict DTO validation. Unknown fields are rejected, text is trimmed and control characters are removed.
- Database access goes through Prisma with parameterised queries.
- Helmet sets security headers. The web server sends a Content-Security-Policy. CORS allows only configured origins.
- Rate limits cover login, password reset, RSVP, testimonials and uploads.
- Uploads are checked by content, size, dimensions, count and quota. Files go to a private container and are streamed back only after a permission check.
- Guest IP addresses are stored only as keyed hashes (for rate limiting).
- Public responses never include guest emails, phone numbers, RSVP details, invitation tokens of other guests, admin information or storage keys.
- Errors return a consistent `{ success: false, statusCode, code, message, details?, requestId }` body. Stack traces are never sent.
- Sensitive admin actions are written to the audit log: who, what, which record, when and from which IP.
- `npm audit` reports four high-severity findings, all inside the Prisma CLI's own dependencies (`mysql2`, `deepmerge-ts`). This app never connects to MySQL and never merges untrusted config, so they cannot be reached. They clear when Prisma updates those packages; `npm audit fix --force` would downgrade Prisma and is not recommended.

---

## Deployment

This section is the short path to a live site. [docs/deployment.md](docs/deployment.md) has the details for each provider.

### What you need

- **A domain with HTTPS.** Login cookies and the check-in camera need HTTPS.
- **PostgreSQL 14 or newer.** For example Azure Database for PostgreSQL, Neon, Supabase or Railway.
- **An Azure Storage account** with a **private** container for photos and videos.
- **An SMTP account** for email. For example SendGrid, Mailgun, Postmark or Amazon SES.
- **Somewhere to run two containers**: the API and the web server. For example Azure Container Apps, Railway, Render or Fly.io.

### Steps

**1. Create the database and the storage container.** Copy the database connection string and the storage connection string. Set the container's access level to **Private**.

**2. Generate two secrets.** Run this twice and keep both values:

```bash
openssl rand -base64 48
```

**3. Build the two images** from the repository root:

```bash
docker build -f apps/api/Dockerfile -t birthday-api .
docker build -f apps/web/Dockerfile --build-arg VITE_SITE_URL=https://your-domain -t birthday-web .
```

**4. Set the API's environment variables.** These are the ones every deployment needs. [`.env.example`](.env.example) lists the rest.

```
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<first secret from step 2>
JWT_REFRESH_SECRET=<second secret from step 2>
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER=birthday-media
PUBLIC_WEB_URL=https://your-domain
CORS_ORIGIN=https://your-domain
COOKIE_SECURE=true
TRUST_PROXY=1
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM="Margaret's 70th <celebration@your-domain>"
```

Keep these in your host's secret settings, never in the repository.

**5. Apply the database migrations.** Run this once with the API image and the same variables, and again after every update:

```bash
npx prisma migrate deploy
```

**6. Create the first admin.** Add `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` to the API's variables and run this once with the API image:

```bash
node dist/seed/run-seed.js
```

Then remove both variables. Do not set `SEED_DEMO=true` on a live site: the demo password is public in this repository, so the seed refuses it in production.

**7. Start the API.** It listens on port 4100. Use `GET /api/health/ready` as the health check.

**8. Start the web server** with these variables:

```
PORT=8080
API_ORIGIN=http://<where the web server can reach the API>:4100
PUBLIC_WEB_URL=https://your-domain
SNAPSHOT_DIR=/var/lib/birthday-web
```

The web server forwards `/api` to the API, so visitors only ever use your domain. `SNAPSHOT_DIR` keeps a saved copy of the public pages for when the API is down. Put it on a persistent volume if your host offers one.

**9. Point your domain at the web server** and turn on HTTPS. Only the web server needs to be public. The API can stay private.

**10. Check it works.**

- Open `https://your-domain/api/health/ready`. It should show `{"status":"ok","database":"up","storage":"up"}`.
- Sign in at `https://your-domain/admin/login`. Fill in the event, the celebrant and the content, and set the storage quota in Settings.
- Send yourself an RSVP. Check that the confirmation email arrives and the invitation's QR code opens.
- Upload a photo from the guest upload page, then approve it in the admin.

### Safety checks

The API refuses to start in production if:

- either JWT secret is the example value, the Docker fallback, or shorter than 32 characters
- both JWT secrets are the same
- `COOKIE_SECURE` is not `true`, or `CORS_ORIGIN` is `*`
- the storage connection string points at the local emulator (Azurite)

It prints every problem at once, so you can fix them in one go.

### Updating the site

1. Pull the latest code and build both images again.
2. Run `npx prisma migrate deploy` with the new API image **before** starting the new API.
3. Restart the API, then the web server.

Visitors who have the site open see "A new version of the site is ready". They move to the new version on their next page change. If you put a CDN in front of the site, make sure it does not cache `/version.json`.

### Backups

Turn on your database provider's automatic backups. On the storage account, turn on **soft delete for blobs**, so a deleted photo can be recovered.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| API stops at start with "Invalid configuration" | It lists every missing or unsafe variable. Compare `apps/api/.env` with `.env.example` |
| `Can't reach database server` | Run `npm run infra:up`, and check `DATABASE_URL` uses port 5437 |
| Uploads fail with storage errors | Check Azurite is running (`docker compose ps`) and the connection string's `BlobEndpoint` port matches (10100 locally) |
| Nothing arrives by email | Open Mailpit at http://localhost:8125. In production check the `SMTP_*` variables; the API logs a line for each failed email |
| "Your session security token is missing" | The CSRF cookie is missing. Reload the page, or sign in again |
| Login says "Too many requests" | The login rate limit (10 per minute per IP). Wait a minute |
| Account locked | Wait 15 minutes, or have a super admin unlock it in Admin → Users |
| The phone camera does not open on the check-in page | Browsers allow the camera only over HTTPS (or on `localhost`). Use the "Enter code" or "Find by name" tabs meanwhile |
| Guests cannot open the upload QR link | The token may have been regenerated. Print the new QR from Settings |
| The seed says "Content already exists" | It never overwrites content. Use `npm run db:seed:fresh -w apps/api` in development |
| `prisma` errors about the client | Run `npm run prisma:generate -w apps/api` |
| Port already in use | Change the `*_HOST_PORT` variables for Docker, or `PORT` for the API |
