import { NextResponse } from 'next/server';
import { getStudyUser } from '@/lib/study-auth';
import { RATINGS, StudyValidationError } from '@/lib/study-contract';
import { scheduleReviewWithSettings } from '@/lib/study-scheduler';
import { buildDueQueue, getDateRangeForTimezone, serializeCard } from '@/lib/study-backend';
import { assertReviewWrite, reviewTransaction } from '@/lib/study-backend-review';
import { apiError, cardInclude, ensureStudySettings, numericQuery, ownedCardData, readJson, schedulerFromSettings, todayQuota, unauthorized, validateObservedReviewTime } from '@/lib/study-backend-api';

const VALID_MODES = new Set(['recall', 'zh-en', 'en-zh', 'formula', 'cloze', 'formula-cloze', 'condition-conclusion', 'conclusion-condition', 'compare', 'steps', 'paragraph', 'sentence-order', 'sentence-compose', 'template-match', 'transform', 'inverse-transform', 'roc', 'initial-final']);

export async function GET(request: Request) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const url = new URL(request.url);
    const mode = (url.searchParams.get('mode') || 'due') as 'due' | 'mistakes' | 'today-mistakes' | 'random' | 'all';
    if (!['due', 'mistakes', 'today-mistakes', 'random', 'all'].includes(mode)) throw new StudyValidationError('mode无效', 'mode');
    const limit = numericQuery(url.searchParams.get('limit'), 'limit', 20, 1, 500);
    const { cards, reviews } = await ownedCardData(user.id);
    const settings = await ensureStudySettings(user.id);
    const quota = await todayQuota(user.id);
    const examDateParam = url.searchParams.get('examDate');
    let examDate: Date | null = null;
    if (examDateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(examDateParam)) throw new StudyValidationError('examDate必须是YYYY-MM-DD日期', 'examDate');
      try { examDate = new Date(getDateRangeForTimezone(examDateParam, settings.timezone).end.getTime() - 1); }
      catch { throw new StudyValidationError('examDate无效', 'examDate'); }
    }
    const queue = buildDueQueue(cards, {
      now: new Date(),
      timezone: settings.timezone,
      mode,
      courseId: url.searchParams.get('courseId') || undefined,
      chapterId: url.searchParams.get('chapterId') || undefined,
      cardType: url.searchParams.get('cardType') || undefined,
      examDate,
      reviews,
      dailyNewLimit: settings.dailyNewLimit,
      dailyReviewLimit: settings.dailyReviewLimit,
      todayNewUsed: quota.todayNewUsed,
      todayReviewsUsed: quota.todayReviewsUsed,
    }).slice(0, limit);
    return NextResponse.json(queue.map(card => {
      const latest = reviews.filter(review => review.cardId === card.id).sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime() || (b.reviewOrder ?? 0) - (a.reviewOrder ?? 0) || b.id.localeCompare(a.id))[0] ?? null;
      return serializeCard(card, latest);
    }));
  } catch (error) {
    return apiError(error, '读取复习队列失败');
  }
}

