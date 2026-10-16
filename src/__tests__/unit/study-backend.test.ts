import { describe, expect, it } from 'vitest';
import {
  buildCardData,
  buildDueQueue,
  calculateStudyStats,
  getDateRangeForTimezone,
  type StudyCardRecord,
  type StudyReviewRecord,
} from '@/lib/study-backend';

const course = { id: 'course-1', name: '高等数学' };

function card(overrides: Partial<StudyCardRecord> = {}): StudyCardRecord {
  return {
    id: overrides.id ?? 'card-1',
    userId: 'user-1',
    courseId: 'course-1',
    chapterId: overrides.chapterId ?? null,
    title: overrides.title ?? '极限',
    cardType: 'basic',
    prompt: '题目',
    answer: '答案',
    explanation: null,
    conditions: null,
    pitfalls: null,
    formula: null,
    roc: null,
    precautions: null,
    steps: null,
    initialConditions: null,
    finalConditions: null,
    chinese: null,
    english: null,
    letterType: null,
    paragraphPosition: null,
    sentenceFunction: null,
    clozeText: null,
    comparison: null,
    sentences: null,
    slots: null,
    tags: '["极限"]',
    source: '教材\n第1页',
    notes: null,
    dueAt: new Date('2026-01-01T00:00:00.000Z'),
    lastReviewedAt: null,
    intervalDays: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
    suspended: false,
    createdAt: new Date('2025-12-01T00:00:00.000Z'),
    updatedAt: new Date('2025-12-01T00:00:00.000Z'),
    course,
    chapter: null,
    ...overrides,
  };
}

function review(overrides: Partial<StudyReviewRecord> = {}): StudyReviewRecord {
  return {
    id: overrides.id ?? `review-${Math.random()}`,
    userId: 'user-1',
    cardId: overrides.cardId ?? 'card-1',
    rating: overrides.rating ?? 'good',
    mode: 'recall',
    responseText: null,
    responseMs: null,
    clientEventId: null,
    previousDueAt: null,
    nextDueAt: null,
    reviewedAt: overrides.reviewedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('study backend pure behavior', () => {
  it('preserves rich card text while serializing structured fields', () => {
    const data = buildCardData({
      title: '  保留标题  ',
      prompt: '  prompt  ',
      answer: '  x^2\\n  ',
      source: '  source, with comma\nline  ',
      formula: '  \\frac{1}{n}  ',
      sentences: ['第一句', '第二句'],
      slots: { keyword: '极限' },
      tags: ['分析', '极限'],
    }, 'course-1');

    expect(data.title).toBe('  保留标题  ');
    expect(data.answer).toBe('  x^2\\n  ');
    expect(data.source).toBe('  source, with comma\nline  ');
    expect(data.formula).toBe('  \\frac{1}{n}  ');
    expect(data.sentences).toBe(JSON.stringify(['第一句', '第二句']));
    expect(data.slots).toBe(JSON.stringify({ keyword: '极限' }));
    expect(data.tags).toBe(JSON.stringify(['分析', '极限']));
  });

  it('uses separate new and review quotas with stable ordering', () => {
    const cards = [
      card({ id: 'new-1', dueAt: new Date('2025-01-01T00:00:00Z') }),
      card({ id: 'new-2', dueAt: new Date('2025-01-01T00:00:00Z'), createdAt: new Date('2025-12-02T00:00:00Z') }),
      card({ id: 'review-1', dueAt: new Date('2025-01-01T00:00:00Z'), repetitions: 2, lastReviewedAt: new Date('2025-12-20T00:00:00Z') }),
      card({ id: 'review-2', dueAt: new Date('2025-01-02T00:00:00Z'), repetitions: 2, lastReviewedAt: new Date('2025-12-20T00:00:00Z') }),
    ];

    expect(buildDueQueue(cards, {
      now: new Date('2026-01-01T00:00:00Z'),
      timezone: 'Asia/Shanghai',
      dailyNewLimit: 1,
      dailyReviewLimit: 1,
      todayNewUsed: 0,
      todayReviewsUsed: 0,
    }).map(item => item.id)).toEqual(['new-1', 'review-1']);
  });

  it('mistakes only contains the latest failed state, not historic failures', () => {
    const cards = [card({ id: 'recovered' }), card({ id: 'failed', title: '仍错' })];
    const reviews = [
      review({ cardId: 'recovered', id: 'old-fail', rating: 'again', reviewedAt: new Date('2025-12-01T00:00:00Z') }),
      review({ cardId: 'recovered', id: 'new-pass', rating: 'good', reviewedAt: new Date('2025-12-02T00:00:00Z') }),
      review({ cardId: 'failed', id: 'new-fail', rating: 'again', reviewedAt: new Date('2025-12-02T00:00:00Z') }),
    ];

    expect(buildDueQueue(cards, {
      now: new Date('2026-01-01T00:00:00Z'),
      timezone: 'Asia/Shanghai',
      mode: 'mistakes',
      reviews,
      dailyNewLimit: 100,
      dailyReviewLimit: 100,
      todayNewUsed: 0,
      todayReviewsUsed: 0,
    }).map(item => item.id)).toEqual(['failed']);
  });

  it('uses the requested timezone for a local day boundary', () => {
    const range = getDateRangeForTimezone('2026-01-02', 'Asia/Shanghai');
    expect(range.start.toISOString()).toBe('2026-01-01T16:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-01-02T16:00:00.000Z');
  });

  it('computes timezone-aware accuracy and streaks', () => {
    const reviews = [
      review({ id: 'r1', reviewedAt: new Date('2025-12-31T16:30:00Z'), rating: 'good' }),
      review({ id: 'r2', reviewedAt: new Date('2026-01-01T16:30:00Z'), rating: 'again' }),
      review({ id: 'r3', reviewedAt: new Date('2026-01-02T16:30:00Z'), rating: 'easy' }),
    ];
    const result = calculateStudyStats([card()], reviews, {
      now: new Date('2026-01-03T03:00:00Z'),
      timezone: 'Asia/Shanghai',
    });

    expect(result.reviewsToday).toBe(1);
    expect(result.todayAccuracy).toBe(100);
    expect(result.accuracy).toBeCloseTo(66.67, 1);
    expect(result.streak).toBe(3);
    expect(result.daily).toEqual(expect.arrayContaining([
      { date: '2026-01-01', reviews: 1, successes: 1, forgotten: 0 },
      { date: '2026-01-02', reviews: 1, successes: 0, forgotten: 1 },
    ]));
  });
});
