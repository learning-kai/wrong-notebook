import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  const { id: courseId } = await params;
  const course = await prisma.studyCourse.findFirst({ where: { id: courseId, userId: user.id } });
  if (!course) return NextResponse.json({ message: '课程不存在' }, { status: 404 });
  const body = await req.json();
  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ message: '章节名称不能为空' }, { status: 400 });
  try {
    const chapter = await prisma.studyChapter.create({
      data: { courseId, name, order: Number(body.order || 0) },
    });
    return NextResponse.json(chapter, { status: 201 });
  } catch (error: any) {
    if (error?.code === 'P2002') return NextResponse.json({ message: '章节已存在' }, { status: 409 });
    return NextResponse.json({ message: '创建章节失败' }, { status: 500 });
  }
}
