import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { parseTags } from '@/lib/study-scheduler';

function serializeCard(card: any) {
  return { ...card, tags: parseTags(card.tags) };
}

export async function GET(req: Request) {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  const url = new URL(req.url);
  const courseId = url.searchParams.get('courseId') || undefined;
  const chapterId = url.searchParams.get('chapterId') || undefined;
  const search = url.searchParams.get('search')?.trim();
  const dueOnly = url.searchParams.get('dueOnly') === 'true';
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
  const cards = await prisma.memoryCard.findMany({
    where: {
      userId: user.id,
      ...(courseId ? { courseId } : {}),
      ...(chapterId ? { chapterId } : {}),
      ...(dueOnly ? { dueAt: { lte: new Date() }, suspended: false } : {}),
      ...(search ? { OR: [{ title: { contains: search } }, { prompt: { contains: search } }, { answer: { contains: search } }] } : {}),
    },
    include: { course: true, chapter: true, _count: { select: { reviews: true } } },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    take: limit,
  });
  return NextResponse.json(cards.map(serializeCard));
}

export async function POST(req: Request) {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  try {
    const body = await req.json();
    const title = String(body.title || '').trim();
    const prompt = String(body.prompt || '').trim();
    const answer = String(body.answer || '').trim();
    const courseId = String(body.courseId || '');
    if (!title || !prompt || !answer || !courseId) {
      return NextResponse.json({ message: '标题、正面、答案和课程不能为空' }, { status: 400 });
    }
    const course = await prisma.studyCourse.findFirst({ where: { id: courseId, userId: user.id } });
    if (!course) return NextResponse.json({ message: '课程不存在' }, { status: 404 });
    if (body.chapterId) {
      const chapter = await prisma.studyChapter.findFirst({ where: { id: String(body.chapterId), courseId } });
      if (!chapter) return NextResponse.json({ message: '章节不属于该课程' }, { status: 400 });
    }
    const card = await prisma.memoryCard.create({
      data: {
        userId: user.id,
        courseId,
        chapterId: body.chapterId ? String(body.chapterId) : null,
        title,
        cardType: String(body.cardType || 'basic'),
        prompt,
        answer,
        explanation: body.explanation ? String(body.explanation) : null,
        conditions: body.conditions ? String(body.conditions) : null,
        pitfalls: body.pitfalls ? String(body.pitfalls) : null,
        tags: JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
        source: body.source ? String(body.source) : null,
        notes: body.notes ? String(body.notes) : null,
      },
      include: { course: true, chapter: true, _count: { select: { reviews: true } } },
    });
    return NextResponse.json(serializeCard(card), { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: '创建记忆卡失败' }, { status: 500 });
  }
}
