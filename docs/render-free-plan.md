# UAT environment on Render (free plan)

[`render.yaml`](../render.yaml) deploys a **temporary user-acceptance-testing environment** on
Render's free plans. It is not the production deployment — see [deployment.md](deployment.md) for
that. It is tuned so testers see what production will do, and traded against how long it can run.

Everything described here was verified against this repository: the images build, the start command
migrates and seeds, and the web server serves and proxies as described.

---

## What it deploys

```
Browser ──► birthday-web   (free web service, Docker: apps/web/server/index.mjs)
                 │
                 └── proxies /api/* ──► birthday-api   (free web service, Docker)
                                             ├──► birthday-db   (free Postgres)
                                             └──► Azure Blob Storage   (not Render)
```

These are the **same two images production would run**. That is the point: UAT then covers the real
per-page SEO tags, the security headers and CSP, `/api` proxying on one origin, the new-version
notice, and the API-down snapshot page — not approximations of them. Because the web server proxies
`/api`, the browser sees a single origin, so login cookies stay same-origin with no CORS or
`COOKIE_DOMAIN` configuration.

---

## The one limit that will bite you

Free web services share **750 instance hours per calendar month, per workspace**, and this blueprint
runs **two** of them.

| How you run it | Burn rate | Pool lasts |
|---|---|---|
| Both services up continuously | 48 service-hours/day | **~15 days**, then every free service in the workspace is suspended until the 1st |
| Spun down when idle (stops after 15 min without traffic, consumes nothing while down) | ~16–24 service-hours/day | **roughly a month** of office-hours testing |

Do not add a third free web service, and do not run a keep-warm pinger against both — that
guarantees the continuous-burn row above.

**If UAT must outlast that**, serve the front end as a Render **static site** instead. Static sites
consume no instance hours at all, leaving the whole 750-hour pool for the API. The cost is per-page
SEO tags: a static host serves the same default `<title>` and image to every crawler, so WhatsApp,
Facebook and Slack link previews lose per-page titles. That variant needs:

- `runtime: static`, `staticPublishPath: ./apps/web/dist`
- `buildCommand: npm ci --workspace apps/web --include-workspace-root && npm run build -w apps/web && sh ./scripts/render-static-postbuild.sh`
- rewrite rules sending `/api/*` and `/sitemap.xml` to the API's public URL, and `/*` to `/index.html`
- the security headers from `apps/web/server/index.mjs` re-declared as `headers:` entries

[`scripts/render-static-postbuild.sh`](../scripts/render-static-postbuild.sh) exists for exactly
that case. The Node web server replaces `__SITE_URL__` in `robots.txt` as it serves the file; a
static host does not, so without that script the `Sitemap:` line ships literally as
`__SITE_URL__/sitemap.xml` and no crawler follows it.

---

## Before you deploy

Render does not replace these, on any plan:

- **An Azure Storage account** with a **private** container. The code uses `@azure/storage-blob`
  directly. [deployment.md](deployment.md#storage-azure-blob-storage) has the portal steps. For UAT,
  use a separate container (or a separate account) from production so test uploads never mix with
  real guest photos.
- **An SMTP provider.** For UAT you may prefer to leave `SMTP_HOST` unset, which logs emails instead
  of sending them — that way testers cannot accidentally email real guests. Set it only when you
  specifically want to acceptance-test invitation and RSVP email.

Your generated secrets are in `.env.production` locally. That file is gitignored; copy values into
Render rather than committing them. For UAT, generate *different* JWT secrets than production will
use, so a leaked UAT token is worthless against the real site.

---

## Deploying

1. **Push this repository to GitHub**, including `render.yaml`. Render blueprints deploy from a
   connected Git repository.

2. **Render Dashboard → New → Blueprint**, select the repository and the branch. Render reads
   `render.yaml` and proposes `birthday-api`, `birthday-web` and `birthday-db`.

3. **Fill in the variables marked `sync: false`.** Render prompts for each:

   | Service | Variable | Value |
   |---|---|---|
   | api | `JWT_SECRET`, `JWT_REFRESH_SECRET` | two different values, ≥32 characters |
   | api | `AZURE_STORAGE_CONNECTION_STRING` | Azure portal → Storage account → Access keys |
   | api | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | or leave `SMTP_HOST` empty to log email |
   | api | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | first admin login; password ≥12 characters |
   | api | `PUBLIC_WEB_URL`, `CORS_ORIGIN` | the **web** service's URL |
   | web | `VITE_SITE_URL`, `PUBLIC_WEB_URL` | the **web** service's URL |
   | web | `API_ORIGIN` | the **api** service's URL |

   Render assigns hostnames like `birthday-web.onrender.com` only after the first deploy, so set
   these four URLs once it has, then redeploy both services. Nothing needs to be committed to fix
   them — they are all environment variables.

4. **Apply.** The API starts with:

   ```sh
   npx prisma migrate deploy && node dist/seed/run-seed.js && node dist/main.js
   ```

   The free plan has neither a pre-deploy command nor shell access, so the migration and the
   first-admin seed run at startup. Both are safe to repeat: migrations no-op once applied, and the
   seed only creates `SEED_ADMIN_EMAIL` if that user does not already exist.

5. **Tighten the health check** once storage is configured: change the API's `healthCheckPath` from
   `/api/health` (database only) to `/api/health/ready` (database **and** storage), so a bad storage
   configuration fails the deploy instead of surfacing mid-test.

6. **Sign in** at `/admin/login`, then delete `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

---

## Test content: the one decision to make

`render.yaml` sets `NODE_ENV=production`, which is right for UAT fidelity — it is the only way to
exercise the production guards, JSON logging and `Secure` cookie behaviour. But the seed **refuses
`SEED_DEMO=true` when `NODE_ENV=production`**, because the demo password is public in this
repository. So:

- **Recommended — keep `NODE_ENV=production`,** and have testers enter the event, celebrant,
  albums and guests through the admin dashboard. That is itself worth acceptance-testing, and it
  means no public-password account ever exists on a reachable URL.
- **Faster, lower fidelity — set `NODE_ENV=development` and `COOKIE_SECURE=true`,** then
  `SEED_DEMO=true` to load the full demo dataset. You lose the production guards, get readable
  logs instead of JSON, and the demo accounts' password is public — acceptable only if the UAT URL
  is not shared beyond your team.

---

## Other free-plan artefacts testers should be warned about

So they do not file these as product bugs:

| Behaviour | Cause |
|---|---|
| First page load after a quiet spell takes **~1 minute** | Free services spin down after 15 minutes idle; this is the cold start |
| A page occasionally shows "last saved version" with a notice | The web server gives up on the API after 5 seconds and falls back to its snapshot — expected while the API is cold-starting |
| The saved-snapshot copy resets after a redeploy | Free services get no persistent disk, so `SNAPSHOT_DIR` is container-local |
| Several simultaneous large photo uploads fail | 512 MB RAM. `sharp` decodes a 10 MB JPEG to 150 MB+; the API idles at ~115 MB, leaving ~380 MB. Videos stream to disk and are unaffected |
| Image processing feels slow | 0.1 CPU |
| **The database disappears ~30 days in** | Free Postgres is deleted 30 days after creation, with a 14-day grace period. Fine for short UAT; if UAT runs longer, upgrade it or re-create and re-enter test data |

Upload limits are deliberately left at the production defaults (10 MB photos, 100 MB videos) so UAT
accepts and rejects exactly what production will.
