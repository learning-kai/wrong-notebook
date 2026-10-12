import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { parseTags } from '@/lib/study-scheduler';

export async function GET(req: Request) {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  const url = new URL(req.url);
  const courseId = url.searchParams.get('courseId') || undefined;
  const cards = await prisma.memoryCard.findMany({
    where: { userId: user.id, ...(courseId ? { courseId } : {}) },
    include: { course: true, chapter: true },
    orderBy: { createdAt: 'asc' },
  });
  const payload = cards.map(card => ({ ...card, tags: parseTags(card.tags) }));
  const format = url.searchParams.get('format') || 'json';
  if (format === 'csv') {
    const headers = ['title', 'course', 'chapter', 'cardType', 'prompt', 'answer', 'explanation', 'conditions', 'pitfalls', 'tags', 'source', 'notes'];
    const escape = (x: unknown) => `"${String(x ?? '').replaceAll('"', '""').replaceAll('\n', ' ')}"`;
    const rows = payload.map(card => [card.title, card.course.name, card.chapter?.name, card.cardType, card.prompt, card.answer, card.explanation, card.conditions, card.pitfalls, card.tags.join('，'), card.source, card.notes].map(escape).join(','));
    return new Response([headers.join(','), ...rows].join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="study-cards.csv"' } });
  }
  return new Response(JSON.stringify(payload, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="study-cards.json"' } });
}
