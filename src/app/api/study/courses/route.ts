import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { apiError, ensureDefaultCourses, readJson, unauthorized } from '@/lib/study-backend-api';
import { finiteInteger, optionalText, requiredText } from '@/lib/study-contract';

export async function GET() {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    await ensureDefaultCourses(user.id);
    const courses = await prisma.studyCourse.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        chapters: { orderBy: [{ order: 'asc' }, { id: 'asc' }], include: { _count: { select: { cards: true } } } },
        _count: { select: { cards: true } },
      },
    });
    return NextResponse.json(courses);
  } catch (error) {
    return apiError(error, '读取课程失败');
  }
}

export async function POST(request: Request) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const name = requiredText(body.name, 'name');
    const description = optionalText(body.description, 'description') ?? null;
    const subjectKey = optionalText(body.subjectKey, 'subjectKey') ?? null;
    const examYear = body.examYear === undefined || body.examYear === null
      ? null
      : finiteInteger(body.examYear, 'examYear', 1900, 3000);
    const course = await prisma.studyCourse.create({ data: { userId: user.id, name, description, subjectKey, examYear } });
    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    return apiError(error, '创建课程失败');
  }
}
