import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStudyUser } from '@/lib/study-auth';

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(x => x.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] || '').trim()]));
  });
}

export async function POST(req: Request) {
  const user = await getStudyUser();
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  try {
    const body = await req.json();
    const courseId = String(body.courseId || '');
    const course = await prisma.studyCourse.findFirst({ where: { id: courseId, userId: user.id } });
    if (!course) return NextResponse.json({ message: '请选择课程' }, { status: 400 });
    const format = body.format === 'csv' ? 'csv' : 'json';
    const rows = format === 'csv' ? parseCsv(String(body.data || '')) : JSON.parse(String(body.data || '[]'));
    if (!Array.isArray(rows)) return NextResponse.json({ message: '导入数据必须是数组' }, { status: 400 });
    let imported = 0;
    for (const row of rows) {
      const title = String(row.title || row.标题 || '').trim();
      const prompt = String(row.prompt || row.front || row.正面 || '').trim();
      const answer = String(row.answer || row.back || row.答案 || '').trim();
      if (!title || !prompt || !answer) continue;
      let chapterId: string | null = null;
      const chapterName = String(row.chapter || row.章节 || '').trim();
      if (chapterName) {
        const chapter = await prisma.studyChapter.upsert({
          where: { courseId_name: { courseId, name: chapterName } },
          update: {},
          create: { courseId, name: chapterName },
        });
        chapterId = chapter.id;
      }
      await prisma.memoryCard.create({
        data: {
          userId: user.id,
          courseId,
          chapterId,
          title,
          cardType: String(row.cardType || row.type || 'basic'),
          prompt,
          answer,
          explanation: row.explanation || row.解释 || null,
          conditions: row.conditions || row.条件 || null,
          pitfalls: row.pitfalls || row.易错点 || null,
          source: row.source || row.来源 || null,
          notes: row.notes || row.备注 || null,
          tags: JSON.stringify(Array.isArray(row.tags) ? row.tags : String(row.tags || '').split(/[,，]/).map((x: string) => x.trim()).filter(Boolean)),
        },
      });
      imported++;
    }
    return NextResponse.json({ imported });
  } catch (error) {
    return NextResponse.json({ message: '导入失败，请检查 JSON/CSV 格式' }, { status: 400 });
  }
}
