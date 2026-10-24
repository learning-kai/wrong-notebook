-- 考研核心考点速记：新增字段保存 AI 提炼的核心结论。
-- 允许 NULL，历史错题不受影响。
ALTER TABLE "ErrorItem" ADD COLUMN "examSummary" TEXT;
