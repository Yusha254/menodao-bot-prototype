ALTER TABLE "User"
ADD COLUMN "phone" TEXT,
ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN "phoneConsentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

CREATE TABLE "PhoneRegistrationChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "pairingCodeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "linkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneRegistrationChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhoneRegistrationChallenge_pairingCodeHash_key"
ON "PhoneRegistrationChallenge"("pairingCodeHash");

CREATE INDEX "PhoneRegistrationChallenge_phone_createdAt_idx"
ON "PhoneRegistrationChallenge"("phone", "createdAt");

CREATE INDEX "PhoneRegistrationChallenge_expiresAt_idx"
ON "PhoneRegistrationChallenge"("expiresAt");
