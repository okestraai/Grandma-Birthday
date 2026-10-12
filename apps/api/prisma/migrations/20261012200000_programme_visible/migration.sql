-- One admin switch to show or hide the programme on the public site. On by default, so existing sites are unchanged.
-- AlterTable
ALTER TABLE "event" ADD COLUMN     "programme_visible" BOOLEAN NOT NULL DEFAULT true;
