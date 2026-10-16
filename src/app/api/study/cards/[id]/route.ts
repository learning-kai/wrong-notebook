import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { apiError, cardInclude, findOwnedCard, findOwnedCourse, readJson, unauthorized } from '@/lib/study-backend-api';
import { buildCardData, serializeCard, serializeReview } from '@/lib/study-backend';
import { parseIsoDate, StudyValidationError } from '@/lib/study-contract';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const card = await findOwnedCard(user.id, id);
    if (!card) return NextResponse.json({ message: '卡片不存在' }, { status: 404 });
    const reviews = await prisma.memoryReview.findMany({ where: { userId: user.id, cardId: id }, orderBy: [{ reviewedAt: 'desc' }, { reviewOrder: 'desc' }, { id: 'desc' }] });
    const latest = reviews[0] ?? null;
    return NextResponse.json({
      ...serializeCard(card as never, latest as never),
      reviews: reviews.map(review => serializeReview(review as never)),
    });
  } catch (error) {
    return apiError(error, '读取记忆卡失败');
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const existing = await findOwnedCard(user.id, id);
    if (!existing) return NextResponse.json({ message: '卡片不存在' }, { status: 404 });
    const body = await readJson<Record<string, unknown>>(request);
    let courseId = existing.courseId;
    if (body.courseId !== undefined) {
      if (typeof body.courseId !== 'string' || !body.courseId) throw new StudyValidationError('courseId无效', 'courseId');
      if (!(await findOwnedCourse(user.id, body.courseId))) return NextResponse.json({ message: '课程不存在' }, { status: 404 });
      courseId = body.courseId;
    }
    const data = buildCardData(body as never, courseId, true);
    if (body.chapterId !== undefined) {
      if (body.chapterId !== null) {
        if (typeof body.chapterId !== 'string') throw new StudyValidationError('chapterId无效', 'chapterId');
        const chapter = await prisma.studyChapter.findFirst({ where: { id: body.chapterId, courseId } });
        if (!chapter) return NextResponse.json({ message: '章节不属于该课程' }, { status: 400 });
      }
      data.chapterId = body.chapterId;
    }
    if (body.dueAt !== undefined) data.dueAt = parseIsoDate(body.dueAt, 'dueAt', false);
    if (body.suspended !== undefined) {
      if (typeof body.suspended !== 'boolean') throw new StudyValidationError('suspended必须是布尔值', 'suspended');
      data.suspended = body.suspended;
    }
    const card = await prisma.memoryCard.update({ where: { id }, data, include: cardInclude });
    return NextResponse.json(serializeCard(card as never));
  } catch (error) {
    return apiError(error, '更新记忆卡失败');
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const existing = await findOwnedCard(user.id, id);
    if (!existing) return NextResponse.json({ message: '卡片不存在' }, { status: 404 });
    const now = new Date();
    const copied = await prisma.memoryCard.create({
      data: {
        userId: user.id,
        courseId: existing.courseId,
        chapterId: existing.chapterId,
        title: existing.title,
        cardType: existing.cardType,
        prompt: existing.prompt,
        answer: existing.answer,
        explanation: existing.explanation,
        conditions: existing.conditions,
        pitfalls: existing.pitfalls,
        formula: existing.formula,
        roc: existing.roc,
        precautions: existing.precautions,
        steps: existing.steps,
        initialConditions: existing.initialConditions,
        finalConditions: existing.finalConditions,
        chinese: existing.chinese,
        english: existing.english,
        letterType: existing.letterType,
        paragraphPosition: existing.paragraphPosition,
        sentenceFunction: existing.sentenceFunction,
        clozeText: existing.clozeText,
        comparison: existing.comparison,
        sentences: existing.sentences,
        slots: existing.slots,
        tags: existing.tags,
        source: existing.source,
        notes: existing.notes,
        dueAt: now,
        lastReviewedAt: null,
        intervalDays: 0,
        easeFactor: 2.5,
        repetitions: 0,
        lapses: 0,
        suspended: false,
      },
      include: cardInclude,
    });
    return NextResponse.json(serializeCard(copied as never), { status: 201 });
  } catch (error) {
    return apiError(error, '复制记忆卡失败');
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    if (!(await findOwnedCard(user.id, id))) return NextResponse.json({ message: '卡片不存在' }, { status: 404 });
    await prisma.memoryCard.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, '删除记忆卡失败');
  }
}
