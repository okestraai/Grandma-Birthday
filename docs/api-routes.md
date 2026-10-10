# API routes

Every route is under `/api`. Types live in `packages/types/index.d.ts`. Interactive docs are at `/api/docs` when the API runs.

Roles: **SA** = SUPER_ADMIN, **A** = ADMIN, **S** = CHECK_IN_STAFF. "Public" needs no login.

Admin routes use cookie auth. Every `POST`, `PUT`, `PATCH` and `DELETE` from the browser must send `X-CSRF-Token` with the value of the `bp_csrf` cookie.

## Public

| Method | Path | Returns / body |
|---|---|---|
| GET | `/health` | `{ status: 'ok' }` |
| GET | `/site` | `SiteOverview` |
| GET | `/event` | `PublicEvent` |
| GET | `/celebrant` | `Celebrant` |
| GET | `/timeline` | `TimelineEntry[]` (published only) |
| GET | `/family` | `FamilyTree` (published only) |
| GET | `/albums` | `AlbumSummary[]` (published albums with at least one approved item) |
| GET | `/albums/:slug` | `AlbumDetail` |
| GET | `/media?album=<slug>&kind=&page=&pageSize=` | `Paginated<PublicMedia>` (approved only) |
| GET | `/media/:id/:variant` | file bytes. `variant` = `thumb` (400px webp), `medium` (1600px webp), `original`. Supports `Range`. |
| GET | `/programme` | `ProgrammeItem[]` |
| GET | `/testimonials/public?page=&pageSize=` | `Paginated<PublicTestimonial>` (approved AND public; featured first) |
| POST | `/testimonials` | multipart `SubmitTestimonialFields` + `photo?`, `video?` → `SubmitTestimonialResult` |
| GET | `/rsvp/form` | `RsvpFormConfig` |
| GET | `/rsvp/invite/:token` | `RsvpInvitePrefill` |
| POST | `/rsvp` | `SubmitRsvpRequest` → `SubmitRsvpResult`. An optional `tribute` is saved as a testimonial linked to the guest (pending review, never public until an admin chooses) |
| GET | `/invitations/:token` | `DigitalInvitation` |
| GET | `/invitations/:token/qr.svg` · `/qr.png` · `/pass.pdf` | QR image / printable pass |
| GET | `/uploads/:token` | `UploadPageConfig` |
| POST | `/uploads/:token` | multipart `files` (repeat), `uploaderName?`, `message?` → `UploadResult` |
| GET | `/seo?path=/gallery/childhood` | `SeoMetadata` |
| GET | `/sitemap.xml` | XML sitemap |

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `LoginRequest` → `AuthSession`; sets `bp_access`, `bp_refresh` (httpOnly) and `bp_csrf` cookies |
| POST | `/auth/refresh` | rotates the refresh token → `AuthSession` |
| POST | `/auth/logout` | clears cookies, revokes the refresh token family |
| GET | `/auth/me` | `AuthSession` |
| POST | `/auth/password/forgot` | `ForgotPasswordRequest` → 202 always |
| POST | `/auth/password/reset` | `ResetPasswordRequest` → 204 |
| POST | `/auth/password/change` | `ChangePasswordRequest` → 204 (logged in) |

## Check-in (S, A, SA)

| Method | Path | Returns / body |
|---|---|---|
| POST | `/checkin/verify` | `CheckInVerifyRequest` → `CheckInVerifyResult` |
| POST | `/checkin` | `CheckInRequest` → `CheckInRecord` (409 `ALREADY_CHECKED_IN`) |
| GET | `/checkin/recent` | `CheckInOverview` |
| GET | `/checkin/search?q=` | `CheckInSearchResult[]` (max 20) |

## Admin (A, SA unless marked)

