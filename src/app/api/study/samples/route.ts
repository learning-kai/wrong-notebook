import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';
import { buildCardData } from '@/lib/study-backend';
import { StudyValidationError } from '@/lib/study-contract';
import { apiError, readJson, unauthorized } from '@/lib/study-backend-api';

async function samplesModule(): Promise<typeof import('@/lib/study-samples')> {
  return import('@/lib/study-samples');
}

export async function GET() {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const samples = await samplesModule();
    return NextResponse.json({ courses: samples.DEFAULT_STUDY_COURSES, examples: samples.STUDY_EXAMPLES });
  } catch (error) {
    return apiError(error, '读取示例失败');
  }
}

export async function POST(request: Request) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (!Array.isArray(body.sampleIds) || body.sampleIds.some(id => typeof id !== 'string')) throw new StudyValidationError('sampleIds必须是字符串数组', 'sampleIds');
    const sampleIds = body.sampleIds as string[];
    const samples = await samplesModule();
    const courseDefinitions = new Map<string, { name: string; subjectKey: string }>(samples.DEFAULT_STUDY_COURSES.map((course: { name: string; subjectKey: string }) => [course.subjectKey, course]));
    const selected = samples.STUDY_EXAMPLES.filter((sample: { id?: string }) => sampleIds.includes(sample.id ?? ''));
    if (selected.length !== sampleIds.length) throw new StudyValidationError('包含不存在的示例', 'sampleIds');
    const result = await prisma.$transaction(async tx => {
      const courseIds = new Map<string, string>();
      const chapterIds = new Map<string, string>();
      let imported = 0;
      let skipped = 0;
      for (const sample of selected) {
        const definition = courseDefinitions.get(String(sample.course ?? ''));
        const courseName = definition?.name ?? String(sample.course ?? '示例课程');
        const course = courseIds.has(courseName)
          ? await tx.studyCourse.findUniqueOrThrow({ where: { id: courseIds.get(courseName)! } })
          : (await tx.studyCourse.findFirst({ where: { userId: user.id, name: courseName } }))
            ?? await tx.studyCourse.create({ data: { userId: user.id, name: courseName, subjectKey: definition?.subjectKey ?? String(sample.course ?? '') } });
        courseIds.set(courseName, course.id);
        const chapterName = sample.chapter ? String(sample.chapter) : null;
        let chapterId: string | null = null;
        if (chapterName) {
          const key = `${course.id}:${chapterName}`;
          chapterId = chapterIds.get(key) ?? (await tx.studyChapter.upsert({ where: { courseId_name: { courseId: course.id, name: chapterName } }, update: {}, create: { courseId: course.id, name: chapterName } })).id;
          chapterIds.set(key, chapterId);
        }
        const input = { ...sample, source: sample.source || '示例', notes: `${sample.notes || ''}${sample.notes ? '\n' : ''}示例` };
        const data = buildCardData({ ...input, chapterId }, course.id);
        const duplicate = await tx.memoryCard.findFirst({ where: { userId: user.id, courseId: course.id, chapterId, title: data.title as string, prompt: data.prompt as string, answer: data.answer as string } });
        if (duplicate) { skipped += 1; continue; }
        await tx.memoryCard.create({ data: { ...data, userId: user.id, courseId: course.id, chapterId } as never });
        imported += 1;
      }
      return { imported, skipped };
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, '导入示例失败');
  }
}
