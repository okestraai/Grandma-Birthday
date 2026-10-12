-- A celebration can now have several events (for example a service, a dinner and a brunch).
-- The single-row "event" table keeps the celebration-wide settings. Dates and venues move to
-- the new "events" table. Existing data is kept: the current date and venue become one event,
-- and every programme item, attending RSVP and check-in is attached to it.

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "venue_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "map_url" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "dress_code" TEXT,
    "theme" TEXT,
    "parking_info" TEXT,
    "capacity" INTEGER,
    "rsvp_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_categories" (
    "event_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("event_id","category_id")
);

-- CreateTable
CREATE TABLE "guest_events" (
    "guest_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_events_pkey" PRIMARY KEY ("guest_id","event_id")
);

-- CreateTable
CREATE TABLE "rsvp_events" (
    "rsvp_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "companion_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rsvp_events_pkey" PRIMARY KEY ("rsvp_id","event_id")
);

-- Data: the current date and venue become the first event. It keeps the celebration's name,
-- so a site with one event reads exactly as before.
INSERT INTO "events" (
    "id", "slug", "name", "description", "starts_at", "ends_at", "venue_name", "address", "city",
    "map_url", "latitude", "longitude", "dress_code", "theme", "parking_info", "sort_order", "updated_at"
)
SELECT gen_random_uuid(), 'main', "name", NULL, "starts_at", "ends_at", "venue_name", "address", "city",
    "map_url", "latitude", "longitude", "dress_code", "theme", "parking_info", 0, CURRENT_TIMESTAMP
FROM "event"
WHERE "id" = 1;

-- Data: every attending guest attends the first event, with the companions they named.
INSERT INTO "rsvp_events" ("rsvp_id", "event_id", "companion_count")
SELECT r."id", e."id", r."companion_count"
FROM "rsvps" r
CROSS JOIN "events" e
WHERE r."response" = 'ATTENDING';

-- AlterTable: programme items belong to an event; existing items move to the first event.
DROP INDEX "programme_items_sort_order_idx";
ALTER TABLE "programme_items" ADD COLUMN "date" DATE,
ADD COLUMN "event_id" UUID;
UPDATE "programme_items" SET "event_id" = (SELECT "id" FROM "events" LIMIT 1);
ALTER TABLE "programme_items" ALTER COLUMN "event_id" SET NOT NULL;

-- AlterTable: check-ins are per event; existing check-ins were for the first event.
ALTER TABLE "check_ins" ADD COLUMN "event_id" UUID;
UPDATE "check_ins" SET "event_id" = (SELECT "id" FROM "events" LIMIT 1);
ALTER TABLE "check_ins" ALTER COLUMN "event_id" SET NOT NULL;

-- One active (not reversed) check-in per guest per event, instead of per invitation.
DROP INDEX "check_ins_one_active_per_invitation";
CREATE UNIQUE INDEX "check_ins_one_active_per_guest_event"
  ON "check_ins" ("guest_id", "event_id") WHERE "reversed_at" IS NULL;

-- AlterTable: the date and venue now live on the events.
ALTER TABLE "event" DROP CONSTRAINT "event_ends_after_start";
ALTER TABLE "event" DROP COLUMN "address",
DROP COLUMN "city",
DROP COLUMN "dress_code",
DROP COLUMN "ends_at",
DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "map_url",
DROP COLUMN "parking_info",
DROP COLUMN "starts_at",
DROP COLUMN "theme",
DROP COLUMN "venue_name";

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_sort_order_starts_at_idx" ON "events"("sort_order", "starts_at");

-- CreateIndex
CREATE INDEX "event_categories_category_id_idx" ON "event_categories"("category_id");

-- CreateIndex
CREATE INDEX "guest_events_event_id_idx" ON "guest_events"("event_id");

-- CreateIndex
CREATE INDEX "rsvp_events_event_id_idx" ON "rsvp_events"("event_id");

-- CreateIndex
CREATE INDEX "check_ins_event_id_checked_in_at_idx" ON "check_ins"("event_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "programme_items_event_id_sort_order_idx" ON "programme_items"("event_id", "sort_order");

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "guest_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_items" ADD CONSTRAINT "programme_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_events" ADD CONSTRAINT "guest_events_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_events" ADD CONSTRAINT "guest_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_events" ADD CONSTRAINT "rsvp_events_rsvp_id_fkey" FOREIGN KEY ("rsvp_id") REFERENCES "rsvps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_events" ADD CONSTRAINT "rsvp_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules Prisma cannot express.
ALTER TABLE "events" ADD CONSTRAINT "events_ends_after_start" CHECK ("ends_at" > "starts_at");
ALTER TABLE "events" ADD CONSTRAINT "events_capacity_non_negative" CHECK ("capacity" IS NULL OR "capacity" >= 0);
ALTER TABLE "rsvp_events" ADD CONSTRAINT "rsvp_events_companion_count_non_negative" CHECK ("companion_count" >= 0);
