# Design decisions

This page explains the choices that are not obvious from the code, and why they were made.

## Shared contract

`packages/types/index.d.ts` defines every request and response. It is a declarations-only file, so both the API (CommonJS) and the web app (ES modules) can import its types without a build step. `docs/api-routes.md` lists every route and who may call it.

## Data model

The schema is in `apps/api/prisma/schema.prisma`. Differences from a first-draft entity list, and why:

| Decision | Reason |
|---|---|
| **Roles are an enum, not a table.** Permissions per role live in `apps/api/src/common/permissions.ts`. | There are exactly three fixed roles. A table would suggest roles can be edited, which the product does not support. |
| **No storage-usage table.** Usage is summed from the `media` table (`stored_bytes`). | A running counter can drift from reality after a crash or manual cleanup. A sum cannot. The `stored_bytes` column is indexed. |
| **`Companion` instead of `GuestPlusOne`.** | Same idea; the word matches the interface text ("accompanying guests"). |
| **Event, Settings and Celebrant are single-row tables** (`id = 1`, enforced by a check constraint). | There is one celebration. Settings is separate from Event so that storage and branding changes do not touch event details. |
| **Invitation tokens are stored as-is, not hashed.** | Admins need to view, print and re-send invitations without changing the QR code a guest may already have printed. Tokens are 256-bit random values; the only access they grant is viewing that one invitation. "Regenerate link" replaces a token when needed. |
| **Refresh tokens and password-reset tokens are hashed.** | These grant account access, so a database leak must not expose usable values. |
| **Testimonials have both `isPublic` and `isFeatured`.** | Approval never publishes by itself. `isPublic` is the explicit "Show on public website" choice; `isFeatured` highlights one at the top. A database check stops an unapproved message from being public. |
| **Guest emails are unique and stored lower-case.** | One person, one invitation. Re-submitting the RSVP form with the same email re-sends the existing invitation instead of creating a duplicate. |

## Rules enforced on the server

| Rule | How |
|---|---|
| A guest cannot bring more companions than allowed | Checked in `RsvpService` against the guest's allowance (or the category default, capped by the event maximum). Returns `COMPANION_LIMIT_EXCEEDED`. |
| Confirmed people never exceed capacity | RSVPs and admin guest changes take a PostgreSQL advisory lock, then count confirmed people and check. Concurrent RSVPs queue on the lock. Admins may override deliberately; the override is audited. |
| One check-in per invitation | A partial unique index: `UNIQUE (invitation_id) WHERE reversed_at IS NULL`. Two phones scanning at the same moment produce one check-in and one `ALREADY_CHECKED_IN`. Reversing sets `reversed_at`, which frees the invitation. |
| Revoked invitations cannot be checked in | Checked on verify and again on check-in. |
| Uploads cannot exceed the quota | Files are processed and stored first; then, under an advisory lock, the quota is checked and the row inserted. If the check fails, the stored files are deleted. |
| Only approved media are public | The file endpoint returns 404 for anything not approved, unless the viewer has `media:manage`. |
| Staff cannot change settings | Every admin route declares its permission; the global guard checks it. Tests check the main admin routes as an anonymous visitor and as check-in staff. |

## Authentication

- Access token: a 15-minute JWT (HS256) in an `httpOnly` cookie scoped to `/api`. Bearer tokens are also accepted, for API clients and Swagger.
- Refresh token: a random value in an `httpOnly` cookie scoped to `/api/auth`, stored as an HMAC. Each refresh replaces it. Reuse of a replaced token more than 15 seconds after the swap revokes the whole login's sessions. Within 15 seconds it is treated as two tabs refreshing at once.
- CSRF: double-submit. The readable `bp_csrf` cookie must match the `X-CSRF-Token` header on every state-changing request made with cookies. The web app adds the header automatically.
- The web app skips the session check entirely when there is no `bp_csrf` cookie, so public visitors make no auth requests.

## Files

- Type detection reads the file's first bytes; declared types and names are ignored. SVG is never accepted (it can carry scripts). HEIC is refused because browsers cannot display it; phones convert to JPEG when a site does not list HEIC as accepted.
- Photos are re-encoded with orientation applied and metadata removed, so guest photos do not publish GPS locations.
- Videos are stored unchanged. Transcoding would need ffmpeg and a job queue, which is not worth it for a single event. Browsers play MP4 and WebM directly; some older browsers cannot play MOV.
- Files are served through the API with `Range` support (for video seeking) and ETags.
- The upload interceptor reads limits from Settings on each request, so changing the maximum file size in the dashboard takes effect immediately.

## Front end

- Routes are lazy-loaded, so the public site does not download the admin dashboard, and charts and the QR scanner load only where used.
- Brand colours are CSS variables. The Branding settings change them at runtime.
- `MotionConfig reducedMotion="user"` plus a CSS media query honour the reduced-motion setting everywhere.
- The admin dashboard is deliberately plainer than the public site: compact tables, filters and bulk actions, with the same colours used as accents.

## Known limitations

- Rate-limit counters are in memory; see the deployment guide for running several API instances.
- Videos have no generated preview image.
- Page content (not metadata) is rendered in the browser. Metadata is server-rendered by the included web server.
- The event is single-tenant: one celebration per deployment.
