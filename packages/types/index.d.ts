/**
 * Shared API contract for the birthday platform.
 *
 * This package is declarations only (no runtime code), so both the NestJS API (CommonJS)
 * and the Vite web app (ESM) can `import type` from it without a build step.
 *
 * Conventions
 * - Every route is under `/api`.
 * - Successful responses return the resource directly (no envelope).
 * - Lists that can grow return `Paginated<T>`; query params `page` (1-based) and `pageSize` (max 100).
 * - Errors always return `ApiErrorBody`.
 * - Dates are ISO 8601 strings. Byte sizes are numbers (safe up to 9 PB).
 * - Media files are served by the API at the paths in `MediaUrls`; the storage container is never exposed.
 * - Admin auth uses httpOnly cookies. State-changing requests must send header
 *   `X-CSRF-Token` equal to the readable `bp_csrf` cookie.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export type ISODateString = string;
export type UUID = string;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_DISABLED'
  | 'FORBIDDEN'
  | 'CSRF_TOKEN_INVALID'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'VIDEO_UPLOADS_DISABLED'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'UPLOADS_CLOSED'
  | 'UPLOAD_TOKEN_INVALID'
  | 'RSVP_CLOSED'
  | 'RSVP_INVITE_REQUIRED'
  | 'RSVP_ALREADY_EXISTS'
  | 'COMPANION_LIMIT_EXCEEDED'
  | 'EVENT_CAPACITY_REACHED'
  | 'CATEGORY_CAPACITY_REACHED'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_REVOKED'
  | 'INVITATION_EXPIRED'
  | 'ALREADY_CHECKED_IN'
  | 'NOT_CHECKED_IN'
  | 'TESTIMONIALS_CLOSED'
  | 'TESTIMONIAL_NOT_APPROVED'
  | 'PASSWORD_RESET_TOKEN_INVALID'
  | 'WEAK_PASSWORD'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  success: false;
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  /** Field-level validation messages, keyed by field path (e.g. "companions.0.fullName"). */
  details?: Record<string, string[]>;
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Enums (string unions mirror the Prisma enums)
// ---------------------------------------------------------------------------

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'CHECK_IN_STAFF';
export type UserStatus = 'ACTIVE' | 'DISABLED';
export type RsvpMode = 'OPEN' | 'INVITE_ONLY';
export type TimelineCategory =
  | 'BIRTH'
  | 'EDUCATION'
  | 'CAREER'
  | 'FAMILY'
  | 'FAITH'
  | 'ACHIEVEMENT'
  | 'TRAVEL'
  | 'MILESTONE'
  | 'OTHER';
export type FamilyRelationType = 'PARENT_OF' | 'SPOUSE_OF';
export type MediaKind = 'PHOTO' | 'VIDEO';
export type MediaSource = 'ADMIN' | 'GUEST_UPLOAD' | 'TESTIMONIAL';
export type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type GuestSource = 'ADMIN_INVITED' | 'SELF_REGISTERED';
export type RsvpResponse = 'ATTENDING' | 'DECLINED';
export type RsvpQuestionType = 'TEXT' | 'TEXTAREA' | 'SELECT' | 'CHECKBOX';
export type InvitationStatus = 'ACTIVE' | 'REVOKED';

/** Permissions checked by the API. Roles map to permission sets on the server. */
export type Permission =
  | 'content:manage'
  | 'media:manage'
  | 'testimonials:manage'
  | 'guests:manage'
  | 'event:manage'
  | 'settings:manage'
  | 'storage:read'
  | 'checkin:use'
  | 'checkin:reverse'
  | 'audit:read'
  | 'users:manage'
  | 'dashboard:read';

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/** Relative API paths, e.g. "/api/media/<id>/thumb". `thumb`/`medium` are null for videos. */
export interface MediaUrls {
  thumb: string | null;
  medium: string | null;
  original: string;
}

