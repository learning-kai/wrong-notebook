import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';

const DEFAULT_COURSES = [
  ['考研英语一', 'english_exam'],
  ['高等数学', 'calculus'],
  ['线性代数', 'linear_algebra'],
  ['概率论与数理统计', 'probability'],
  ['信号与系统', 'signals_systems'],
] as const;

async function ensureDefaults(userId: string) {
  for (const [name, subjectKey] of DEFAULT_COURSES) {
    await prisma.studyCourse.upsert({
      where: { userId_name: { userId, name } },
      update: {},
      create: { userId, name, subjectKey },
    });
  }
}

export async function GET() {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  await ensureDefaults(user.id);
  const courses = await prisma.studyCourse.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: {
      chapters: { orderBy: { order: 'asc' }, include: { _count: { select: { cards: true } } } },
      _count: { select: { cards: true } },
    },
  });
  return NextResponse.json(courses);
}

export async function POST(req: Request) {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ message: '课程名称不能为空' }, { status: 400 });
    const course = await prisma.studyCourse.create({
      data: {
        userId: user.id,
        name,
        description: body.description ? String(body.description) : null,
        subjectKey: body.subjectKey ? String(body.subjectKey) : null,
        examYear: body.examYear ? Number(body.examYear) : null,
      },
    });
    return NextResponse.json(course, { status: 201 });
  } catch (error: any) {
    if (error?.code === 'P2002') return NextResponse.json({ message: '课程已存在' }, { status: 409 });
    return NextResponse.json({ message: '创建课程失败' }, { status: 500 });
  }
}
