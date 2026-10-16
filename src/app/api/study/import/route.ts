import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { buildCardData } from '@/lib/study-backend';
import { StudyValidationError } from '@/lib/study-contract';
import { apiError, findOwnedCourse, readJson, unauthorized } from '@/lib/study-backend-api';
import { assertImportSize, exactCardSignature, existingSignatures, MAX_IMPORT_CARDS, transferRowToInput, transferWorker } from '@/lib/study-backend-transfer';

function asName(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string') return (value as { name: string }).name;
  return null;
}

async function parseBody(body: Record<string, unknown>) {
  const format = body.format;
  if (format !== 'csv' && format !== 'markdown' && format !== 'json') throw new StudyValidationError('format无效', 'format');
  if (typeof body.data !== 'string') throw new StudyValidationError('data必须是字符串', 'data');
  assertImportSize(body.data);
  const parsed = await (await transferWorker()).parseStudyImport(body.data, format, body.mapping as Record<string, string> | undefined);
  if (!parsed || !Array.isArray(parsed.rows) || !Array.isArray(parsed.errors)) throw new StudyValidationError('导入解析器返回无效结果');
  if (parsed.rows.length > MAX_IMPORT_CARDS) throw new StudyValidationError('导入卡片数量超过上限');
  return { format, data: body.data, parsed };
}

async function prepareRows(userId: string, body: Record<string, unknown>, rows: Record<string, unknown>[], format: string) {
  const errors: Array<{ row: number; field?: string; message: string }> = [];
  const prepared: Array<{ row: number; data: Record<string, unknown>; courseId: string; chapterName: string | null }> = [];
  const explicitCourseId = body.courseId;
  if (explicitCourseId !== undefined && (typeof explicitCourseId !== 'string' || !explicitCourseId)) throw new StudyValidationError('courseId无效', 'courseId');
  if (explicitCourseId && !(await findOwnedCourse(userId, explicitCourseId))) throw new StudyValidationError('课程不存在', 'courseId');
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      const rowCourseId = typeof row.courseId === 'string' ? row.courseId : null;
      const courseName = asName(row.course);
      let courseId = explicitCourseId as string | undefined;
      if (!courseId && rowCourseId) courseId = rowCourseId;
      if (!courseId && courseName) {
        const found = await prisma.studyCourse.findFirst({ where: { userId, name: courseName } });
        courseId = found?.id;
      }
      if (!courseId) throw new StudyValidationError('找不到所属课程', 'course');
      if (!(await findOwnedCourse(userId, courseId))) throw new StudyValidationError('课程不属于当前用户', 'course');
      const chapterName = asName(row.chapter);
      const rowChapterId = typeof row.chapterId === 'string' ? row.chapterId : null;
      let chapterId: string | null = rowChapterId;
      if (chapterId) {
        const chapter = await prisma.studyChapter.findFirst({ where: { id: chapterId, courseId } });
        if (!chapter) throw new StudyValidationError('章节不属于该课程', 'chapter');
      } else if (chapterName) {
        const chapter = await prisma.studyChapter.findFirst({ where: { courseId, name: chapterName } });
        chapterId = chapter?.id ?? null;
      }
      const data = buildCardData({ ...transferRowToInput(row), chapterId }, courseId);
      prepared.push({ row: format === 'csv' ? index + 2 : index + 1, data, courseId, chapterName: chapterId ? null : chapterName });
    } catch (error) {
      errors.push({ row: format === 'csv' ? index + 2 : index + 1, field: (error as StudyValidationError).field, message: error instanceof Error ? error.message : '行无效' });
    }
  }
  return { prepared, errors };
}

export async function POST(request: Request) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (body.action !== 'preview' && body.action !== 'commit') throw new StudyValidationError('action必须是preview或commit', 'action');
    const { parsed, format } = await parseBody(body);
    const baseErrors = (parsed.errors as Array<{ row: number; field?: string; message: string }>).map(error => ({ row: error.row, field: error.field, message: error.message }));
    const { prepared, errors } = await prepareRows(user.id, body, parsed.rows as unknown as Record<string, unknown>[], format);
    const allErrors = [...baseErrors, ...errors];
    const signatures = await existingSignatures(user.id);
    const seen = new Set<string>();
    let duplicates = 0;
    const duplicateRows = new Set<number>();
    for (const item of prepared) {
      const signature = `${item.courseId}:${item.data.chapterId ?? ''}:${exactCardSignature(item.data)}`;
      if (signatures.has(signature) || seen.has(signature)) {
        duplicates += 1;
        duplicateRows.add(item.row);
      }
      seen.add(signature);
    }
    const skipDuplicates = body.skipDuplicates === undefined ? true : body.skipDuplicates;
    if (typeof skipDuplicates !== 'boolean') throw new StudyValidationError('skipDuplicates必须是布尔值', 'skipDuplicates');
    if (!skipDuplicates) {
      for (const row of duplicateRows) allErrors.push({ row, message: '与已有卡片完全重复' });
    }
    const invalidRows = new Set(allErrors.map(error => error.row));
    const validCount = prepared.filter(item => !invalidRows.has(item.row) && (!skipDuplicates || !duplicateRows.has(item.row))).length;
    const preview = {
      headers: Array.isArray(parsed.headers) ? parsed.headers : [],
      rows: parsed.rows,
      errors: allErrors,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      duplicates,
      validCount,
    };
    if (body.action === 'preview') return NextResponse.json(preview);
    if (allErrors.length) return NextResponse.json({ message: '导入存在错误，未写入任何数据', preview }, { status: 400 });

    const toCreate = prepared.filter(item => !duplicateRows.has(item.row));
    const result = await prisma.$transaction(async tx => {
      let imported = 0;
      const chapterIds = new Map<string, string>();
      for (const item of toCreate) {
        let chapterId = item.data.chapterId as string | null;
        if (!chapterId && item.chapterName) {
          const key = `${item.courseId}:${item.chapterName}`;
          chapterId = chapterIds.get(key) ?? null;
          if (!chapterId) {
            const chapter = await tx.studyChapter.upsert({ where: { courseId_name: { courseId: item.courseId, name: item.chapterName } }, update: {}, create: { courseId: item.courseId, name: item.chapterName } });
            chapterId = chapter.id;
            chapterIds.set(key, chapterId);
          }
        }
        await tx.memoryCard.create({ data: { ...item.data, chapterId, userId: user.id } as never });
        imported += 1;
      }
      return { imported, skipped: duplicates };
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, '导入失败');
  }
}