export async function POST(request: Request) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.cardId !== 'string' || !body.cardId) throw new StudyValidationError('cardId不能为空', 'cardId');
    if (typeof body.rating !== 'string' || !(RATINGS as readonly string[]).includes(body.rating)) throw new StudyValidationError('rating无效', 'rating');
    const mode = body.mode === undefined ? 'recall' : body.mode;
    if (typeof mode !== 'string' || !mode || mode.length > 64) throw new StudyValidationError('mode无效', 'mode');
    if (VALID_MODES.size && mode !== 'recall' && !VALID_MODES.has(mode)) throw new StudyValidationError('mode无效', 'mode');
    const responseText = body.responseText === undefined || body.responseText === null ? null : body.responseText;
    if (responseText !== null && (typeof responseText !== 'string' || responseText.length > 100_000)) throw new StudyValidationError('responseText必须是100000字以内的字符串', 'responseText');
    const note = body.note === undefined || body.note === null ? null : body.note;
    if (note !== null && (typeof note !== 'string' || note.length > 100_000)) throw new StudyValidationError('note必须是100000字以内的字符串', 'note');
    const responseMs = body.responseMs === undefined || body.responseMs === null ? null : body.responseMs;
    if (responseMs !== null && (typeof responseMs !== 'number' || !Number.isInteger(responseMs) || responseMs < 0 || responseMs > 86_400_000)) throw new StudyValidationError('responseMs无效', 'responseMs');
    const clientEventId = body.clientEventId === undefined || body.clientEventId === null ? null : body.clientEventId;
    if (clientEventId !== null && (typeof clientEventId !== 'string' || !clientEventId || clientEventId.length > 255)) throw new StudyValidationError('clientEventId无效', 'clientEventId');

    await ensureStudySettings(user.id);
    const result = await reviewTransaction(async tx => {
      const existing = await tx.memoryCard.findFirst({ where: { id: body.cardId as string, userId: user.id }, include: cardInclude });
      if (!existing) return null;
      if (clientEventId) {
        const already = await tx.memoryReview.findUnique({ where: { userId_clientEventId: { userId: user.id, clientEventId } } });
        if (already) {
          if (already.cardId !== existing.id) throw Object.assign(new Error('clientEventId已用于其他卡片'), { code: 'P2002' });
          const latest = await tx.memoryReview.findFirst({ where: { userId: user.id, cardId: existing.id }, orderBy: [{ reviewedAt: 'desc' }, { reviewOrder: 'desc' }, { id: 'desc' }] });
          return { card: existing, review: already, latest, duplicate: true };
        }
      }
      const settings = await tx.studySettings.findUniqueOrThrow({ where: { userId: user.id } });
      const now = new Date();
      const reviewedAt = validateObservedReviewTime(body.reviewedAt, existing.createdAt, now);
      const scheduleAt = reviewedAt.getTime() > now.getTime() ? now : reviewedAt;
      const late = existing.lastReviewedAt !== null && reviewedAt.getTime() < existing.lastReviewedAt.getTime();
      // Older offline events are history-only: the current schedule is authoritative.
      const scheduled = late ? { dueAt: existing.dueAt } : scheduleReviewWithSettings(existing, body.rating as never, schedulerFromSettings(settings), scheduleAt);
      // Explicitly advance the CAS token even when requests share a millisecond.
      const updatedAt = new Date(Math.max(now.getTime(), existing.updatedAt.getTime() + 1));
      const write = await tx.memoryCard.updateMany({
        where: { id: existing.id, userId: user.id, updatedAt: existing.updatedAt },
        data: { ...scheduled, lastReviewedAt: late ? existing.lastReviewedAt : reviewedAt, updatedAt },
      });
      assertReviewWrite(write.count);
      const order = await tx.memoryReview.aggregate({ where: { userId: user.id, cardId: existing.id }, _max: { reviewOrder: true } });
      const review = await tx.memoryReview.create({ data: {
        reviewOrder: (order._max.reviewOrder ?? 0) + 1,
        userId: user.id, cardId: existing.id, rating: body.rating as string, mode,
        responseText, note, clientEventId, previousDueAt: existing.dueAt,
        nextDueAt: scheduled.dueAt, responseMs, reviewedAt,
      } });
      const card = await tx.memoryCard.findFirstOrThrow({ where: { id: existing.id, userId: user.id }, include: cardInclude });
      const latest = await tx.memoryReview.findFirst({ where: { userId: user.id, cardId: existing.id }, orderBy: [{ reviewedAt: 'desc' }, { reviewOrder: 'desc' }, { id: 'desc' }] });
      return { card, review, latest, duplicate: false };
    });
    if (!result) return NextResponse.json({ message: '卡片不存在' }, { status: 404 });
    return NextResponse.json({
      card: serializeCard(result.card as never, result.latest as never),
      review: {
        id: (result.review as { id: string }).id,
        clientEventId: (result.review as { clientEventId: string | null }).clientEventId,
        nextDueAt: (result.review as { nextDueAt: Date | null }).nextDueAt?.toISOString() ?? null,
      },
      duplicate: result.duplicate,
    });
  } catch (error) {
    return apiError(error, '保存复习记录失败');
  }
}
