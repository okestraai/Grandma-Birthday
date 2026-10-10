-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'CHECK_IN_STAFF');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RsvpMode" AS ENUM ('OPEN', 'INVITE_ONLY');

-- CreateEnum
CREATE TYPE "TimelineCategory" AS ENUM ('BIRTH', 'EDUCATION', 'CAREER', 'FAMILY', 'FAITH', 'ACHIEVEMENT', 'TRAVEL', 'MILESTONE', 'OTHER');

-- CreateEnum
CREATE TYPE "FamilyRelationType" AS ENUM ('PARENT_OF', 'SPOUSE_OF');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaSource" AS ENUM ('ADMIN', 'GUEST_UPLOAD', 'TESTIMONIAL');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GuestSource" AS ENUM ('ADMIN_INVITED', 'SELF_REGISTERED');

-- CreateEnum
CREATE TYPE "RsvpResponse" AS ENUM ('ATTENDING', 'DECLINED');

-- CreateEnum
CREATE TYPE "RsvpQuestionType" AS ENUM ('TEXT', 'TEXTAREA', 'SELECT', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_id" UUID,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_email" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "venue_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "map_url" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "theme" TEXT,
    "dress_code" TEXT,
    "parking_info" TEXT,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 250,
    "rsvp_open" BOOLEAN NOT NULL DEFAULT true,
    "rsvp_mode" "RsvpMode" NOT NULL DEFAULT 'OPEN',
    "rsvp_deadline" TIMESTAMPTZ(3),
    "default_companions" INTEGER NOT NULL DEFAULT 1,
    "max_companions" INTEGER NOT NULL DEFAULT 4,
    "allow_companions" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "storage_quota_bytes" BIGINT NOT NULL DEFAULT 10737418240,
    "max_photo_bytes" INTEGER NOT NULL DEFAULT 10485760,
    "max_video_bytes" INTEGER NOT NULL DEFAULT 104857600,
    "video_uploads_enabled" BOOLEAN NOT NULL DEFAULT true,
    "upload_moderation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "guest_uploads_open" BOOLEAN NOT NULL DEFAULT true,
    "max_files_per_upload" INTEGER NOT NULL DEFAULT 20,
    "guest_upload_album_id" UUID,
    "upload_token" TEXT NOT NULL,
    "upload_token_rotated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "testimonials_open" BOOLEAN NOT NULL DEFAULT true,
    "testimonials_require_approval" BOOLEAN NOT NULL DEFAULT true,
    "testimonials_allow_photos" BOOLEAN NOT NULL DEFAULT true,
    "testimonials_allow_videos" BOOLEAN NOT NULL DEFAULT false,
    "primary_color" TEXT NOT NULL DEFAULT '#071A2B',
    "secondary_color" TEXT NOT NULL DEFAULT '#D6B36A',
    "logo_media_id" UUID,
    "hero_media_id" UUID,
    "og_image_media_id" UUID,
    "site_title" TEXT,
    "site_description" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programme_items" (
    "id" UUID NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "speaker" TEXT,
    "location" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "programme_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "celebrant" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "full_name" TEXT NOT NULL,
    "preferred_name" TEXT NOT NULL,
    "honorific" TEXT,
    "birth_date" DATE,
    "birth_place" TEXT,
    "hero_headline" TEXT,
    "introduction" TEXT,
    "biography" TEXT,
    "quote" TEXT,
    "quote_attribution" TEXT,
    "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "portrait_media_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "celebrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_entries" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "TimelineCategory" NOT NULL DEFAULT 'MILESTONE',
    "media_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_members" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship_label" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "is_celebrant" BOOLEAN NOT NULL DEFAULT false,
    "bio" TEXT,
    "birth_year" INTEGER,
    "death_year" INTEGER,
    "photo_media_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_relationships" (
    "id" UUID NOT NULL,
    "from_id" UUID NOT NULL,
    "to_id" UUID NOT NULL,
    "type" "FamilyRelationType" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover_media_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "source" "MediaSource" NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "stored_bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "storage_key" TEXT NOT NULL,
    "thumb_key" TEXT,
    "medium_key" TEXT,
    "checksum" TEXT,
    "caption" TEXT,
    "alt_text" TEXT,
    "album_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "uploader_name" TEXT,
    "uploader_message" TEXT,
    "uploaded_by_id" UUID,
    "upload_session_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" UUID NOT NULL,
    "uploader_name" TEXT,
    "message" TEXT,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "total_bytes" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_companions" INTEGER NOT NULL DEFAULT 1,
    "self_selectable" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guest_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "category_id" UUID,
    "allowed_companions" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "source" "GuestSource" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvps" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "response" "RsvpResponse" NOT NULL,
    "companion_count" INTEGER NOT NULL DEFAULT 0,
    "dietary" TEXT,
    "accessibility" TEXT,
    "message" TEXT,
    "answers" JSONB,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companions" (
    "id" UUID NOT NULL,
    "rsvp_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "dietary" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvp_questions" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "help_text" TEXT,
    "type" "RsvpQuestionType" NOT NULL DEFAULT 'TEXT',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rsvp_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'ACTIVE',
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" TEXT,
    "last_sent_at" TIMESTAMPTZ(3),
    "send_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "checked_in_by_id" UUID,
    "party_size" INTEGER NOT NULL DEFAULT 1,
    "checked_in_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device_info" TEXT,
    "ip" TEXT,
    "reversed_at" TIMESTAMPTZ(3),
    "reversed_by_id" UUID,
    "reverse_reason" TEXT,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonials" (
    "id" UUID NOT NULL,
    "author_name" TEXT NOT NULL,
    "relationship" TEXT,
    "email" TEXT,
    "message" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "photo_media_id" UUID,
    "video_media_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "ip_hash" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "edited_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_upload_token_key" ON "settings"("upload_token");

-- CreateIndex
CREATE INDEX "programme_items_sort_order_idx" ON "programme_items"("sort_order");

-- CreateIndex
CREATE INDEX "timeline_entries_year_sort_order_idx" ON "timeline_entries"("year", "sort_order");

-- CreateIndex
CREATE INDEX "family_members_generation_sort_order_idx" ON "family_members"("generation", "sort_order");

-- CreateIndex
CREATE INDEX "family_relationships_to_id_idx" ON "family_relationships"("to_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_relationships_from_id_to_id_type_key" ON "family_relationships"("from_id", "to_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "albums_slug_key" ON "albums"("slug");

-- CreateIndex
CREATE INDEX "albums_sort_order_idx" ON "albums"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE INDEX "media_status_idx" ON "media"("status");

-- CreateIndex
CREATE INDEX "media_source_status_created_at_idx" ON "media"("source", "status", "created_at");

-- CreateIndex
CREATE INDEX "media_album_id_sort_order_idx" ON "media"("album_id", "sort_order");

-- CreateIndex
CREATE INDEX "media_created_at_idx" ON "media"("created_at");

-- CreateIndex
CREATE INDEX "media_stored_bytes_idx" ON "media"("stored_bytes");

-- CreateIndex
CREATE INDEX "upload_sessions_created_at_idx" ON "upload_sessions"("created_at");

-- CreateIndex
CREATE INDEX "upload_sessions_ip_hash_created_at_idx" ON "upload_sessions"("ip_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "guest_categories_name_key" ON "guest_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "guests_email_key" ON "guests"("email");

-- CreateIndex
CREATE INDEX "guests_category_id_idx" ON "guests"("category_id");

-- CreateIndex
CREATE INDEX "guests_created_at_idx" ON "guests"("created_at");

-- CreateIndex
CREATE INDEX "guests_full_name_idx" ON "guests"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "rsvps_guest_id_key" ON "rsvps"("guest_id");

-- CreateIndex
CREATE INDEX "rsvps_response_idx" ON "rsvps"("response");

-- CreateIndex
CREATE INDEX "rsvps_submitted_at_idx" ON "rsvps"("submitted_at");

-- CreateIndex
CREATE INDEX "companions_rsvp_id_idx" ON "companions"("rsvp_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_guest_id_key" ON "invitations"("guest_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_code_key" ON "invitations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_status_idx" ON "invitations"("status");

-- CreateIndex
CREATE INDEX "check_ins_invitation_id_idx" ON "check_ins"("invitation_id");

-- CreateIndex
CREATE INDEX "check_ins_guest_id_idx" ON "check_ins"("guest_id");

-- CreateIndex
CREATE INDEX "check_ins_checked_in_at_idx" ON "check_ins"("checked_in_at");

-- CreateIndex
CREATE INDEX "testimonials_status_is_public_idx" ON "testimonials"("status", "is_public");

-- CreateIndex
CREATE INDEX "testimonials_created_at_idx" ON "testimonials"("created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_guest_upload_album_id_fkey" FOREIGN KEY ("guest_upload_album_id") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_logo_media_id_fkey" FOREIGN KEY ("logo_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_hero_media_id_fkey" FOREIGN KEY ("hero_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_og_image_media_id_fkey" FOREIGN KEY ("og_image_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celebrant" ADD CONSTRAINT "celebrant_portrait_media_id_fkey" FOREIGN KEY ("portrait_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_photo_media_id_fkey" FOREIGN KEY ("photo_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_upload_session_id_fkey" FOREIGN KEY ("upload_session_id") REFERENCES "upload_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "guest_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companions" ADD CONSTRAINT "companions_rsvp_id_fkey" FOREIGN KEY ("rsvp_id") REFERENCES "rsvps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_checked_in_by_id_fkey" FOREIGN KEY ("checked_in_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_photo_media_id_fkey" FOREIGN KEY ("photo_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_video_media_id_fkey" FOREIGN KEY ("video_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma cannot express, enforced by the database as a last line of defence.
-- ---------------------------------------------------------------------------

-- One active (non-reversed) check-in per invitation. Prevents duplicate check-ins
-- even when two staff scan the same code at the same moment.
CREATE UNIQUE INDEX "check_ins_one_active_per_invitation"
  ON "check_ins" ("invitation_id") WHERE "reversed_at" IS NULL;

-- Single-row tables.
ALTER TABLE "event" ADD CONSTRAINT "event_singleton" CHECK ("id" = 1);
ALTER TABLE "settings" ADD CONSTRAINT "settings_singleton" CHECK ("id" = 1);
ALTER TABLE "celebrant" ADD CONSTRAINT "celebrant_singleton" CHECK ("id" = 1);

-- Only approved testimonials can be public or featured.
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_public_requires_approval"
  CHECK (("is_public" = false AND "is_featured" = false) OR "status" = 'APPROVED');

-- Sane numbers.
ALTER TABLE "event" ADD CONSTRAINT "event_capacity_non_negative" CHECK ("capacity" >= 0);
ALTER TABLE "event" ADD CONSTRAINT "event_ends_after_start" CHECK ("ends_at" > "starts_at");
ALTER TABLE "guests" ADD CONSTRAINT "guests_allowed_companions_non_negative" CHECK ("allowed_companions" >= 0);
ALTER TABLE "guests" ADD CONSTRAINT "guests_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_companion_count_non_negative" CHECK ("companion_count" >= 0);
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_party_size_positive" CHECK ("party_size" >= 1);
ALTER TABLE "settings" ADD CONSTRAINT "settings_quota_positive" CHECK ("storage_quota_bytes" > 0);
ALTER TABLE "media" ADD CONSTRAINT "media_sizes_non_negative" CHECK ("size_bytes" >= 0 AND "stored_bytes" >= "size_bytes");
