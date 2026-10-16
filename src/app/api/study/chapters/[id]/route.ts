import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { apiError, findOwnedChapter, readJson, unauthorized } from '@/lib/study-backend-api';
import { finiteInteger, requiredText } from '@/lib/study-contract';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    if (!(await findOwnedChapter(user.id, id))) return NextResponse.json({ message: '章节不存在' }, { status: 404 });
    const body = await readJson<Record<string, unknown>>(request);
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = requiredText(body.name, 'name');
    if (body.order !== undefined) data.order = finiteInteger(body.order, 'order', 0, 1_000_000);
    return NextResponse.json(await prisma.studyChapter.update({ where: { id }, data }));
  } catch (error) {
    return apiError(error, '更新章节失败');
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    if (!(await findOwnedChapter(user.id, id))) return NextResponse.json({ message: '章节不存在' }, { status: 404 });
    await prisma.studyChapter.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, '删除章节失败');
  }
}
