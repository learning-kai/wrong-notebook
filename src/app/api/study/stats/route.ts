import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';

export async function GET() {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  const now = new Date();
  const [total, due, reviewsToday, courses, recentReviews] = await Promise.all([
    prisma.memoryCard.count({ where: { userId: user.id, suspended: false } }),
    prisma.memoryCard.count({ where: { userId: user.id, suspended: false, dueAt: { lte: now } } }),
    prisma.memoryReview.count({ where: { userId: user.id, reviewedAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
    prisma.studyCourse.findMany({ where: { userId: user.id }, include: { _count: { select: { cards: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.memoryReview.findMany({ where: { userId: user.id }, orderBy: { reviewedAt: 'desc' }, take: 100 }),
  ]);
  const good = recentReviews.filter(x => x.rating === 'good' || x.rating === 'easy').length;
  const accuracy = recentReviews.length ? Math.round((good / recentReviews.length) * 100) : 0;
  return NextResponse.json({ total, due, reviewsToday, accuracy, courses: courses.map(c => ({ id: c.id, name: c.name, count: c._count.cards })) });
}
