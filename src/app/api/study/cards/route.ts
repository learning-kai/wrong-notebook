import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { apiError, cardInclude, findOwnedCourse, numericQuery, readJson, unauthorized } from '@/lib/study-backend-api';
import { buildCardData, serializeCard } from '@/lib/study-backend';
import { parseIsoDate, StudyValidationError } from '@/lib/study-contract';

export async function GET(request: Request) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const url = new URL(request.url);
    const courseId = url.searchParams.get('courseId') || undefined;
    const chapterId = url.searchParams.get('chapterId') || undefined;
    const cardType = url.searchParams.get('cardType') || undefined;
    const tag = url.searchParams.get('tag') || undefined;
    const search = url.searchParams.get('search');
    const limit = numericQuery(url.searchParams.get('limit'), 'limit', 100, 1, 500);
    const offset = numericQuery(url.searchParams.get('offset'), 'offset', 0, 0, 1_000_000);
    const suspendedParam = url.searchParams.get('suspended');
    if (suspendedParam !== null && suspendedParam !== 'true' && suspendedParam !== 'false') throw new StudyValidationError('suspended无效', 'suspended');
    const cards = await prisma.memoryCard.findMany({
      where: {
        userId: user.id,
        ...(courseId ? { courseId } : {}),
        ...(chapterId ? { chapterId } : {}),
        ...(cardType ? { cardType } : {}),
        ...(suspendedParam === null ? {} : { suspended: suspendedParam === 'true' }),
        ...(search ? { OR: [
          { title: { contains: search } }, { prompt: { contains: search } }, { answer: { contains: search } },
          { formula: { contains: search } }, { source: { contains: search } }, { notes: { contains: search } },
        ] } : {}),
      },
      include: cardInclude,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const filtered = tag ? cards.filter(card => {
      try { return Array.isArray(JSON.parse(card.tags || '[]')) && JSON.parse(card.tags || '[]').includes(tag); } catch { return false; }
    }) : cards;
    const page = filtered.slice(offset, offset + limit);
    // Only request one owned review per returned card, never the user's history.
    const withReviews = page.length ? await prisma.memoryCard.findMany({
      where: { userId: user.id, id: { in: page.map(card => card.id) } },
      select: { id: true, reviews: { where: { userId: user.id }, orderBy: [{ reviewedAt: 'desc' }, { reviewOrder: 'desc' }, { id: 'desc' }], take: 1 } },
    }) : [];
    const latest = new Map(withReviews.map(card => [card.id, card.reviews[0] ?? null]));
    return NextResponse.json(page.map(card => serializeCard(card as never, latest.get(card.id) as never ?? null)));
  } catch (error) {
    return apiError(error, '读取记忆卡失败');
  }
}

export async function POST(request: Request) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.courseId !== 'string' || !body.courseId) throw new StudyValidationError('courseId不能为空', 'courseId');
    const course = await findOwnedCourse(user.id, body.courseId);
    if (!course) return NextResponse.json({ message: '课程不存在' }, { status: 404 });
    const data = buildCardData(body as never, body.courseId);
    if (data.chapterId) {
      const chapter = await prisma.studyChapter.findFirst({ where: { id: data.chapterId as string, courseId: body.courseId } });
      if (!chapter) return NextResponse.json({ message: '章节不属于该课程' }, { status: 400 });
    }
    if (body.dueAt !== undefined) data.dueAt = parseIsoDate(body.dueAt, 'dueAt', false);
    if (body.suspended !== undefined) {
      if (typeof body.suspended !== 'boolean') throw new StudyValidationError('suspended必须是布尔值', 'suspended');
      data.suspended = body.suspended;
    }
    const card = await prisma.memoryCard.create({ data: { ...data, userId: user.id } as never, include: cardInclude });
    return NextResponse.json(serializeCard(card as never), { status: 201 });
  } catch (error) {
    return apiError(error, '创建记忆卡失败');
  }
}
