import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma, getStudyUser } = vi.hoisted(() => ({
  prisma: {
    studyCourse: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    studyChapter: { findFirst: vi.fn() },
    memoryCard: { create: vi.fn() },
  },
  getStudyUser: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/study-auth', () => ({ getStudyUser }));

import { PATCH as patchCourse } from '@/app/api/study/courses/[id]/route';
import { POST as createCard } from '@/app/api/study/cards/route';

describe('study API ownership and validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStudyUser.mockResolvedValue({ id: 'user-a', email: 'a@example.test', isActive: true });
  });

  it('does not update a course owned by another user', async () => {
    prisma.studyCourse.findFirst.mockResolvedValue(null);
    const response = await patchCourse(new Request('http://test.local', { method: 'PATCH', body: JSON.stringify({ name: '改名' }) }), { params: Promise.resolve({ id: 'foreign-course' }) });
    expect(response.status).toBe(404);
    expect(prisma.studyCourse.update).not.toHaveBeenCalled();
  });

  it('keeps rich card fields and exact text when creating a card', async () => {
    prisma.studyCourse.findFirst.mockResolvedValue({ id: 'course-a', userId: 'user-a' });
    prisma.studyChapter.findFirst.mockResolvedValue({ id: 'chapter-a', courseId: 'course-a' });
    prisma.memoryCard.create.mockResolvedValue({
      id: 'card-a', userId: 'user-a', courseId: 'course-a', chapterId: 'chapter-a', title: '  标题  ', cardType: 'formula', prompt: '  问题  ', answer: '  \\frac{1}{n}  ', explanation: null, conditions: null, pitfalls: null,
      formula: '  \\frac{1}{n}  ', roc: 'Re(s)>0', precautions: null, steps: null, initialConditions: null, finalConditions: null, chinese: null, english: null, letterType: null, paragraphPosition: null, sentenceFunction: null, clozeText: null, comparison: null, sentences: JSON.stringify(['a']), slots: JSON.stringify({ x: 'y' }), tags: JSON.stringify(['示例']), source: 'source\nline', notes: null,
      dueAt: new Date('2026-01-01T00:00:00Z'), lastReviewedAt: null, intervalDays: 0, easeFactor: 2.5, repetitions: 0, lapses: 0, suspended: false, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'), course: { id: 'course-a', name: 'course' }, chapter: { id: 'chapter-a', name: 'chapter' },
    });
    const response = await createCard(new Request('http://test.local', { method: 'POST', body: JSON.stringify({ courseId: 'course-a', chapterId: 'chapter-a', title: '  标题  ', prompt: '  问题  ', answer: '  \\frac{1}{n}  ', formula: '  \\frac{1}{n}  ', roc: 'Re(s)>0', sentences: ['a'], slots: { x: 'y' }, tags: ['示例'], source: 'source\nline' }) }));
    expect(response.status).toBe(201);
    const call = prisma.memoryCard.create.mock.calls[0][0];
    expect(call.data.formula).toBe('  \\frac{1}{n}  ');
    expect(call.data.answer).toBe('  \\frac{1}{n}  ');
    expect(call.data.sentences).toBe(JSON.stringify(['a']));
    expect(call.data.slots).toBe(JSON.stringify({ x: 'y' }));
  });
});
