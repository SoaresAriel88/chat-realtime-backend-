-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR');

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "status" "ChannelStatus" NOT NULL DEFAULT 'DISCONNECTED';
