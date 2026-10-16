import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { buildCardData, serializeCard, validateSettingsPatch } from '@/lib/study-backend';
import { RATINGS, StudyValidationError, parseIsoDate } from '@/lib/study-contract';
import { apiError, ensureStudySettings, readJson, settingsDto, unauthorized } from '@/lib/study-backend-api';
import { exactCardSignature } from '@/lib/study-backend-transfer';

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const MAX_BACKUP_CARDS = 50_000;
const MAX_INT32 = 2_147_483_647;
// Leave one Int32 value available for the next serialized review write.
const MAX_REVIEW_ORDER = MAX_INT32 - 1;
const MAX_RESPONSE_MS = 86_400_000;
const REVIEW_MODES = new Set(['recall', 'zh-en', 'en-zh', 'formula', 'cloze', 'formula-cloze', 'condition-conclusion', 'conclusion-condition', 'compare', 'steps', 'paragraph', 'sentence-order', 'sentence-compose', 'template-match', 'transform', 'inverse-transform', 'roc', 'initial-final']);

type Backup = {
  schemaVersion: number;
  exportedAt: string;
  settings: unknown;
  courses: unknown[];
  chapters: unknown[];
  cards: unknown[];
  reviews: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBackup(data: unknown): Backup {
  if (typeof data !== 'string') throw new StudyValidationError('data必须是JSON字符串', 'data');
  if (Buffer.byteLength(data, 'utf8') > MAX_BACKUP_BYTES) throw new StudyValidationError('备份文件过大');
  let parsed: unknown;
  try { parsed = JSON.parse(data); } catch { throw new StudyValidationError('备份JSON无效'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new StudyValidationError('备份格式无效');
  const backup = parsed as Partial<Backup>;
  if (backup.schemaVersion !== 1) throw new StudyValidationError('不支持的备份版本', 'schemaVersion');
  for (const field of ['courses', 'chapters', 'cards', 'reviews'] as const) if (!Array.isArray(backup[field])) throw new StudyValidationError(`${field}必须是数组`, field);
  if ((backup.cards?.length ?? 0) > MAX_BACKUP_CARDS) throw new StudyValidationError('备份卡片数量超过上限');
  return {
    schemaVersion: 1,
    exportedAt: String(backup.exportedAt ?? ''),
    settings: backup.settings,
    courses: backup.courses as unknown[],
    chapters: backup.chapters as unknown[],
    cards: backup.cards as unknown[],
    reviews: backup.reviews as unknown[],
  };
}

function isoOrNull(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  return parseIsoDate(value, field, false) as Date;
}

function isoRequired(value: unknown, field: string): Date | undefined {
  if (value === undefined) return undefined;
  if (value === null) throw new StudyValidationError(`${field}必须是ISO日期`, field);
  return parseIsoDate(value, field, false) as Date;
}

function reviewSignature(cardId: string, row: Record<string, unknown>, includeSourceId = true): string {
  return JSON.stringify([
    cardId,
    includeSourceId && typeof row.id === 'string' ? row.id : null,
    typeof row.reviewOrder === 'number' ? row.reviewOrder : 0,
    typeof row.clientEventId === 'string' ? row.clientEventId : null,
    row.rating ?? null,
    row.mode ?? 'recall',
    row.responseText ?? null,
    row.note ?? null,
    row.responseMs ?? null,
    row.previousDueAt ?? null,
    row.nextDueAt ?? null,
    row.reviewedAt ?? null,
  ]);
}

async function validateBackup(userId: string, backup: Backup) {
  const errors: Array<{ row: number; field?: string; message: string }> = [];
  if (!isRecord(backup.settings)) {
    errors.push({ row: 0, field: 'settings', message: 'settings必须是对象' });
  } else {
    try { validateSettingsPatch(backup.settings); } catch (error) { errors.push({ row: 0, field: (error as StudyValidationError).field, message: error instanceof Error ? error.message : 'settings无效' }); }
  }
  const validateTimestamp = (row: Record<string, unknown>, field: string, rowNumber: number, nullable = true) => {
    if (row[field] !== undefined) {
      try { (nullable ? isoOrNull : isoRequired)(row[field], field); } catch (error) { errors.push({ row: rowNumber, field, message: error instanceof Error ? error.message : `${field}无效` }); }
    }
  };
  const courseNames = new Map<string, string>();
  for (let i = 0; i < backup.courses.length; i += 1) {
    const row = backup.courses[i];
    if (!isRecord(row)) { errors.push({ row: i + 1, field: 'courses', message: '课程行必须是对象' }); continue; }
    if (typeof row.id !== 'string' || typeof row.name !== 'string' || !row.name.trim()) errors.push({ row: i + 1, field: 'courses', message: '课程缺少id或name' });
    for (const field of ['description', 'subjectKey'] as const) if (row[field] !== undefined && row[field] !== null && typeof row[field] !== 'string') errors.push({ row: i + 1, field, message: `${field}必须是字符串或null` });
    if (row.examYear !== undefined && row.examYear !== null && (typeof row.examYear !== 'number' || !Number.isInteger(row.examYear) || row.examYear < 1900 || row.examYear > 3000)) errors.push({ row: i + 1, field: 'examYear', message: 'examYear必须是1900到3000的整数或null' });
    validateTimestamp(row, 'createdAt', i + 1, false); validateTimestamp(row, 'updatedAt', i + 1, false);
    if (typeof row.id === 'string' && typeof row.name === 'string' && row.name.trim()) courseNames.set(row.id, row.name);
  }
  const chapterNames = new Map<string, { courseId: string; name: string }>();
  for (let i = 0; i < backup.chapters.length; i += 1) {
    const row = backup.chapters[i];
    if (!isRecord(row)) { errors.push({ row: i + 1, field: 'chapters', message: '章节行必须是对象' }); continue; }
    if (typeof row.id !== 'string' || typeof row.courseId !== 'string' || typeof row.name !== 'string' || !row.name.trim() || !courseNames.has(row.courseId)) errors.push({ row: i + 1, field: 'chapters', message: '章节引用无效' });
    if (row.order !== undefined && (typeof row.order !== 'number' || !Number.isInteger(row.order) || row.order < -2147483648 || row.order > 2147483647)) errors.push({ row: i + 1, field: 'order', message: 'order必须是32位整数' });
    validateTimestamp(row, 'createdAt', i + 1, false); validateTimestamp(row, 'updatedAt', i + 1, false);
    if (typeof row.id === 'string' && typeof row.courseId === 'string' && typeof row.name === 'string' && row.name.trim() && courseNames.has(row.courseId)) chapterNames.set(row.id, { courseId: row.courseId, name: row.name });
  }
  const normalized: Array<{ oldId: string; courseOldId: string; chapterOldId: string | null; data: Record<string, unknown>; scheduling: Record<string, unknown> }> = [];
  for (let i = 0; i < backup.cards.length; i += 1) {
    const row = backup.cards[i];
    if (!isRecord(row)) { errors.push({ row: i + 1, field: 'cards', message: '卡片行必须是对象' }); continue; }
    try {
      if (typeof row.id !== 'string' || typeof row.courseId !== 'string' || !courseNames.has(row.courseId)) throw new StudyValidationError('卡片课程引用无效', 'courseId');
      if (row.chapterId !== undefined && row.chapterId !== null && typeof row.chapterId !== 'string') throw new StudyValidationError('chapterId必须是字符串或null', 'chapterId');
      const chapterOldId = row.chapterId === null || row.chapterId === undefined ? null : row.chapterId;
      if (chapterOldId && (!chapterNames.has(chapterOldId) || chapterNames.get(chapterOldId)?.courseId !== row.courseId)) throw new StudyValidationError('卡片章节引用无效', 'chapterId');
      const data = buildCardData({ ...row, chapterId: chapterOldId } as never, row.courseId);
      isoRequired(row.dueAt, 'dueAt'); isoOrNull(row.lastReviewedAt, 'lastReviewedAt');
      isoRequired(row.createdAt, 'createdAt'); isoRequired(row.updatedAt, 'updatedAt');
      if (row.intervalDays !== undefined && (typeof row.intervalDays !== 'number' || !Number.isFinite(row.intervalDays) || row.intervalDays < 0)) throw new StudyValidationError('intervalDays无效', 'intervalDays');
      if (row.easeFactor !== undefined && (typeof row.easeFactor !== 'number' || !Number.isFinite(row.easeFactor) || row.easeFactor < 1.3)) throw new StudyValidationError('easeFactor无效', 'easeFactor');
      for (const field of ['repetitions', 'lapses'] as const) if (row[field] !== undefined && (typeof row[field] !== 'number' || !Number.isInteger(row[field]) || row[field] < 0 || row[field] > MAX_INT32)) throw new StudyValidationError(`${field}无效`, field);
      if (row.suspended !== undefined && typeof row.suspended !== 'boolean') throw new StudyValidationError('suspended无效', 'suspended');
      normalized.push({ oldId: row.id, courseOldId: row.courseId, chapterOldId, data, scheduling: row });
    } catch (error) {
      errors.push({ row: i + 1, field: (error as StudyValidationError).field, message: error instanceof Error ? error.message : '卡片无效' });
    }
  }
  const reviewRows = backup.reviews.map((value, index) => {
    if (!isRecord(value)) { errors.push({ row: index + 1, field: 'reviews', message: '复习记录行必须是对象' }); return null; }
    const row = value;
    try {
      if (row.id !== undefined && (typeof row.id !== 'string' || !row.id)) throw new StudyValidationError('评论id无效', 'id');
      if (typeof row.cardId !== 'string' || !normalized.some(card => card.oldId === row.cardId)) throw new StudyValidationError('评论卡片引用无效', 'cardId');
      if (typeof row.rating !== 'string' || !RATINGS.includes(row.rating as never)) throw new StudyValidationError('评论评价无效', 'rating');
      if (row.mode !== undefined && (typeof row.mode !== 'string' || !row.mode || row.mode.length > 64 || !REVIEW_MODES.has(row.mode))) throw new StudyValidationError('评论模式无效', 'mode');
      if (row.reviewOrder !== undefined && (typeof row.reviewOrder !== 'number' || !Number.isInteger(row.reviewOrder) || row.reviewOrder < 0 || row.reviewOrder > MAX_REVIEW_ORDER)) throw new StudyValidationError('reviewOrder无效', 'reviewOrder');
      if (row.responseText !== undefined && row.responseText !== null && typeof row.responseText !== 'string') throw new StudyValidationError('responseText必须是字符串', 'responseText');
      if (row.note !== undefined && row.note !== null && typeof row.note !== 'string') throw new StudyValidationError('note必须是字符串', 'note');
      if (row.responseMs !== undefined && row.responseMs !== null && (typeof row.responseMs !== 'number' || !Number.isInteger(row.responseMs) || row.responseMs < 0 || row.responseMs > MAX_RESPONSE_MS)) throw new StudyValidationError('responseMs无效', 'responseMs');
      if (row.clientEventId !== undefined && row.clientEventId !== null && (typeof row.clientEventId !== 'string' || !row.clientEventId || row.clientEventId.length > 255)) throw new StudyValidationError('clientEventId无效', 'clientEventId');
      isoOrNull(row.previousDueAt, 'previousDueAt'); isoOrNull(row.nextDueAt, 'nextDueAt'); isoRequired(row.reviewedAt, 'reviewedAt');
      return { row, index };
    } catch (error) {
      errors.push({ row: index + 1, field: (error as StudyValidationError).field, message: error instanceof Error ? error.message : '评论无效' });
      return null;
    }
  }).filter((value): value is { row: Record<string, unknown>; index: number } => Boolean(value));
  return { errors, normalized, reviewRows, courseNames, chapterNames, courses: backup.courses.filter(isRecord), chapters: backup.chapters.filter(isRecord), settings: isRecord(backup.settings) ? backup.settings : {} };
}

export async function GET() {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const [settings, courses, cards, reviews] = await Promise.all([
      ensureStudySettings(user.id),
      prisma.studyCourse.findMany({ where: { userId: user.id }, include: { chapters: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      prisma.memoryCard.findMany({ where: { userId: user.id }, include: { course: { select: { id: true, name: true } }, chapter: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      prisma.memoryReview.findMany({ where: { userId: user.id }, orderBy: [{ reviewedAt: 'asc' }, { id: 'asc' }] }),
    ]);
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: settingsDto(settings as never),
      courses: courses.map(course => ({ id: course.id, name: course.name, description: course.description, subjectKey: course.subjectKey, examYear: course.examYear, createdAt: course.createdAt.toISOString(), updatedAt: course.updatedAt.toISOString() })),
      chapters: courses.flatMap(course => course.chapters.map(chapter => ({ id: chapter.id, courseId: course.id, name: chapter.name, order: chapter.order, createdAt: chapter.createdAt.toISOString(), updatedAt: chapter.updatedAt.toISOString() }))),
      cards: cards.map(card => ({
        ...serializeCard(card as never),
        dueAt: card.dueAt.toISOString(), lastReviewedAt: card.lastReviewedAt?.toISOString() ?? null,
      })),
      reviews: reviews.map(review => ({ id: review.id, cardId: review.cardId, reviewOrder: review.reviewOrder, rating: review.rating, mode: review.mode, responseText: review.responseText, note: review.note, responseMs: review.responseMs, clientEventId: review.clientEventId, previousDueAt: review.previousDueAt?.toISOString() ?? null, nextDueAt: review.nextDueAt?.toISOString() ?? null, reviewedAt: review.reviewedAt.toISOString() })),
    };
    return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="study-backup.json"' } });
  } catch (error) {
    return apiError(error, '创建备份失败');
  }
}

export async function POST(request: Request) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (body.action !== 'preview' && body.action !== 'restore') throw new StudyValidationError('action必须是preview或restore', 'action');
    const backup = parseBackup(body.data);
    const currentSettings = await ensureStudySettings(user.id);
    const validation = await validateBackup(user.id, backup);
    const preview = {
      schemaVersion: backup.schemaVersion,
      valid: validation.errors.length === 0,
      errors: validation.errors,
      warnings: [] as string[],
      counts: { courses: backup.courses.length, chapters: backup.chapters.length, cards: validation.normalized.length, reviews: validation.reviewRows.length },
    };
    if (body.action === 'preview') return NextResponse.json(preview);
    if (validation.errors.length) return NextResponse.json({ message: '备份存在错误，未恢复任何数据', preview }, { status: 400 });

    const result = await prisma.$transaction(async tx => {
      const courseIds = new Map<string, string>();
      const chapterIds = new Map<string, string>();
      for (const row of validation.courses) {
        const found = await tx.studyCourse.findFirst({ where: { userId: user.id, name: row.name as string } });
        const course = found ?? await tx.studyCourse.create({ data: { userId: user.id, name: row.name as string, description: (row.description as string | null) ?? null, subjectKey: (row.subjectKey as string | null) ?? null, examYear: (row.examYear as number | null) ?? null, createdAt: isoOrNull(row.createdAt, 'createdAt') ?? undefined, updatedAt: isoOrNull(row.updatedAt, 'updatedAt') ?? undefined } });
        courseIds.set(row.id as string, course.id);
      }
      for (const row of validation.chapters) {
        const courseId = courseIds.get(row.courseId as string);
        if (!courseId) throw new StudyValidationError('章节课程映射失败');
        const found = await tx.studyChapter.findFirst({ where: { courseId, name: row.name as string } });
        const chapter = found ?? await tx.studyChapter.create({ data: { courseId, name: row.name as string, order: Number(row.order ?? 0), createdAt: isoOrNull(row.createdAt, 'createdAt') ?? undefined, updatedAt: isoOrNull(row.updatedAt, 'updatedAt') ?? undefined } });
        chapterIds.set(row.id as string, chapter.id);
      }
      const oldToNewCard = new Map<string, string>();
      const signatures = new Map<string, string>();
      const current = await tx.memoryCard.findMany({ where: { userId: user.id } });
      for (const card of current) signatures.set(`${card.courseId}:${card.chapterId ?? ''}:${exactCardSignature(card as never)}`, card.id);
      let importedCards = 0;
      let skippedCards = 0;
      for (const item of validation.normalized) {
        const courseId = courseIds.get(item.courseOldId)!;
        const chapterId = item.chapterOldId ? chapterIds.get(item.chapterOldId) ?? null : null;
        const signature = `${courseId}:${chapterId ?? ''}:${exactCardSignature(item.data)}`;
        const existingId = signatures.get(signature);
        if (existingId) { oldToNewCard.set(item.oldId, existingId); skippedCards += 1; continue; }
        const row = item.scheduling;
        const card = await tx.memoryCard.create({ data: { ...item.data, userId: user.id, courseId, chapterId, dueAt: isoRequired(row.dueAt, 'dueAt') ?? new Date(), lastReviewedAt: isoOrNull(row.lastReviewedAt, 'lastReviewedAt'), intervalDays: Number(row.intervalDays ?? 0), easeFactor: Number(row.easeFactor ?? 2.5), repetitions: Number(row.repetitions ?? 0), lapses: Number(row.lapses ?? 0), suspended: Boolean(row.suspended), createdAt: isoRequired(row.createdAt, 'createdAt') ?? undefined, updatedAt: isoRequired(row.updatedAt, 'updatedAt') ?? undefined } as never });
        signatures.set(signature, card.id); oldToNewCard.set(item.oldId, card.id); importedCards += 1;
      }
      let importedReviews = 0;
      let skippedReviews = 0;
      const reviewSignatures = new Set<string>();
      const reviewFallbackSignatures = new Set<string>();
      const reviewSourceIds = new Set<string>();
      const clientEventIds = new Set<string>();
      const existingReviews = await tx.memoryReview.findMany({ where: { userId: user.id } });
      for (const review of existingReviews) {
        reviewSignatures.add(reviewSignature(review.cardId, review as never));
        reviewFallbackSignatures.add(reviewSignature(review.cardId, review as never, false));
        reviewSourceIds.add(review.id);
        if (review.clientEventId) clientEventIds.add(review.clientEventId);
      }
      for (const review of validation.reviewRows) {
        const cardId = oldToNewCard.get(review.row.cardId as string);
        if (!cardId) continue;
        const sourceId = typeof review.row.id === 'string' ? review.row.id : null;
        // Review IDs are global primary keys. Bind restored identities to the
        // target user, preserving repeat-restore idempotency without colliding
        // with another account's live source history.
        const targetId = sourceId ? `restore-${createHash('sha256').update(JSON.stringify([user.id, sourceId])).digest('hex')}` : null;
        const sourceClientEventId = typeof review.row.clientEventId === 'string' && review.row.clientEventId ? review.row.clientEventId : null;
        const signature = reviewSignature(cardId, review.row, true);
        const fallbackSignature = reviewSignature(cardId, review.row, false);
        if ((sourceId && (reviewSourceIds.has(sourceId) || reviewSourceIds.has(targetId!))) || (sourceClientEventId && clientEventIds.has(sourceClientEventId)) || (sourceId ? reviewSignatures.has(signature) : reviewFallbackSignatures.has(fallbackSignature))) { skippedReviews += 1; continue; }
        const clientEventId = sourceClientEventId;
        await tx.memoryReview.create({ data: { ...(targetId ? { id: targetId } : {}), userId: user.id, cardId, reviewOrder: typeof review.row.reviewOrder === 'number' ? review.row.reviewOrder : 0, rating: review.row.rating as string, mode: review.row.mode === undefined ? 'recall' : review.row.mode as string, responseText: (review.row.responseText as string | null) ?? null, note: (review.row.note as string | null) ?? null, responseMs: review.row.responseMs == null ? null : review.row.responseMs as number, clientEventId, previousDueAt: isoOrNull(review.row.previousDueAt, 'previousDueAt'), nextDueAt: isoOrNull(review.row.nextDueAt, 'nextDueAt'), reviewedAt: isoRequired(review.row.reviewedAt, 'reviewedAt') ?? new Date() } });
        reviewSignatures.add(signature);
        reviewFallbackSignatures.add(fallbackSignature);
        if (sourceId) reviewSourceIds.add(sourceId);
        if (targetId) reviewSourceIds.add(targetId);
        if (clientEventId) clientEventIds.add(clientEventId);
        importedReviews += 1;
      }
      if (Object.keys(validation.settings).length) {
        await tx.studySettings.update({ where: { userId: currentSettings.userId }, data: validateSettingsPatch(validation.settings) });
      }
      return { imported: importedCards, skipped: skippedCards, reviews: importedReviews, skippedReviews };
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, '恢复备份失败');
  }
}
