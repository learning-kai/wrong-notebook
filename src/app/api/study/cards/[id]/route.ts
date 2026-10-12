import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { parseTags } from '@/lib/study-scheduler';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.memoryCard.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ message: '卡片不存在' }, { status: 404 });
  const body = await req.json();
  const allowed = ['title', 'cardType', 'prompt', 'answer', 'explanation', 'conditions', 'pitfalls', 'source', 'notes', 'suspended'];
  const data: Record<string, unknown> = {};
  for (const key of allowed) if (body[key] !== undefined) data[key] = body[key];
  if (body.tags !== undefined) data.tags = JSON.stringify(Array.isArray(body.tags) ? body.tags : []);
  if (body.courseId !== undefined) {
    const course = await prisma.studyCourse.findFirst({ where: { id: String(body.courseId), userId: user.id } });
    if (!course) return NextResponse.json({ message: '课程不存在' }, { status: 400 });
    data.courseId = String(body.courseId);
  }
  if (body.chapterId !== undefined) data.chapterId = body.chapterId ? String(body.chapterId) : null;
  const card = await prisma.memoryCard.update({ where: { id }, data, include: { course: true, chapter: true, _count: { select: { reviews: true } } } });
  return NextResponse.json({ ...card, tags: parseTags(card.tags) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  const result = await prisma.memoryCard.deleteMany({ where: { id, userId: user.id } });
  if (!result.count) return NextResponse.json({ message: '卡片不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
