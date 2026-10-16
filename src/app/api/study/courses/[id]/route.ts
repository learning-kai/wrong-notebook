import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { apiError, findOwnedCourse, readJson, unauthorized } from '@/lib/study-backend-api';
import { finiteInteger, optionalText, requiredText } from '@/lib/study-contract';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const existing = await findOwnedCourse(user.id, id);
    if (!existing) return NextResponse.json({ message: '课程不存在' }, { status: 404 });
    const body = await readJson<Record<string, unknown>>(request);
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = requiredText(body.name, 'name');
    if (body.description !== undefined) data.description = optionalText(body.description, 'description');
    if (body.subjectKey !== undefined) data.subjectKey = optionalText(body.subjectKey, 'subjectKey');
    if (body.examYear !== undefined) data.examYear = body.examYear === null ? null : finiteInteger(body.examYear, 'examYear', 1900, 3000);
    const course = await prisma.studyCourse.update({ where: { id }, data });
    return NextResponse.json(course);
  } catch (error) {
    return apiError(error, '更新课程失败');
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const existing = await findOwnedCourse(user.id, id);
    if (!existing) return NextResponse.json({ message: '课程不存在' }, { status: 404 });
    await prisma.$transaction(async tx => {
      await tx.studyCourse.delete({ where: { id } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, '删除课程失败');
  }
}
