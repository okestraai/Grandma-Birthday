-- Two celebration-wide choices: whether guests reply per event or once for the whole celebration,
-- and whether they are checked in at each event or once. The defaults keep the behaviour so far.
-- CreateEnum
CREATE TYPE "RsvpScope" AS ENUM ('PER_EVENT', 'WHOLE_CELEBRATION');

-- CreateEnum
CREATE TYPE "CheckInScope" AS ENUM ('PER_EVENT', 'ONCE');

-- AlterTable
ALTER TABLE "event" ADD COLUMN     "check_in_scope" "CheckInScope" NOT NULL DEFAULT 'PER_EVENT',
ADD COLUMN     "rsvp_scope" "RsvpScope" NOT NULL DEFAULT 'PER_EVENT';

