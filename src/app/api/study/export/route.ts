import { getStudyUser } from '@/lib/study-auth';
import { apiError, ownedCardData, unauthorized } from '@/lib/study-backend-api';
import { transferCardFromRecord, transferWorker } from '@/lib/study-backend-transfer';
import { StudyValidationError } from '@/lib/study-contract';

export async function GET(request: Request) {
  const user = await getStudyUser();
  if (!user) return unauthorized();
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'json';
    if (!['json', 'csv', 'markdown'].includes(format)) throw new StudyValidationError('format无效', 'format');
    const { cards } = await ownedCardData(user.id);
    const filtered = cards.filter(card => {
      if (url.searchParams.get('courseId') && card.courseId !== url.searchParams.get('courseId')) return false;
      if (url.searchParams.get('chapterId') && card.chapterId !== url.searchParams.get('chapterId')) return false;
      if (url.searchParams.get('cardType') && card.cardType !== url.searchParams.get('cardType')) return false;
      if (url.searchParams.get('tag')) {
        let tags: unknown = [];
        try { tags = JSON.parse(card.tags || '[]'); } catch { return false; }
        if (!Array.isArray(tags) || !tags.includes(url.searchParams.get('tag'))) return false;
      }
      return true;
    });
    const content = await (await transferWorker()).serializeStudyCards(filtered.map(transferCardFromRecord), format);
    const mime = format === 'csv' ? 'text/csv; charset=utf-8' : format === 'markdown' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8';
    return new Response(content, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="study-cards.${format === 'markdown' ? 'md' : format}"`,
      },
    });
  } catch (error) {
    return apiError(error, '导出失败');
  }
}
