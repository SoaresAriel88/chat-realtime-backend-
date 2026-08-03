/*
  Warnings:

  - A unique constraint covering the columns `[userId,token]` on the table `UserDevice` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "UserDevice_token_key";

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_userId_token_key" ON "UserDevice"("userId", "token");
