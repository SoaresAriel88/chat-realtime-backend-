-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppGroup" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppGroup_tenantId_idx" ON "WhatsAppGroup"("tenantId");

-- CreateIndex
CREATE INDEX "WhatsAppGroup_channelId_idx" ON "WhatsAppGroup"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppGroup_tenantId_channelId_externalId_key" ON "WhatsAppGroup"("tenantId", "channelId", "externalId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppGroup" ADD CONSTRAINT "WhatsAppGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppGroup" ADD CONSTRAINT "WhatsAppGroup_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
