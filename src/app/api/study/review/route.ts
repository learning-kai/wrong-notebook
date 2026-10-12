import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { scheduleReview, type RecallRating, parseTags } from '@/lib/study-scheduler';

const RATINGS = new Set<RecallRating>(['again', 'hard', 'good', 'easy']);

export async function GET(req: Request) {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 100);
  const courseId = url.searchParams.get('courseId') || undefined;
  const cards = await prisma.memoryCard.findMany({
    where: { userId: user.id, suspended: false, dueAt: { lte: new Date() }, ...(courseId ? { courseId } : {}) },
    include: { course: true, chapter: true },
    orderBy: { dueAt: 'asc' },
    take: limit,
  });
  return NextResponse.json(cards.map(card => ({ ...card, tags: parseTags(card.tags) })));
}

export async function POST(req: Request) {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  const body = await req.json();
  const rating = body.rating as RecallRating;
  if (!RATINGS.has(rating)) return NextResponse.json({ message: '无效的评价' }, { status: 400 });
  const card = await prisma.memoryCard.findFirst({ where: { id: String(body.cardId || ''), userId: user.id } });
  if (!card) return NextResponse.json({ message: '卡片不存在' }, { status: 404 });
  const now = new Date();
  const scheduled = scheduleReview(card, rating, now);
  const updated = await prisma.$transaction(async tx => {
    await tx.memoryReview.create({
      data: {
        userId: user.id,
        cardId: card.id,
        rating,
        mode: String(body.mode || 'recall'),
        previousDueAt: card.dueAt,
        nextDueAt: scheduled.dueAt,
        responseMs: body.responseMs ? Number(body.responseMs) : null,
        note: body.note ? String(body.note) : null,
      },
    });
    return tx.memoryCard.update({ where: { id: card.id }, data: { ...scheduled, lastReviewedAt: now } });
  });
  return NextResponse.json(updated);
}
