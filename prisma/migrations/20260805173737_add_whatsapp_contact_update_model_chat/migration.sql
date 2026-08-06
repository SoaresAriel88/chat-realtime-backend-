-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('INTERNAL', 'WHATSAPP');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "type" "ConversationType" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "whatsappContactId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "fromMe" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappMessageId" TEXT,
ALTER COLUMN "authorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WhatsappContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "name" TEXT,
    "pushName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappContact_tenantId_idx" ON "WhatsappContact"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappContact_tenantId_phone_key" ON "WhatsappContact"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappContact_tenantId_jid_key" ON "WhatsappContact"("tenantId", "jid");

-- CreateIndex
CREATE INDEX "Conversation_whatsappContactId_idx" ON "Conversation"("whatsappContactId");

-- CreateIndex
CREATE INDEX "Message_whatsappMessageId_idx" ON "Message"("whatsappMessageId");

-- AddForeignKey
ALTER TABLE "WhatsappContact" ADD CONSTRAINT "WhatsappContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_whatsappContactId_fkey" FOREIGN KEY ("whatsappContactId") REFERENCES "WhatsappContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
