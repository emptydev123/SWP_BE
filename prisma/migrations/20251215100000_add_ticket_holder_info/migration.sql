-- Add attendee info fields to tickets
ALTER TABLE "tickets"
ADD COLUMN IF NOT EXISTS "holder_name" TEXT,
ADD COLUMN IF NOT EXISTS "holder_email" TEXT,
ADD COLUMN IF NOT EXISTS "holder_phone" TEXT;

