import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DEFAULT_STUDY_COURSES } from '@/lib/study-samples';
import { StudyValidationError, parseJsonBody, parseIsoDate, type StudySettingsDTO } from '@/lib/study-contract';
import { serializeCard, serializeReview, localDateKey, getDateRangeForTimezone, calculateStudyStats, buildDueQueue, schedulerFromSettings, type StudyCardRecord, type StudyReviewRecord } from '@/lib/study-backend';

export const cardInclude = {
  course: { select: { id: true, name: true } },
  chapter: { select: { id: true, name: true } },
} as const;

export function apiError(error: unknown, fallback = '请求失败') {
  if (error instanceof StudyValidationError) {
    return NextResponse.json({ message: error.message, field: error.field }, { status: 400 });
  }
  const code = (error as { code?: string } | null)?.code;
  if (code === 'STUDY_BUSY') return NextResponse.json({ message: '复习保存繁忙，请重试' }, { status: 503, headers: { 'Retry-After': '1' } });
  if (code === 'P2002') return NextResponse.json({ message: '数据已存在' }, { status: 409 });
  if (code === 'P2025') return NextResponse.json({ message: '数据不存在' }, { status: 404 });
  console.error('[study api]', error);
  return NextResponse.json({ message: fallback }, { status: 500 });
}

export function unauthorized() {
  return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new StudyValidationError('请求体必须是有效JSON');
  }
  return parseJsonBody<T>(body);
}

export function numericQuery(value: string | null, name: string, fallback: number, min: number, max: number): number {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new StudyValidationError(`${name}无效`, name);
  return parsed;
}

export async function ensureStudySettings(userId: string) {
  const existing = await prisma.studySettings.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.studySettings.create({ data: { userId, defaultsInitialized: false } });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return prisma.studySettings.findUniqueOrThrow({ where: { userId } });
    }
    throw error;
  }
}

/** Add empty starter trees once; never insert examples or resurrect deletions. */
export async function ensureDefaultCourses(userId: string): Promise<void> {
  const settings = await ensureStudySettings(userId);
  if (settings.defaultsInitialized) return;
  await prisma.$transaction(async tx => {
    const claim = await tx.studySettings.updateMany({ where: { userId, defaultsInitialized: false }, data: { defaultsInitialized: true } });
    if (!claim.count) return;
    for (const definition of DEFAULT_STUDY_COURSES) {
      const course = await tx.studyCourse.upsert({ where: { userId_name: { userId, name: definition.name } }, update: {}, create: { userId, name: definition.name, subjectKey: definition.subjectKey } });
      for (const [order, chapter] of definition.chapters.entries()) {
        await tx.studyChapter.upsert({ where: { courseId_name: { courseId: course.id, name: chapter.name } }, update: {}, create: { courseId: course.id, name: chapter.name, order } });
      }
    }
  }, { timeout: 10_000 });
}

export function settingsDto(settings: Record<string, unknown>): StudySettingsDTO {
  return {
    userId: String(settings.userId),
    dailyNewLimit: Number(settings.dailyNewLimit),
    dailyReviewLimit: Number(settings.dailyReviewLimit),
    relearnMinutes: Number(settings.relearnMinutes),
    initialGoodDays: Number(settings.initialGoodDays),
    initialEasyDays: Number(settings.initialEasyDays),
    hardMultiplier: Number(settings.hardMultiplier),
    easyMultiplier: Number(settings.easyMultiplier),
    maxIntervalDays: Number(settings.maxIntervalDays),
    examDate: settings.examDate ? new Date(settings.examDate as Date).toISOString() : null,
    timezone: String(settings.timezone),
    theme: settings.theme as StudySettingsDTO['theme'],
    defaultsInitialized: Boolean(settings.defaultsInitialized),
  };
}

export async function findOwnedCourse(userId: string, courseId: string) {
  return prisma.studyCourse.findFirst({ where: { id: courseId, userId } });
}

export async function findOwnedCard(userId: string, cardId: string) {
  return prisma.memoryCard.findFirst({ where: { id: cardId, userId }, include: cardInclude });
}

export async function findOwnedChapter(userId: string, chapterId: string) {
  return prisma.studyChapter.findFirst({ where: { id: chapterId, course: { userId } } });
}

export async function ownedCardData(userId: string) {
  const [cards, reviews] = await Promise.all([
    prisma.memoryCard.findMany({ where: { userId }, include: cardInclude }),
    prisma.memoryReview.findMany({ where: { userId }, orderBy: [{ reviewedAt: 'desc' }, { reviewOrder: 'desc' }, { id: 'desc' }] }),
  ]);
  return { cards: cards as unknown as StudyCardRecord[], reviews: reviews as unknown as StudyReviewRecord[] };
}

export async function todayQuota(userId: string, now = new Date()) {
  const settings = await ensureStudySettings(userId);
  const { cards, reviews } = await ownedCardData(userId);
  const date = localDateKey(now, settings.timezone);
  const todayReviews = reviews.filter(review => localDateKey(review.reviewedAt, settings.timezone) === date);
  const firstReviewIds = new Set<string>();
  const seen = new Set<string>();
  for (const review of [...reviews].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime() || a.id.localeCompare(b.id))) {
    if (!seen.has(review.cardId)) { seen.add(review.cardId); firstReviewIds.add(review.id); }
  }
  return {
    settings,
    cards,
    reviews,
    todayNewUsed: todayReviews.filter(review => firstReviewIds.has(review.id)).length,
    todayReviewsUsed: todayReviews.filter(review => !firstReviewIds.has(review.id)).length,
  };
}

export function serializeCardWithLatest(card: StudyCardRecord, reviews?: StudyReviewRecord[]) {
  if (!reviews) return serializeCard(card);
  const latest = reviews.filter(review => review.cardId === card.id).sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime() || (b.reviewOrder ?? 0) - (a.reviewOrder ?? 0) || b.id.localeCompare(a.id))[0] ?? null;
  return serializeCard(card, latest);
}

export async function cardWithReviews(userId: string, cardId: string) {
  const card = await findOwnedCard(userId, cardId);
  if (!card) return null;
  const reviews = await prisma.memoryReview.findMany({ where: { userId, cardId }, orderBy: [{ reviewedAt: 'desc' }, { reviewOrder: 'desc' }, { id: 'desc' }] });
  return { card: card as unknown as StudyCardRecord, reviews: reviews as unknown as StudyReviewRecord[] };
}

export function validateObservedReviewTime(value: unknown, createdAt: Date, now = new Date()): Date {
  const parsed = value === undefined ? now : parseIsoDate(value, 'reviewedAt', false);
  if (!(parsed instanceof Date)) throw new StudyValidationError('reviewedAt无效', 'reviewedAt');
  if (parsed.getTime() > now.getTime() + 5 * 60 * 1000) throw new StudyValidationError('reviewedAt不能是未来时间', 'reviewedAt');
  if (parsed.getTime() < createdAt.getTime()) throw new StudyValidationError('reviewedAt不能早于卡片创建时间', 'reviewedAt');
  return parsed;
}

export { buildDueQueue, calculateStudyStats, getDateRangeForTimezone, schedulerFromSettings, serializeCard, serializeReview };
