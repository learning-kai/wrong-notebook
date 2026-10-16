-- Complete the persistent study backend without changing legacy data.
CREATE TABLE "StudySettings" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "dailyNewLimit" INTEGER NOT NULL DEFAULT 20,
    "dailyReviewLimit" INTEGER NOT NULL DEFAULT 100,
    "relearnMinutes" INTEGER NOT NULL DEFAULT 10,
    "initialGoodDays" INTEGER NOT NULL DEFAULT 1,
    "initialEasyDays" INTEGER NOT NULL DEFAULT 4,
    "hardMultiplier" REAL NOT NULL DEFAULT 1.2,
    "easyMultiplier" REAL NOT NULL DEFAULT 1.3,
    "maxIntervalDays" INTEGER NOT NULL DEFAULT 365,
    "examDate" DATETIME,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "defaultsInitialized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "MemoryCard" ADD COLUMN "formula" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "roc" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "precautions" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "steps" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "initialConditions" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "finalConditions" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "chinese" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "english" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "letterType" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "paragraphPosition" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "sentenceFunction" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "clozeText" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "comparison" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "sentences" TEXT;
ALTER TABLE "MemoryCard" ADD COLUMN "slots" TEXT;

ALTER TABLE "MemoryReview" ADD COLUMN "responseText" TEXT;
ALTER TABLE "MemoryReview" ADD COLUMN "clientEventId" TEXT;
CREATE UNIQUE INDEX "MemoryReview_userId_clientEventId_key" ON "MemoryReview"("userId", "clientEventId");
