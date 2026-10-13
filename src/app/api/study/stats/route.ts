import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';

export async function GET() {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  const now = new Date();
  const [total, due, reviewsToday, courses, recentReviews, recentFailures] = await Promise.all([
    prisma.memoryCard.count({ where: { userId: user.id, suspended: false } }),
    prisma.memoryCard.count({ where: { userId: user.id, suspended: false, dueAt: { lte: now } } }),
    prisma.memoryReview.count({ where: { userId: user.id, reviewedAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
    prisma.studyCourse.findMany({ where: { userId: user.id }, include: { _count: { select: { cards: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.memoryReview.findMany({ where: { userId: user.id }, orderBy: { reviewedAt: 'desc' }, take: 100 }),
    prisma.memoryReview.findMany({ where: { userId: user.id, rating: { in: ['again', 'hard'] } }, include: { card: { include: { course: true, chapter: true } } }, orderBy: { reviewedAt: 'desc' }, take: 200 }),
  ]);
  const good = recentReviews.filter(x => x.rating === 'good' || x.rating === 'easy').length;
  const accuracy = recentReviews.length ? Math.round((good / recentReviews.length) * 100) : 0;
  const weakMap = new Map<string, { name: string; course: string; count: number }>();
  for (const review of recentFailures) {
    const name = review.card.chapter?.name || '未分章节';
    const key = `${review.card.courseId}:${review.card.chapterId || 'none'}`;
    const old = weakMap.get(key) || { name, course: review.card.course.name, count: 0 };
    old.count += review.rating === 'again' ? 2 : 1;
    weakMap.set(key, old);
  }
  const weakChapters = [...weakMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  return NextResponse.json({ total, due, reviewsToday, accuracy, weakChapters, courses: courses.map(c => ({ id: c.id, name: c.name, count: c._count.cards })) });
}
