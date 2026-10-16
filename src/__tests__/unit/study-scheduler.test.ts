import { describe, expect, it } from 'vitest';
import { parseTags, scheduleReview, scheduleReviewWithSettings } from '@/lib/study-scheduler';

describe('study scheduler', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('requeues forgotten cards quickly and records a lapse', () => {
    const result = scheduleReview({ intervalDays: 8, easeFactor: 2.5, repetitions: 3, lapses: 0 }, 'again', now);
    expect(result.lapses).toBe(1);
    expect(result.repetitions).toBe(0);
    expect(result.dueAt.getTime() - now.getTime()).toBe(10 * 60 * 1000);
  });

  it('extends intervals for good and easy recall', () => {
    const good = scheduleReview({ intervalDays: 2, easeFactor: 2.5, repetitions: 1, lapses: 0 }, 'good', now);
    const easy = scheduleReview({ intervalDays: 2, easeFactor: 2.5, repetitions: 1, lapses: 0 }, 'easy', now);
    expect(good.intervalDays).toBeGreaterThan(2);
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
  });

  it('parses JSON and comma-separated tags', () => {
    expect(parseTags('["极限","连续"]')).toEqual(['极限', '连续']);
    expect(parseTags('傅里叶, 收敛域')).toEqual(['傅里叶', '收敛域']);
  });

  it('uses user settings and clamps the next date to the exam date', () => {
    const examDate = new Date('2026-01-05T00:00:00.000Z');
    const result = scheduleReviewWithSettings(
      { intervalDays: 0, easeFactor: 2.5, repetitions: 0, lapses: 0 },
      'easy',
      { initialEasyDays: 30, maxIntervalDays: 365, examDate, relearnMinutes: 10 },
      now,
    );
    expect(result.intervalDays).toBe(30);
    expect(result.dueAt).toEqual(examDate);
  });
});