/** Media as shown on public pages (approved only). */
export interface PublicMedia {
  id: UUID;
  kind: MediaKind;
  mimeType: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  altText: string | null;
  urls: MediaUrls;
}

/** Media as shown in the admin dashboard. */
export interface AdminMedia extends PublicMedia {
  source: MediaSource;
  status: ModerationStatus;
  originalFilename: string;
  sizeBytes: number;
  storedBytes: number;
  albumId: UUID | null;
  albumTitle: string | null;
  sortOrder: number;
  uploaderName: string | null;
  uploaderMessage: string | null;
  uploadedByName: string | null;
  reviewedAt: ISODateString | null;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Public site
// ---------------------------------------------------------------------------

export interface PublicEvent {
  name: string;
  tagline: string | null;
  description: string | null;
  startsAt: ISODateString;
  endsAt: ISODateString;
  timezone: string;
  venueName: string;
  address: string;
  city: string | null;
  mapUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  theme: string | null;
  dressCode: string | null;
  parkingInfo: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  rsvp: RsvpAvailability;
}

export interface RsvpAvailability {
  open: boolean;
  mode: RsvpMode;
  deadline: ISODateString | null;
  /** Present when `open` is false. */
  closedReason: 'CLOSED_BY_ADMIN' | 'DEADLINE_PASSED' | 'CAPACITY_REACHED' | 'EVENT_ENDED' | null;
}

export interface Celebrant {
  fullName: string;
  preferredName: string;
  honorific: string | null;
  birthDate: string | null; // YYYY-MM-DD
  birthPlace: string | null;
  /** Age being celebrated, computed from birthDate and the event date (e.g. 70). */
  age: number | null;
  heroHeadline: string | null;
  introduction: string | null;
  /** Paragraphs separated by blank lines. Plain text, never HTML. */
  biography: string | null;
  quote: string | null;
  quoteAttribution: string | null;
  achievements: string[];
  values: string[];
  portrait: PublicMedia | null;
}

export interface SiteBranding {
  siteTitle: string | null;
  siteDescription: string | null;
  primaryColor: string;
  secondaryColor: string;
  logo: PublicMedia | null;
  hero: PublicMedia | null;
  ogImage: PublicMedia | null;
}

/** GET /api/site — everything the home page needs in one request. */
export interface SiteOverview {
  event: PublicEvent;
  celebrant: Celebrant;
  branding: SiteBranding;
  features: {
    testimonialsOpen: boolean;
    testimonialsAllowPhotos: boolean;
    testimonialsAllowVideos: boolean;
  };
  isDemo: boolean;
}

export interface TimelineEntry {
  id: UUID;
  year: number;
  month: number | null;
  title: string;
  description: string | null;
  category: TimelineCategory;
  media: PublicMedia | null;
  sortOrder: number;
}

export interface FamilyMember {
  id: UUID;
  fullName: string;
  relationshipLabel: string;
  generation: number;
  isCelebrant: boolean;
  bio: string | null;
  birthYear: number | null;
  deathYear: number | null;
  photo: PublicMedia | null;
  sortOrder: number;
}

export interface FamilyRelationship {
  id: UUID;
  fromId: UUID;
  toId: UUID;
  type: FamilyRelationType;
}

/** GET /api/family */
export interface FamilyTree {
  members: FamilyMember[];
  relationships: FamilyRelationship[];
}

export interface AlbumSummary {
  id: UUID;
  slug: string;
  title: string;
  description: string | null;
  cover: PublicMedia | null;
  mediaCount: number;
  sortOrder: number;
}

/** GET /api/albums/:slug — media are fetched separately (paginated). */
export type AlbumDetail = AlbumSummary;

export interface ProgrammeItem {
  id: UUID;
  startTime: string; // "HH:mm"
  endTime: string | null;
  title: string;
  description: string | null;
  speaker: string | null;
  location: string | null;
  sortOrder: number;
}

export interface PublicTestimonial {
  id: UUID;
  authorName: string;
  relationship: string | null;
  message: string;
  isFeatured: boolean;
  photo: PublicMedia | null;
  video: PublicMedia | null;
  createdAt: ISODateString;
}

/** POST /api/testimonials (multipart/form-data: fields below + optional `photo`, `video` files). */
export interface SubmitTestimonialFields {
  authorName: string;
  relationship?: string;
  email?: string;
  message: string;
}

export interface SubmitTestimonialResult {
  id: UUID;
  status: ModerationStatus;
  message: string;
}

// ---------------------------------------------------------------------------
// RSVP and invitations
// ---------------------------------------------------------------------------

export interface PublicGuestCategory {
  id: UUID;
  name: string;
  description: string | null;
  defaultCompanions: number;
  /** True when this category's allocated places are all taken (RSVPs to it are refused). */
  full: boolean;
}

export interface RsvpQuestion {
  id: UUID;
  label: string;
  helpText: string | null;
  type: RsvpQuestionType;
  options: string[];
  required: boolean;
  sortOrder: number;
}

/** GET /api/rsvp/form */
export interface RsvpFormConfig {
  availability: RsvpAvailability;
  allowCompanions: boolean;
  /** Companion limit for open registration (per category default, capped by this). */
  maxCompanions: number;
  categories: PublicGuestCategory[];
  questions: RsvpQuestion[];
  /** Whether guests may add an optional birthday message (tribute) to their RSVP. */
  tributes: { open: boolean; requireApproval: boolean };
}

/**
 * An optional birthday message written as part of the RSVP. It is stored as a testimonial
 * (same table, same moderation) linked to the guest; one per guest, editable while pending.
 */
export interface RsvpTribute {
  message: string;
  relationship?: string;
}

/** GET /api/rsvp/invite/:token — prefill for a guest invited by the admin. */
export interface RsvpInvitePrefill {
  fullName: string;
  email: string;
  phone: string | null;
  categoryName: string | null;
  allowedCompanions: number;
  existing: {
    response: RsvpResponse;
    companionCount: number;
    companions: { fullName: string; dietary: string | null }[];
    dietary: string | null;
    accessibility: string | null;
    message: string | null;
    answers: Record<string, string | boolean>;
    tribute: { message: string; relationship: string | null; status: ModerationStatus } | null;
  } | null;
}

/** POST /api/rsvp */
export interface SubmitRsvpRequest {
  /** Present when responding to an admin invitation; required when rsvpMode is INVITE_ONLY. */
  inviteToken?: string;
  fullName: string;
  email: string;
  phone?: string;
  categoryId?: UUID;
  response: RsvpResponse;
  companions: { fullName: string; dietary?: string }[];
  dietary?: string;
  accessibility?: string;
  /** Deprecated: private note stored on the RSVP. Use `tribute` for a birthday message. */
  message?: string;
  /** Keyed by RsvpQuestion.id. */
  answers?: Record<string, string | boolean>;
  /** Optional birthday message, saved to the testimonials table for review. */
  tribute?: RsvpTribute;
}

export interface SubmitRsvpResult {
  response: RsvpResponse;
  /** Present when attending. Use it for /invitation/:token. */
  invitationToken: string | null;
  invitationCode: string | null;
  guestName: string;
  companionCount: number;
  emailSent: boolean;
  /** Moderation status of the birthday message, or null if none was given. */
  tributeStatus: ModerationStatus | null;
}

/** GET /api/invitations/:token — the digital pass. */
export interface DigitalInvitation {
  code: string;
  status: InvitationStatus;
  guestName: string;
  categoryName: string | null;
  companionCount: number;
  companions: string[];
  /** Guest plus companions. */
  partySize: number;
  response: RsvpResponse | null;
  checkedIn: boolean;
  event: {
    name: string;
    celebrantName: string;
    startsAt: ISODateString;
    endsAt: ISODateString;
    timezone: string;
    venueName: string;
    address: string;
    dressCode: string | null;
    mapUrl: string | null;
  };
  /** Relative API paths: `${base}.svg`, `.png`; PDF pass at `pdfUrl`. */
  qrSvgUrl: string;
  qrPngUrl: string;
  pdfUrl: string;
  /** What the QR code encodes (a link to this invitation page). */
  qrValue: string;
}

// ---------------------------------------------------------------------------
// Guest photo uploads (QR)
// ---------------------------------------------------------------------------

/** GET /api/uploads/:token */
export interface UploadPageConfig {
  open: boolean;
  closedReason: 'CLOSED_BY_ADMIN' | 'STORAGE_FULL' | null;
  eventName: string;
  celebrantName: string;
  maxPhotoBytes: number;
  maxVideoBytes: number;
  videoUploadsEnabled: boolean;
  maxFilesPerUpload: number;
  acceptedMimeTypes: string[];
}

/** POST /api/uploads/:token (multipart: `files` (repeatable), optional `uploaderName`, `message`). */
export interface UploadResult {
  accepted: number;
  rejected: { filename: string; code: ApiErrorCode; reason: string }[];
  moderated: boolean;
}

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

/** GET /api/seo?path=/gallery/childhood */
export interface SeoMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string | null;
  type: 'website' | 'article' | 'profile';
  noindex: boolean;
  jsonLd: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: UUID;
  email: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** POST /api/auth/login, POST /api/auth/refresh, GET /api/auth/me */
export interface AuthSession {
  user: AuthUser;
  /** Access token expiry. The client refreshes shortly before it. */
  accessTokenExpiresAt: ISODateString;
}

export interface ForgotPasswordRequest {
  email: string;
}
export interface ResetPasswordRequest {
  token: string;
  password: string;
}
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

/** POST /api/checkin/verify — `value` is a scanned QR (URL or token) or a typed invitation code. */
export interface CheckInVerifyRequest {
  value: string;
}

export type CheckInVerifyStatus =
  | 'VALID'
  | 'ALREADY_CHECKED_IN'
  | 'REVOKED'
  | 'EXPIRED'
  | 'NOT_ATTENDING'
  | 'INVALID';

export interface CheckInGuestSummary {
  invitationId: UUID;
  code: string;
  guestName: string;
  categoryName: string | null;
  partySize: number;
  companions: string[];
  dietary: string | null;
  accessibility: string | null;
}

export interface CheckInVerifyResult {
  status: CheckInVerifyStatus;
  guest: CheckInGuestSummary | null;
  checkIn: {
    checkedInAt: ISODateString;
    checkedInByName: string | null;
    partySize: number;
  } | null;
}

/** POST /api/checkin */
export interface CheckInRequest {
  invitationId: UUID;
  /** Guests arriving now (defaults to the full party). Cannot exceed the party size. */
  partySize?: number;
  deviceInfo?: string;
}

export interface CheckInRecord {
  id: UUID;
  invitationId: UUID;
  code: string;
  guestName: string;
  categoryName: string | null;
  partySize: number;
  checkedInAt: ISODateString;
  checkedInByName: string | null;
  reversedAt: ISODateString | null;
  reversedByName: string | null;
  reverseReason: string | null;
}

/** GET /api/checkin/recent */
export interface CheckInOverview {
  checkedInGuests: number;
  checkedInPeople: number;
  expectedPeople: number;
  recent: CheckInRecord[];
}

/** GET /api/checkin/search?q= — for manual lookup when a QR code will not scan. */
export interface CheckInSearchResult {
  invitationId: UUID;
  code: string;
  guestName: string;
  categoryName: string | null;
  partySize: number;
  checkedIn: boolean;
  status: InvitationStatus;
}

// ---------------------------------------------------------------------------
// Admin: dashboard and storage
// ---------------------------------------------------------------------------

export interface StorageSummary {
  quotaBytes: number;
  usedBytes: number;
  remainingBytes: number;
  percentUsed: number;
  level: 'OK' | 'WARNING' | 'CRITICAL' | 'FULL';
  photoCount: number;
  videoCount: number;
  photoBytes: number;
  videoBytes: number;
  otherBytes: number;
}

/** GET /api/admin/storage */
export interface StorageDetail extends StorageSummary {
  largestFiles: AdminMedia[];
  bySource: { source: MediaSource; count: number; bytes: number }[];
  byStatus: { status: ModerationStatus; count: number; bytes: number }[];
}

/** GET /api/admin/dashboard */
export interface DashboardStats {
  totalInvitations: number;
  activeInvitations: number;
  registeredGuests: number;
  confirmedGuests: number;
  declinedGuests: number;
  confirmedPeople: number;
  capacity: number;
  capacityRemaining: number;
  checkedInGuests: number;
  checkedInPeople: number;
  pendingTestimonials: number;
  pendingPhotos: number;
  storage: StorageSummary;
  rsvpsByDay: { date: string; count: number }[];
  guestsByCategory: { categoryName: string; guests: number; people: number }[];
  guestPhotoCounts: { pending: number; approved: number; rejected: number };
  recentActivity: AuditLogEntry[];
}

// ---------------------------------------------------------------------------
// Admin: event, settings, programme
// ---------------------------------------------------------------------------

export interface AdminEvent extends Omit<PublicEvent, 'rsvp'> {
  capacity: number;
  rsvpOpen: boolean;
  rsvpMode: RsvpMode;
  rsvpDeadline: ISODateString | null;
  defaultCompanions: number;
  maxCompanions: number;
  allowCompanions: boolean;
  confirmedPeople: number;
  capacityRemaining: number;
  updatedAt: ISODateString;
}

/**
 * GET /api/admin/event/allocations — how the event capacity is split across guest categories.
 * PUT with `UpdateCapacityAllocationsRequest` sets every category's share in one go.
 */
export interface CapacityAllocations {
  capacity: number;
  confirmedPeople: number;
  /** Sum of the category capacities that are set. */
  allocated: number;
  /** Event capacity not set aside for any category (open to guests without a limited category). */
  unallocated: number;
  categories: {
    categoryId: UUID;
    name: string;
    color: string | null;
    capacity: number | null;
    confirmedPeople: number;
    remaining: number | null;
    guestCount: number;
  }[];
  /** Attending people whose guest has no category. */
  uncategorisedPeople: number;
}

export interface UpdateCapacityAllocationsRequest {
  allocations: { categoryId: UUID; capacity: number | null }[];
}

/** PUT /api/admin/event — all fields optional; nullable strings accept null to clear. */
export type UpdateEventRequest = Partial<
  Omit<AdminEvent, 'confirmedPeople' | 'capacityRemaining' | 'updatedAt'>
>;

export interface AdminSettings {
  storageQuotaBytes: number;
  maxPhotoBytes: number;
  maxVideoBytes: number;
  videoUploadsEnabled: boolean;
  uploadModerationEnabled: boolean;
  guestUploadsOpen: boolean;
  maxFilesPerUpload: number;
  guestUploadAlbumId: UUID | null;
  uploadToken: string;
  uploadUrl: string;
  uploadTokenRotatedAt: ISODateString;
  testimonialsOpen: boolean;
  testimonialsRequireApproval: boolean;
  testimonialsAllowPhotos: boolean;
  testimonialsAllowVideos: boolean;
  primaryColor: string;
  secondaryColor: string;
  logoMediaId: UUID | null;
  heroMediaId: UUID | null;
  ogImageMediaId: UUID | null;
  logo: PublicMedia | null;
  hero: PublicMedia | null;
  ogImage: PublicMedia | null;
  siteTitle: string | null;
  siteDescription: string | null;
  isDemo: boolean;
  /** Quota presets offered in the UI (bytes): 5, 10, 25, 50 GB. */
  quotaPresets: number[];
}

/** PUT /api/admin/settings */
export type UpdateSettingsRequest = Partial<
  Omit<
    AdminSettings,
    | 'uploadToken'
    | 'uploadUrl'
    | 'uploadTokenRotatedAt'
    | 'logo'
    | 'hero'
    | 'ogImage'
    | 'isDemo'
    | 'quotaPresets'
  >
>;

export type UpsertProgrammeItemRequest = Omit<ProgrammeItem, 'id' | 'sortOrder'> & {
  sortOrder?: number;
};

export interface ReorderRequest {
  ids: UUID[];
}

// ---------------------------------------------------------------------------
// Admin: celebrant, timeline, family
// ---------------------------------------------------------------------------

export interface AdminCelebrant extends Omit<Celebrant, 'age'> {
  portraitMediaId: UUID | null;
  /**
   * The age the celebration is for, as entered by an admin. Null means nobody has set
   * one yet, and `age` falls back to the age reached on the event date.
   */
  celebrationAge: number | null;
  /** What the public site shows: `celebrationAge` when set, otherwise derived. */
  age: number | null;
}

export type UpdateCelebrantRequest = Partial<
  Omit<AdminCelebrant, 'portrait' | 'age'>
>;

export interface AdminTimelineEntry extends TimelineEntry {
  mediaId: UUID | null;
  isPublished: boolean;
}

export interface UpsertTimelineEntryRequest {
  year: number;
  month?: number | null;
  title: string;
  description?: string | null;
  category: TimelineCategory;
  mediaId?: UUID | null;
  isPublished?: boolean;
  sortOrder?: number;
}

export interface AdminFamilyMember extends FamilyMember {
  photoMediaId: UUID | null;
  isPublished: boolean;
  /** The member's spouse in the tree, if any. */
  spouseId: UUID | null;
  /** Up to two parents in the tree. */
  parentIds: UUID[];
  /** True for someone who joined the family by marriage (a spouse with no parents recorded). */
  marriedIn: boolean;
}

/** A spouse created or updated together with a family member. */
export interface FamilySpouseInput {
  fullName: string;
  /** e.g. "Son-in-law". Defaults to "Spouse". */
  relationshipLabel?: string;
  birthYear?: number | null;
  deathYear?: number | null;
  bio?: string | null;
  photoMediaId?: UUID | null;
}

export interface AdminFamilyTree {
  members: AdminFamilyMember[];
  relationships: FamilyRelationship[];
}

/**
 * POST/PUT /api/admin/family.
 * - `parentIds` (0–2) replaces the member's parent links; `generation` is then derived from them.
 *   Omit it to leave parents unchanged.
 * - `spouse` creates or updates the member's spouse (same generation, linked as a couple).
 *   `null` removes the spouse from the tree. Omit it to leave the spouse unchanged.
 * - `generation` is only needed for people without parents in the tree (e.g. the celebrant's
 *   parents at -1, the celebrant and siblings at 0). Defaults to 0.
 */
export interface UpsertFamilyMemberRequest {
  fullName: string;
  relationshipLabel: string;
  generation?: number;
  parentIds?: UUID[];
  spouse?: FamilySpouseInput | null;
  isCelebrant?: boolean;
  bio?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  photoMediaId?: UUID | null;
  sortOrder?: number;
  isPublished?: boolean;
}

export interface CreateFamilyRelationshipRequest {
  fromId: UUID;
  toId: UUID;
  type: FamilyRelationType;
}

// ---------------------------------------------------------------------------
// Admin: albums and media
// ---------------------------------------------------------------------------

export interface AdminAlbum extends AlbumSummary {
  coverMediaId: UUID | null;
  isPublished: boolean;
  pendingCount: number;
  createdAt: ISODateString;
}

export interface UpsertAlbumRequest {
  title: string;
  slug?: string;
  description?: string | null;
  coverMediaId?: UUID | null;
  isPublished?: boolean;
  sortOrder?: number;
}

/**
 * GET /api/admin/media?status=&source=&kind=&albumId=&q=&sort=&page=&pageSize=
 * albumId may be "none" for media without an album. sort: newest | oldest | largest | order
 */
export type AdminMediaSort = 'newest' | 'oldest' | 'largest' | 'order';

/** PATCH /api/admin/media/:id */
export interface UpdateMediaRequest {
  caption?: string | null;
  altText?: string | null;
  albumId?: UUID | null;
  sortOrder?: number;
  status?: ModerationStatus;
}

/** POST /api/admin/media/bulk */
export interface BulkMediaRequest {
  ids: UUID[];
  action: 'APPROVE' | 'REJECT' | 'DELETE' | 'MOVE';
  /** Required for MOVE; optional for APPROVE (falls back to the guest-upload album). */
  albumId?: UUID | null;
}

export interface BulkResult {
  affected: number;
}

/** POST /api/admin/media (multipart: `files` repeatable, optional `albumId`, `caption`). */
export type AdminUploadResult = UploadResult & { media: AdminMedia[] };

/** GET /api/admin/media/stats */
export interface MediaModerationStats {
  guestUploads: { pending: number; approved: number; rejected: number };
  all: { pending: number; approved: number; rejected: number };
  storage: StorageSummary;
}

// ---------------------------------------------------------------------------
// Admin: testimonials
// ---------------------------------------------------------------------------

export interface AdminTestimonial extends PublicTestimonial {
  email: string | null;
  /** Written in the RSVP form (linked to a guest) rather than on the tributes page. */
  fromRsvp: boolean;
  status: ModerationStatus;
  isPublic: boolean;
  sortOrder: number;
  reviewedAt: ISODateString | null;
  reviewedByName: string | null;
  editedAt: ISODateString | null;
  updatedAt: ISODateString;
}

/** GET /api/admin/testimonials?filter=all|pending|approved|rejected|featured|public&q=&page= */
export type TestimonialFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'featured' | 'public';

/**
 * PATCH /api/admin/testimonials/:id
 * Rules: isPublic/isFeatured can be true only when status is APPROVED (409 TESTIMONIAL_NOT_APPROVED).
 * Rejecting or un-approving clears isPublic and isFeatured. Featuring also makes it public.
 */
export interface UpdateTestimonialRequest {
  status?: ModerationStatus;
  isPublic?: boolean;
  isFeatured?: boolean;
  authorName?: string;
  relationship?: string | null;
  message?: string;
  sortOrder?: number;
}

/** POST /api/admin/testimonials/bulk */
export interface BulkTestimonialRequest {
  ids: UUID[];
  action: 'APPROVE' | 'REJECT' | 'DELETE' | 'PUBLISH' | 'UNPUBLISH';
}

export interface TestimonialCounts {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
  featured: number;
  public: number;
}

// ---------------------------------------------------------------------------
// Admin: guests, categories, questions, invitations, check-ins
// ---------------------------------------------------------------------------

export interface GuestCategory extends PublicGuestCategory {
  selfSelectable: boolean;
  color: string | null;
  sortOrder: number;
  guestCount: number;
  /** Places allocated to this category out of the event capacity; null = no separate limit. */
  capacity: number | null;
  /** Attending guests in this category plus their companions. */
  confirmedPeople: number;
}

export interface UpsertGuestCategoryRequest {
  name: string;
  description?: string | null;
  defaultCompanions: number;
  capacity?: number | null;
  selfSelectable?: boolean;
  color?: string | null;
  sortOrder?: number;
}

export interface AdminRsvpQuestion extends RsvpQuestion {
  isActive: boolean;
}

export interface UpsertRsvpQuestionRequest {
  label: string;
  helpText?: string | null;
  type: RsvpQuestionType;
  options?: string[];
  required?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

/** GET /api/admin/guests sort values. */
export type GuestSort = 'newest' | 'oldest' | 'name' | '-name';

export type GuestRsvpFilter = 'ATTENDING' | 'DECLINED' | 'NONE';
export type GuestCheckInFilter = 'IN' | 'OUT';

/** Row in GET /api/admin/guests?q=&categoryId=&rsvp=&checkIn=&from=&to=&page=&pageSize=&sort= */
export interface AdminGuestListItem {
  id: UUID;
  fullName: string;
  email: string;
  phone: string | null;
  categoryId: UUID | null;
  categoryName: string | null;
  allowedCompanions: number;
  source: GuestSource;
  rsvpResponse: RsvpResponse | null;
  companionCount: number;
  partySize: number;
  invitation: {
    id: UUID;
    code: string;
    status: InvitationStatus;
    lastSentAt: ISODateString | null;
  } | null;
  checkedInAt: ISODateString | null;
  createdAt: ISODateString;
}

export interface AdminGuestDetail extends AdminGuestListItem {
  notes: string | null;
  rsvp: {
    response: RsvpResponse;
    companions: { id: UUID; fullName: string; dietary: string | null }[];
    dietary: string | null;
    accessibility: string | null;
    message: string | null;
    answers: { questionId: UUID; label: string; value: string | boolean }[];
    submittedAt: ISODateString;
    updatedAt: ISODateString;
  } | null;
  invitationDetail: {
    id: UUID;
    code: string;
    status: InvitationStatus;
    token: string;
    url: string;
    revokedAt: ISODateString | null;
    revokedReason: string | null;
    lastSentAt: ISODateString | null;
    sendCount: number;
  } | null;
  checkIns: CheckInRecord[];
}

/** POST /api/admin/guests */
export interface CreateGuestRequest {
  fullName: string;
  email: string;
  phone?: string | null;
  categoryId?: UUID | null;
  allowedCompanions: number;
  notes?: string | null;
  /** Send the invitation email now. */
  sendInvitation?: boolean;
  /** Record an RSVP on the guest's behalf. */
  rsvp?: {
    response: RsvpResponse;
    companions: { fullName: string; dietary?: string }[];
    dietary?: string;
    accessibility?: string;
  };
  /** Admins may exceed event capacity deliberately; the override is audited. */
  overrideCapacity?: boolean;
}

/** PUT /api/admin/guests/:id */
export type UpdateGuestRequest = Partial<Omit<CreateGuestRequest, 'sendInvitation'>>;

/**
 * POST /api/admin/invitations/send — emails invitations in bulk.
 * Give `guestIds`, or `onlyUnsent: true` for every active invitation never sent yet.
 * Guests who declined are skipped. At most 500 per call.
 */
export interface SendInvitationsRequest {
  guestIds?: UUID[];
  onlyUnsent?: boolean;
}

export interface SendInvitationsResult {
  sent: number;
  skipped: number;
  failed: number;
  /** False when SMTP is not configured: invitations were marked but no email left the server. */
  emailEnabled: boolean;
}

export interface RevokeInvitationRequest {
  reason?: string;
}

/** GET /api/admin/checkins?page= ; POST /api/admin/checkins/:id/reverse */
export interface ReverseCheckInRequest {
  reason: string;
}

// ---------------------------------------------------------------------------
// Admin: users and audit
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: UUID;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: ISODateString | null;
  lockedUntil: ISODateString | null;
  createdAt: ISODateString;
}

export interface CreateUserRequest {
  email: string;
  name: string;
  role: UserRole;
  /** At least 12 characters. */
  password: string;
}

export interface UpdateUserRequest {
  name?: string;
  role?: UserRole;
  status?: UserStatus;
  /** Set a new password for the user (revokes their sessions). */
  password?: string;
  /** Clear failed-login lockout. */
  unlock?: boolean;
}

export interface AuditLogEntry {
  id: UUID;
  actorId: UUID | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: ISODateString;
}
