-- CreateTable
CREATE TABLE "BookingDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT,
    "service" TEXT,
    "date" TEXT,
    "time" TEXT,
    "clientName" TEXT,
    "rawDateMentioned" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'COLLECTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingDraft_userId_key" ON "BookingDraft"("userId");

-- AddForeignKey
ALTER TABLE "BookingDraft" ADD CONSTRAINT "BookingDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Active slot unique partial index:
CREATE UNIQUE INDEX "Appointment_active_slot_key"
ON "Appointment" ("clinicId", "scheduledAt")
WHERE "clinicId" IS NOT NULL AND "status" IN ('BOOKED','CONFIRMED');
