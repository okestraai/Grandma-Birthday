# Deployment

The platform has three parts to host:

1. **The API** (`apps/api`): a Node.js server, shipped as a Docker image.
2. **The web site** (`apps/web`): static files plus a small Node server that adds SEO tags and forwards `/api` to the API.
3. **Data**: a PostgreSQL database and an Azure Blob Storage container.

Nothing in the code is tied to one provider. Everything is set through environment variables (see `.env.example`).

---

## Recommended setup

```
Browser ──► web server (apps/web/server/index.mjs)  ──/api──►  API  ──► PostgreSQL
                     │                                          └──► Azure Blob Storage
                     └── serves the built site, adds per-page SEO tags
```

Put the web server and the API behind the same domain (for example `celebration.example.com`). The web server forwards `/api/*` to the API, so the browser only ever talks to one origin. This keeps login cookies simple and makes CORS unnecessary for the site itself.

### Checklist before going live

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET`: two different random values (`openssl rand -base64 48`)
- [ ] `PUBLIC_WEB_URL=https://your-domain` and `CORS_ORIGIN=https://your-domain`
- [ ] `COOKIE_SECURE=true` (the site must be served over HTTPS)
- [ ] `TRUST_PROXY` set to the number of proxies in front of the API (usually `1`), so rate limits see real client IPs
- [ ] `AZURE_STORAGE_CONNECTION_STRING` for your storage account, and a **private** container
- [ ] SMTP settings for real email
- [ ] Run migrations: `npx prisma migrate deploy` (the `migrate` service in docker-compose does this)
- [ ] Create the first admin: set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`, run the seed once with `SEED_DEMO=false`, then remove both variables
- [ ] Sign in, fill in the event, celebrant and content, and set the storage quota

The API refuses to start if the secrets are the example values, `COOKIE_SECURE` is not `true`, `CORS_ORIGIN` is `*`, or storage points at the local emulator.

---

## Storage: Azure Blob Storage

1. In the Azure portal, create a **Storage account** (Standard, LRS is enough).
2. Under **Data storage → Containers**, create a container, for example `birthday-media`. Set **Anonymous access level** to **Private**.
3. Under **Security + networking → Access keys**, copy a **Connection string**.
4. Set:
   ```
   AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
   AZURE_STORAGE_CONTAINER=birthday-media
   ```

Visitors never get storage URLs. The API streams each file after checking that it is approved (or that the viewer is an admin), and sets caching headers. To take load off the API for a very large gallery, you can put Azure Front Door or another CDN in front of the site; `/api/media/...` responses for approved media are marked cacheable for an hour.

Storage costs are small at this scale. At the default 10 GB quota, storage is well under US$1 a month; data transfer depends on how many people view the gallery.

---

## Database

Any PostgreSQL 14+ works. Set `DATABASE_URL`, then run `npx prisma migrate deploy` from `apps/api` (or let the Docker `migrate` service do it).

| Provider | Notes |
|---|---|
| **Azure Database for PostgreSQL (Flexible Server)** | Natural fit alongside Blob Storage. Add `?sslmode=require` to the URL |
| **Neon** | Use the pooled connection string for the API and the direct one for migrations |
| **Supabase** | Use the session-mode connection string (port 5432) |
| **Railway PostgreSQL** | Copy `DATABASE_URL` from the service variables |
| **AWS RDS** | Allow the API's network to reach port 5432; enable SSL |

The API uses transaction-scoped advisory locks for the capacity and quota checks, and a partial unique index for check-ins. Both work on all of the above, including through connection poolers.

---

## API

The API image is built from the repository root:

```bash
docker build -f apps/api/Dockerfile -t birthday-api .
```

It listens on `PORT` (default 4100), runs as a non-root user and exposes `GET /api/health` (database) and `GET /api/health/ready` (database and storage) for health checks.

| Host | How |
|---|---|
| **Azure Container Apps** | Push the image to Azure Container Registry, create a Container App with ingress on port 4100, add the environment variables as secrets. Run migrations as a Container Apps job with command `npx prisma migrate deploy` |
| **Azure App Service (containers)** | Same image. Set `WEBSITES_PORT=4100` |
| **Railway / Render** | Deploy from the Dockerfile (`apps/api/Dockerfile`, build context = repo root). Add a pre-deploy command `npx prisma migrate deploy` |
| **Fly.io** | `fly launch --dockerfile apps/api/Dockerfile`, set `internal_port = 4100`, add a `release_command = "npx prisma migrate deploy"` |
| **AWS (ECS/Fargate or App Runner)** | Push to ECR, run on port 4100, run migrations as a one-off task |
| **Any Docker host** | `docker compose --profile app up -d` runs everything, including PostgreSQL, Azurite and the web server. Replace Azurite with a real storage account in production |

**More than one API instance.** Rate-limit counters are kept in memory, per instance. That is fine for one instance. If you run several, each keeps its own counters, so limits become per instance; put a shared store (for example Redis with `@nestjs/throttler`'s storage option) in front if that matters to you. Everything else (sessions, locks, quota) is already shared through the database.

**Upload size.** Uploads stream to a temporary folder before processing. Make sure your platform's request size limit allows your largest video (default 100 MB) and that the container has that much temporary disk.

---

## Web site

Build from the repository root:

```bash
docker build -f apps/web/Dockerfile --build-arg VITE_SITE_URL=https://your-domain -t birthday-web .
```

### Option 1 (recommended): the included web server

Run the image (or `node apps/web/server/index.mjs` after `npm run build -w apps/web`) with:

```
PORT=8080
API_ORIGIN=http://your-api:4100      # where the API is reachable from the web server
PUBLIC_WEB_URL=https://your-domain
SNAPSHOT_DIR=/var/lib/birthday-web   # optional, see "When the API is down" below
```

It serves the built files with long-lived caching for hashed assets, sends security headers (including a Content-Security-Policy), forwards `/api/*` and `/sitemap.xml` to the API, and injects per-page SEO tags into every page. Host it anywhere that runs a container or Node: Azure Container Apps, App Service, Railway, Render, Fly.io, AWS.

**When the API is down.** The web server keeps a copy of the public data: the celebrant, event, story, family, albums, programme and the first tributes. It refreshes the copy every minute and saves it to a file in `SNAPSHOT_DIR` (default: a folder in the system temp directory), so it survives a restart. Public pages include this copy, so guests still see the celebration, with a small notice that it is the last saved version. Nothing from admin, personal invitation or upload links is saved. If the API does not answer, `/api/*` requests get a 502 or 503 within 5 seconds instead of hanging. Put `SNAPSHOT_DIR` on a persistent volume if you want the copy to survive a redeploy too.

### Option 2: static hosting (Vercel, Netlify, Cloudflare Pages, Azure Static Web Apps)

Build with `npm run build -w apps/web` and publish `apps/web/dist`. Configure two things on the host:

1. **Rewrites**: `/api/*` and `/sitemap.xml` go to the API, and every other path falls back to `/index.html`.
2. **Cookies**: if the API is on a different subdomain (for example `api.your-domain`), set `VITE_API_URL=https://api.your-domain` at build time, `CORS_ORIGIN=https://your-domain` and `COOKIE_DOMAIN=.your-domain` on the API. Keeping both on the same domain through rewrites is simpler.

Examples:

**Vercel** (`vercel.json` in `apps/web`):

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://api.your-domain/api/:path*" },
    { "source": "/sitemap.xml", "destination": "https://api.your-domain/api/sitemap.xml" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Netlify** (`apps/web/public/_redirects`):

```
/api/*        https://api.your-domain/api/:splat   200
/sitemap.xml  https://api.your-domain/api/sitemap.xml  200
/*            /index.html   200
```

**Cloudflare Pages**: add the same rules in a `_redirects` file for the SPA fallback, and a Pages Function or Worker route that forwards `/api/*` to the API.

**What you lose with static hosting.** Crawlers that do not run JavaScript (most link previews: WhatsApp, Facebook, Slack, X) see only the default tags in `index.html`, not per-page titles and images. To keep per-page tags, run the logic from `apps/web/server/index.mjs` in the host's edge functions (Vercel Edge Middleware, Netlify Edge Functions, Cloudflare Pages Functions): fetch `GET /api/seo?path=<path>` and replace the block between `<!--seo-start-->` and `<!--seo-end-->` in `index.html`. Also replace `__SITE_URL__` in `robots.txt` with your domain.

### New versions

Each build writes `dist/version.json`. It holds the build's id and the time it was built. The id changes only when the site's code changes. The same id is written into `index.html`.

Open pages check `/version.json` about every five minutes, and when the tab is shown again. When the id on the server differs from the page's own id, the page shows a small notice: "A new version of the site is ready", with **Refresh** and **Later**. Nobody is reloaded while they stay on a page. The next time they move to another page, the browser loads that page fresh, on the new version. The party camera page never reloads by itself, and hides the notice while photos are sending.

`/version.json` must never be cached. The included web server sends it with `Cache-Control: no-store`. If a CDN or proxy sits in front of the site, set a rule so it does not cache `/version.json`. With static hosting, add the same header for that path. If it is cached, visitors will not hear about new versions until the cache expires.

If a visitor's page asks for code that the new deploy removed, the page reloads once by itself. If that does not help, it shows "This page has been updated" with a Refresh button.

### HTTPS and the check-in camera

Browsers only allow camera access over HTTPS (or on `localhost`). The check-in page needs HTTPS in production to scan QR codes. Staff can always type the invitation code or search by name instead.

---

## Email

Any SMTP provider works: Azure Communication Services (SMTP), SendGrid, Mailgun, Postmark, Amazon SES, or a mailbox provider's SMTP.

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false          # true for port 465
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM="Margaret's 70th <celebration@your-domain>"
ADMIN_NOTIFY_EMAIL=family@your-domain   # optional: new testimonials and guest uploads
```

Emails sent: RSVP confirmation with the digital invitation link, invitations sent or re-sent by admins, password resets, a thank-you for birthday messages (when the guest gave an email), and optional admin notifications. If email fails, the action still succeeds and the API logs the failure.

---

## Environments

| | development | test | production |
|---|---|---|---|
| Logs | readable text | errors only | JSON lines |
| Cookies | `Secure` off | off | `Secure` required |
| Storage container | created automatically | `birthday-test`, created by the test setup | must already exist |
| Placeholder event/settings rows | created on first start | created by tests | created on first start |
| `--fresh` seed | allowed | allowed | refused |
| Swagger at `/api/docs` | on | on | on (remove the `SwaggerModule.setup` call in `app.setup.ts` if you prefer it off) |

---

## Backups

- **Database**: use your provider's automated backups (all providers above offer point-in-time restore).
- **Files**: enable **soft delete for blobs** and optionally **versioning** on the storage account, so a deleted photo can be recovered for a set number of days.
