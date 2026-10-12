# API routes

Every route is under `/api`. Types live in `packages/types/index.d.ts`. Interactive docs are at `/api/docs` when the API runs.

Roles: **SA** = SUPER_ADMIN, **A** = ADMIN, **S** = CHECK_IN_STAFF. "Public" needs no login.

A celebration has one or more **events** (for example a service, a dinner and a brunch). The celebration holds the name, contact details, RSVP rules and the overall capacity. Each event holds its own date, venue, dress code, optional capacity and the guest categories invited to it. See "Several events" at the end of this page.

Admin routes use cookie auth. Every `POST`, `PUT`, `PATCH` and `DELETE` from the browser must send `X-CSRF-Token` with the value of the `bp_csrf` cookie.

## Public

| Method | Path | Returns / body |
|---|---|---|
| GET | `/health` | `{ status: 'ok' }` |
| GET | `/site` | `SiteOverview`: the celebration, its public events in display order, celebrant, branding |
| GET | `/celebration` | `PublicCelebration` (replaces `/event`) |
| GET | `/celebrant` | `Celebrant` |
| GET | `/timeline` | `TimelineEntry[]` (published only) |
| GET | `/family` | `FamilyTree` (published only) |
| GET | `/albums` | `AlbumSummary[]` (published albums with at least one approved item) |
| GET | `/albums/:slug` | `AlbumDetail` |
| GET | `/media?album=<slug>&kind=&page=&pageSize=` | `Paginated<PublicMedia>` (approved only) |
| GET | `/media/:id/:variant` | file bytes. `variant` = `thumb` (400px webp), `medium` (1600px webp), `original`. Supports `Range`. |
| GET | `/programme` | `ProgrammeGroup[]`: items grouped by public event, in event order. Events without items are left out |
| GET | `/testimonials/public?page=&pageSize=` | `Paginated<PublicTestimonial>` (approved AND public; featured first) |
| POST | `/testimonials` | multipart `SubmitTestimonialFields` + `photo?`, `video?` → `SubmitTestimonialResult` |
| GET | `/rsvp/form` | `RsvpFormConfig`. `events` lists the public events that take replies, each with `invitedCategoryIds` so the form can show only the events for the category the guest picks |
| GET | `/rsvp/invite/:token` | `RsvpInvitePrefill`. `events` is exactly the events this guest may reply to; `existing.events` their current choices |
| POST | `/rsvp` | `SubmitRsvpRequest` → `SubmitRsvpResult`. `events: [{ eventId, companionCount }]` says which events the guest attends; left out, the guest attends every event they may reply to. An optional `tribute` is saved as a testimonial linked to the guest (pending review, never public until an admin chooses) |
| GET | `/invitations/:token` | `DigitalInvitation`, with the guest's `events` |
| GET | `/invitations/:token/qr.svg` · `/qr.png` · `/pass.pdf` | QR image / printable pass (the pass lists the guest's events). One QR code works at every event |
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

Check-in is per event. `eventId` may be left out only when there is one event; with several, verify and check-in return 400 without it.

| Method | Path | Returns / body |
|---|---|---|
| POST | `/checkin/verify` | `CheckInVerifyRequest` (`value`, `eventId`) → `CheckInVerifyResult`. `NOT_FOR_THIS_EVENT` when the guest is not invited to the event or chose other events |
| POST | `/checkin` | `CheckInRequest` (`invitationId`, `eventId`, `partySize?`) → `CheckInRecord` (409 `ALREADY_CHECKED_IN`: one active check-in per guest per event) |
| GET | `/checkin/recent?eventId=` | `CheckInOverview`. Without `eventId`: the event in progress, else the next to start, else the last. `events` gives every event's counts, for the event picker |
| GET | `/checkin/search?q=&eventId=` | `CheckInSearchResult[]` (max 20), party size and check-in for that event |

## Admin (A, SA unless marked)

| Method | Path | Returns / body |
|---|---|---|
| GET | `/admin/dashboard` | `DashboardStats` |
| GET, PUT | `/admin/celebration` | `AdminCelebration` / `UpdateCelebrationRequest` (was `/admin/event`; dates and venues moved to events). Includes `rsvpScope` and `checkInScope` (see "Several events") |
| GET, PUT | `/admin/celebration/allocations` | `CapacityAllocations` / `UpdateCapacityAllocationsRequest` (celebration capacity split across guest categories) |
| GET, POST | `/admin/events` | `AdminEvent[]` / `UpsertEventRequest` → `AdminEvent` |
| PUT | `/admin/events/reorder` | `ReorderRequest` |
| PUT, DELETE | `/admin/events/:id` | `UpsertEventRequest` → `AdminEvent`. DELETE is refused (409) for the last event and for an event with replies or check-ins |
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
| GET | `/admin/guests?q=&categoryId=&eventId=&rsvp=&checkIn=&from=&to=&sort=&page=&pageSize=` | `Paginated<AdminGuestListItem>`; `sort` = `newest` (default), `oldest`, `name`, `-name`. `eventId` lists guests attending that event; `checkIn` then means checked in at it |
| GET | `/admin/guests/export.csv` | CSV of guests (same filters) |
| POST | `/admin/guests` | `CreateGuestRequest` → `AdminGuestDetail` |
| GET, PUT, DELETE | `/admin/guests/:id` | `AdminGuestDetail` / `UpdateGuestRequest`. `extraEventIds` replaces the events the guest is added to beyond their category; `rsvp.events` sets their events |
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
| GET | `/admin/checkins?page=&pageSize=&includeReversed=&eventId=` | `Paginated<CheckInRecord>` (each record names its event) |
| POST | `/admin/checkins/:id/reverse` | `ReverseCheckInRequest` → `CheckInRecord` |
| GET, POST | `/admin/events/:eventId/programme` | `ProgrammeItem[]` / `UpsertProgrammeItemRequest` (`date` optional: YYYY-MM-DD for an item on another day) |
| PUT, DELETE | `/admin/events/:eventId/programme/:id` | |
| PUT | `/admin/events/:eventId/programme/reorder` | `ReorderRequest` |
| GET | `/admin/storage` | `StorageDetail` |
| GET, POST | `/admin/users` (SA) | `AdminUser[]` / `CreateUserRequest` |
| PUT, DELETE | `/admin/users/:id` (SA) | `UpdateUserRequest` |
| GET | `/admin/audit-logs?action=&actorId=&entityType=&page=&pageSize=` | `Paginated<AuditLogEntry>` |

## Several events

| Rule | How it works |
|---|---|
| Who may attend an event | An event with no invited categories is for everyone. Otherwise only guests in those categories, plus guests an admin added to it (`extraEventIds`), plus guests who already chose it. |
| What a reply means | `ATTENDING` means attending at least one event. Each chosen event stores how many of the guest's named companions come to it. |
| Capacity | The celebration capacity and the category capacities count each person once, whatever events they attend: the guest plus their named companions. An event's own capacity counts the people coming to that event. All three are checked under one database lock. A full event answers 409 `EVENT_FULL`. |
| Information-only events | `rsvpEnabled: false`: shown on the site, never offered in the RSVP form. Invited guests see them on their invitation. |
| Hidden events | `isPublic: false`: left out of the site, programme, SEO and the open RSVP form. Guests invited to one still see it on their invitation and their invite link. |
| Check-in | The same QR code works at every event. One active check-in per guest per event. |
| `rsvpScope` (celebration) | `PER_EVENT` (default): guests tick events, with companions per event. `WHOLE_CELEBRATION`: one yes or no; a yes is stored as attending every event the guest may reply to, with all their companions, so event capacity, counts, invitations and emails work as before. `events` in the request is ignored, and a full event refuses the whole reply (`EVENT_FULL`). `RsvpFormConfig.rsvpScope` tells the form which to show. |
| Switching `rsvpScope` | Replies already made keep their events. Switching to `WHOLE_CELEBRATION` does not add events to earlier replies; switching back does not remove any. A guest who updates their reply is saved under the current choice. |
| `checkInScope` (celebration) | `PER_EVENT` (default): staff choose the event; one check-in per guest per event. `ONCE`: `eventId` is ignored, the check-in is recorded against the event in progress (else the next, else the last), and a guest checked in at any event is `ALREADY_CHECKED_IN` everywhere. The unique index is per event, so this rule is checked in the service under an advisory lock. Reversing works as before. `/checkin/recent` then counts guests across all events (each person once). |
| Audit | Event changes are logged as `ADMIN_CHANGED_EVENT` (entity `Event`); celebration settings as `ADMIN_CHANGED_EVENT_SETTINGS` (entity `Celebration`). |
