/*
  Warnings:

  - You are about to drop the column `type` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappContactId` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the column `fromMe` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappMessageId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the `WhatsappContact` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'TELEGRAM', 'WEBSITE');

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_whatsappContactId_fkey";

-- DropForeignKey
ALTER TABLE "WhatsappContact" DROP CONSTRAINT "WhatsappContact_tenantId_fkey";

-- DropIndex
DROP INDEX "Conversation_whatsappContactId_idx";

-- DropIndex
DROP INDEX "Message_whatsappMessageId_idx";

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "type",
DROP COLUMN "whatsappContactId",
ADD COLUMN     "channelId" TEXT,
ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "fromMe",
DROP COLUMN "whatsappMessageId",
ADD COLUMN     "contactId" TEXT;

-- DropTable
DROP TABLE "WhatsappContact";

-- DropEnum
DROP TYPE "ConversationType";

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactIdentity" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "settings" JSONB,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactIdentity_channel_externalId_key" ON "ContactIdentity"("channel", "externalId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactIdentity" ADD CONSTRAINT "ContactIdentity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
