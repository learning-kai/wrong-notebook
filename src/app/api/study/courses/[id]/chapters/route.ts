import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { apiError, findOwnedCourse, readJson, unauthorized } from '@/lib/study-backend-api';
import { finiteInteger, requiredText } from '@/lib/study-contract';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const { id: courseId } = await params;
    if (!(await findOwnedCourse(user.id, courseId))) return NextResponse.json({ message: '课程不存在' }, { status: 404 });
    const body = await readJson<Record<string, unknown>>(request);
    const name = requiredText(body.name, 'name');
    const order = body.order === undefined ? 0 : finiteInteger(body.order, 'order', 0, 1_000_000);
    const chapter = await prisma.studyChapter.create({ data: { courseId, name, order } });
    return NextResponse.json(chapter, { status: 201 });
  } catch (error) {
    return apiError(error, '创建章节失败');
  }
}
