-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('ADMIN', 'USER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "SystemRole" NOT NULL DEFAULT 'USER';
