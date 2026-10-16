import { NextResponse } from 'next/server';
import { getStudyUser } from '@/lib/study-auth';
import { prisma } from '@/lib/prisma';
import { apiError, ensureStudySettings, readJson, settingsDto, unauthorized } from '@/lib/study-backend-api';
import { validateSettingsPatch } from '@/lib/study-backend';

export async function GET() {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    return NextResponse.json(settingsDto(await ensureStudySettings(user.id) as never));
  } catch (error) {
    return apiError(error, '读取学习设置失败');
  }
}

export async function PATCH(request: Request) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const data = validateSettingsPatch(body);
    const settings = await ensureStudySettings(user.id);
    const updated = await prisma.studySettings.update({ where: { userId: settings.userId }, data });
    return NextResponse.json(settingsDto(updated as never));
  } catch (error) {
    return apiError(error, '更新学习设置失败');
  }
}
