-- AlterTable
ALTER TABLE "guest_categories" ADD COLUMN     "capacity" INTEGER;

ALTER TABLE "guest_categories" ADD CONSTRAINT "guest_categories_capacity_non_negative" CHECK ("capacity" IS NULL OR "capacity" >= 0);
