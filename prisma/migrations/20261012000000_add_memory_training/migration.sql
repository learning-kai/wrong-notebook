-- Study memory MVP: courses, chapters, cards, and review history.
CREATE TABLE "StudyCourse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subjectKey" TEXT,
    "examYear" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudyCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StudyCourse_userId_name_key" ON "StudyCourse"("userId", "name");
CREATE INDEX "StudyCourse_userId_idx" ON "StudyCourse"("userId");

CREATE TABLE "StudyChapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudyChapter_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "StudyCourse" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StudyChapter_courseId_name_key" ON "StudyChapter"("courseId", "name");
CREATE INDEX "StudyChapter_courseId_order_idx" ON "StudyChapter"("courseId", "order");

CREATE TABLE "MemoryCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chapterId" TEXT,
    "title" TEXT NOT NULL,
    "cardType" TEXT NOT NULL DEFAULT 'basic',
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "explanation" TEXT,
    "conditions" TEXT,
    "pitfalls" TEXT,
    "tags" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "dueAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" DATETIME,
    "intervalDays" REAL NOT NULL DEFAULT 0,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MemoryCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MemoryCard_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "StudyCourse" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MemoryCard_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "StudyChapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "MemoryCard_userId_dueAt_idx" ON "MemoryCard"("userId", "dueAt");
CREATE INDEX "MemoryCard_courseId_chapterId_idx" ON "MemoryCard"("courseId", "chapterId");

CREATE TABLE "MemoryReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'recall',
    "previousDueAt" DATETIME,
    "nextDueAt" DATETIME,
    "responseMs" INTEGER,
    "note" TEXT,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MemoryReview_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "MemoryCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MemoryReview_userId_reviewedAt_idx" ON "MemoryReview"("userId", "reviewedAt");
CREATE INDEX "MemoryReview_cardId_reviewedAt_idx" ON "MemoryReview"("cardId", "reviewedAt");
