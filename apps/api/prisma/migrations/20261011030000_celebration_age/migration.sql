-- The age being celebrated is entered by an admin instead of being derived from the
-- birth date. Nullable: existing rows keep falling back to the age reached on the event
-- date until someone sets it.
ALTER TABLE "celebrant" ADD COLUMN "celebration_age" INTEGER;
