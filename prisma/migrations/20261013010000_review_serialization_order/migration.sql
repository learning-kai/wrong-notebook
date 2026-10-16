-- Preserve observed review times while making equal-time latest-state deterministic.
ALTER TABLE "MemoryReview" ADD COLUMN "reviewOrder" INTEGER NOT NULL DEFAULT 0;
