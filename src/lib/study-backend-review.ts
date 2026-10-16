import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

class StaleReviewState extends Error {}
export function assertReviewWrite(count: number): void {
  if (count !== 1) throw new StaleReviewState('Card changed during review');
}

/** Database CAS + serializable transactions, not a process-local lock. */
export async function reviewTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const attempts = 6;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 1000, timeout: 1500 });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      const retryable = error instanceof StaleReviewState || code === 'P2034' || code === 'P2028';
      if (!retryable) throw error;
      if (attempt + 1 >= attempts) throw Object.assign(new Error('复习保存繁忙，请重试'), { code: 'STUDY_BUSY' });
      await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt));
    }
  }
}
