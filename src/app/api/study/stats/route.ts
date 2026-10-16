import { getStudyUser } from '@/lib/study-auth';
import { calculateStudyStats } from '@/lib/study-backend';
import { apiError, ensureStudySettings, ownedCardData, unauthorized } from '@/lib/study-backend-api';
import { NextResponse } from 'next/server';

export async function GET() {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const settings = await ensureStudySettings(user.id);
    const [{ cards, reviews }, courses] = await Promise.all([
      ownedCardData(user.id),
      (await import('@/lib/prisma')).prisma.studyCourse.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    ]);
    return NextResponse.json(calculateStudyStats(cards, reviews, { now: new Date(), timezone: settings.timezone, courses }));
  } catch (error) {
    return apiError(error, '读取学习统计失败');
  }
}
