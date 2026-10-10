-- AlterTable
ALTER TABLE "testimonials" ADD COLUMN     "guest_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "testimonials_guest_id_key" ON "testimonials"("guest_id");

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