| Method | Path | Returns / body |
|---|---|---|
| GET | `/admin/dashboard` | `DashboardStats` |
| GET, PUT | `/admin/event` | `AdminEvent` / `UpdateEventRequest` |
| GET, PUT | `/admin/event/allocations` | `CapacityAllocations` / `UpdateCapacityAllocationsRequest` (event capacity split across guest categories) |
| GET, PUT | `/admin/settings` | `AdminSettings` / `UpdateSettingsRequest` |
| POST | `/admin/settings/upload-token/rotate` | `AdminSettings` (old QR stops working) |
| GET | `/admin/settings/upload-qr.svg` · `.png` · `.pdf` | upload QR code / printable poster |
| GET, PUT | `/admin/celebrant` | `AdminCelebrant` / `UpdateCelebrantRequest` |
| GET, POST | `/admin/timeline` | `AdminTimelineEntry[]` / `UpsertTimelineEntryRequest` |
| PUT, DELETE | `/admin/timeline/:id` | |
| PUT | `/admin/timeline/reorder` | `ReorderRequest` |
| GET | `/admin/family` | `AdminFamilyTree` |
| POST | `/admin/family` | `UpsertFamilyMemberRequest` → `AdminFamilyMember`. `parentIds` (0–2) sets "child of" and derives the generation; `spouse` creates/updates the spouse (`null` removes them) |
| PUT, DELETE | `/admin/family/:id` | same body as POST. DELETE also removes a spouse who married in; children stay |
| POST | `/admin/family/relationships` | `CreateFamilyRelationshipRequest` → `FamilyRelationship` |
| DELETE | `/admin/family/relationships/:id` | |
| GET, POST | `/admin/albums` | `AdminAlbum[]` / `UpsertAlbumRequest` |
| PUT, DELETE | `/admin/albums/:id` | delete keeps media (moves them to "no album") |
| PUT | `/admin/albums/reorder` | `ReorderRequest` |
| PUT | `/admin/albums/:id/media/reorder` | `ReorderRequest` |
| GET | `/admin/media?status=&source=&kind=&albumId=&q=&sort=&page=&pageSize=` | `Paginated<AdminMedia>` |
| GET | `/admin/media/stats` | `MediaModerationStats` |
| POST | `/admin/media` | multipart upload → `AdminUploadResult` |
| PATCH, DELETE | `/admin/media/:id` | `UpdateMediaRequest` → `AdminMedia` |
| POST | `/admin/media/bulk` | `BulkMediaRequest` → `BulkResult` |
| GET | `/admin/testimonials?filter=&q=&page=&pageSize=` | `Paginated<AdminTestimonial>` |
| GET | `/admin/testimonials/counts` | `TestimonialCounts` |
| PATCH, DELETE | `/admin/testimonials/:id` | `UpdateTestimonialRequest` → `AdminTestimonial` |
| POST | `/admin/testimonials/bulk` | `BulkTestimonialRequest` → `BulkResult` |
| GET | `/admin/guests?q=&categoryId=&rsvp=&checkIn=&from=&to=&sort=&page=&pageSize=` | `Paginated<AdminGuestListItem>`; `sort` = `newest` (default), `oldest`, `name`, `-name` |
| GET | `/admin/guests/export.csv` | CSV of guests (same filters) |
| POST | `/admin/guests` | `CreateGuestRequest` → `AdminGuestDetail` |
| GET, PUT, DELETE | `/admin/guests/:id` | `AdminGuestDetail` / `UpdateGuestRequest` |
| POST | `/admin/guests/:id/invitation/resend` | → `AdminGuestDetail` |
| POST | `/admin/guests/:id/invitation/revoke` | `RevokeInvitationRequest` → `AdminGuestDetail` |
| POST | `/admin/guests/:id/invitation/reinstate` | → `AdminGuestDetail` |
| POST | `/admin/guests/:id/invitation/regenerate` | new token, old QR stops working → `AdminGuestDetail` |
| GET, POST | `/admin/guest-categories` | `GuestCategory[]` / `UpsertGuestCategoryRequest` |
| PUT, DELETE | `/admin/guest-categories/:id` | |
| GET, POST | `/admin/rsvp-questions` | `AdminRsvpQuestion[]` / `UpsertRsvpQuestionRequest` |
| PUT, DELETE | `/admin/rsvp-questions/:id` | |
| GET | `/admin/invitations?status=&q=&page=&pageSize=` | `Paginated<AdminGuestListItem>` (guests with invitations) |
| POST | `/admin/invitations/send` | `SendInvitationsRequest` → `SendInvitationsResult` (bulk email) |
| GET | `/admin/checkins?page=&pageSize=&includeReversed=` | `Paginated<CheckInRecord>` |
| POST | `/admin/checkins/:id/reverse` | `ReverseCheckInRequest` → `CheckInRecord` |
| GET, POST | `/admin/programme` | `ProgrammeItem[]` / `UpsertProgrammeItemRequest` |
| PUT, DELETE | `/admin/programme/:id` | |
| PUT | `/admin/programme/reorder` | `ReorderRequest` |
| GET | `/admin/storage` | `StorageDetail` |
| GET, POST | `/admin/users` (SA) | `AdminUser[]` / `CreateUserRequest` |
| PUT, DELETE | `/admin/users/:id` (SA) | `UpdateUserRequest` |
| GET | `/admin/audit-logs?action=&actorId=&entityType=&page=&pageSize=` | `Paginated<AuditLogEntry>` |
