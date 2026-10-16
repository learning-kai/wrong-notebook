// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createStudySqlite, postRequest, seedStudy } from '../helpers/study-sqlite';

const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient, userId: 'user-a' }));
vi.mock('@/lib/prisma', () => ({ get prisma() { return state.db; } }));
vi.mock('@/lib/study-auth', () => ({ getStudyUser: async () => ({ id: state.userId }) }));
import { GET as reviewGet, POST as reviewCard } from '@/app/api/study/review/route';
import { GET as cardsGet } from '@/app/api/study/cards/route';
import { GET as exportGet } from '@/app/api/study/export/route';
import { POST as importPost } from '@/app/api/study/import/route';
import { GET as backupGet, POST as backupPost } from '@/app/api/study/backup/route';
import { GET as coursesGet } from '@/app/api/study/courses/route';
import { GET as settingsGet } from '@/app/api/study/settings/route';

let fixture: ReturnType<typeof createStudySqlite>;
beforeAll(() => { fixture = createStudySqlite(); state.db = fixture.db; });
afterAll(async () => { await fixture.close(); });
beforeEach(async () => { state.userId = 'user-a'; await seedStudy(state.db); });

async function json(response: Response) { return response.json() as Promise<any>; }

describe('review regression with real SQLite', () => {
  it('initializes the five empty course trees once even if settings loaded first, without adding samples', async () => {
    state.userId = 'user-b';
    expect((await settingsGet()).status).toBe(200);
    const initial = await json(await coursesGet());
    expect(initial.map((course: { name: string }) => course.name)).toEqual(expect.arrayContaining(['考研英语一', '高等数学', '线性代数', '概率论与数理统计', '信号与系统']));
    expect(initial).toHaveLength(5);
    expect(initial.every((course: { chapters: unknown[] }) => course.chapters.length > 0)).toBe(true);
    expect(await state.db.memoryCard.count({ where: { userId: 'user-b' } })).toBe(0);
    expect(await state.db.studyCourse.count({ where: { userId: 'user-a' } })).toBe(1);
    await state.db.studyCourse.delete({ where: { id: initial[0].id } });
    expect(await json(await coursesGet())).toHaveLength(4);
  });
  it('reports CSV course-validation errors using the source row including its header', async () => {
    const response = await importPost(postRequest('import', { action: 'preview', format: 'csv', data: 'title,prompt,answer,courseId\nTitle,Prompt,Answer,foreign-course' }));
    expect(response.status).toBe(200);
    const preview = await json(response);
    expect(preview.errors).toContainEqual(expect.objectContaining({ row: 2, field: 'course' }));
    expect(await state.db.memoryCard.count()).toBe(1);
  });
  it('serializes distinct concurrent events without losing schedule increments', async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, (_, i) => reviewCard(postRequest('review', { cardId: 'card-a', rating: 'good', clientEventId: `event-${i}`, reviewedAt: '2026-10-01T00:00:00Z' }))));
    expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200]);
    expect(await state.db.memoryReview.count({ where: { cardId: 'card-a' } })).toBe(4);
    const card = await state.db.memoryCard.findUniqueOrThrow({ where: { id: 'card-a' } });
    expect(card.repetitions).toBe(4);
    expect(card.intervalDays).toBe(15.63);
  });

  it('serializes review writes from two independent Prisma clients', async () => {
    const other = fixture.connect();
    const original = fixture.db;
    const originalTransaction = original.$transaction.bind(original) as (...args: unknown[]) => Promise<unknown>;
    const otherTransaction = other.$transaction.bind(other) as (...args: unknown[]) => Promise<unknown>;
    let index = 0;
    vi.spyOn(original, '$transaction').mockImplementation(((...args: unknown[]) => {
      const client = index++ % 2 === 0 ? originalTransaction : otherTransaction;
      return client(...args);
    }) as never);
    const operations = [0, 1].map(index => reviewCard(postRequest('review', { cardId: 'card-a', rating: 'good', clientEventId: `independent-${index}`, reviewedAt: '2026-10-01T00:00:00Z' })));
    try {
      const responses = await Promise.all(operations);
      expect(responses.map(response => response.status)).toEqual([200, 200]);
      expect((await original.memoryCard.findUniqueOrThrow({ where: { id: 'card-a' } })).repetitions).toBe(2);
      expect(await original.memoryReview.count()).toBe(2);
    } finally { state.db = original; await other.$disconnect(); }
  });

  it('is idempotent for concurrent identical events without restoring an older DTO', async () => {
    const request = () => postRequest('review', { cardId: 'card-a', rating: 'good', clientEventId: 'same-event', reviewedAt: '2026-10-01T00:00:00Z' });
    const responses = await Promise.all([reviewCard(request()), reviewCard(request())]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect((await Promise.all(responses.map(json))).map(result => result.duplicate).sort()).toEqual([false, true]);
    await reviewCard(postRequest('review', { cardId: 'card-a', rating: 'hard', clientEventId: 'later-event', reviewedAt: '2026-10-02T00:00:00Z' }));
    const duplicate = await json(await reviewCard(request()));
    expect(duplicate.card.latestReview.clientEventId).toBe('later-event');
    expect(duplicate.card.lastReviewedAt).toBe('2026-10-02T00:00:00.000Z');
    expect(await state.db.memoryReview.count()).toBe(2);
  });

  it('keeps latestReview consistent with a later serialized event at the same observed time', async () => {
    const reviewedAt = new Date('2026-10-01T00:00:00Z');
    await state.db.memoryReview.create({ data: { id: 'zz-historic', userId: 'user-a', cardId: 'card-a', rating: 'again', reviewedAt } });
    await state.db.memoryCard.update({ where: { id: 'card-a' }, data: { lastReviewedAt: reviewedAt, lapses: 1 } });
    const response = await reviewCard(postRequest('review', { cardId: 'card-a', rating: 'good', clientEventId: 'equal-time', reviewedAt: reviewedAt.toISOString() }));
    expect(response.status).toBe(200);
    expect((await json(response)).card.latestReview.clientEventId).toBe('equal-time');
    expect((await json(await cardsGet(new Request('http://test.local/api/study/cards'))))[0].latestReview.rating).toBe('good');
    expect(await json(await reviewGet(new Request('http://test.local/api/study/review?mode=mistakes')))).toEqual([]);
  });

  it('keeps a late offline review in history without moving the card backwards', async () => {
    await reviewCard(postRequest('review', { cardId: 'card-a', rating: 'good', clientEventId: 'newer', reviewedAt: '2026-10-02T00:00:00Z', note: 'newest note' }));
    const before = await state.db.memoryCard.findUniqueOrThrow({ where: { id: 'card-a' } });
    const lateResponse = await reviewCard(postRequest('review', { cardId: 'card-a', rating: 'again', clientEventId: 'late', reviewedAt: '2026-10-01T00:00:00Z', note: 'offline note' }));
    expect(lateResponse.status).toBe(200);
    const after = await state.db.memoryCard.findUniqueOrThrow({ where: { id: 'card-a' } });
    expect(after.lastReviewedAt).toEqual(before.lastReviewedAt);
    expect(after.dueAt).toEqual(before.dueAt);
    expect((await json(lateResponse)).card.latestReview.reviewedAt).toBe('2026-10-02T00:00:00.000Z');
    expect(await state.db.memoryReview.count({ where: { cardId: 'card-a' } })).toBe(2);
  });

  it.each(['P2034', 'P2028'])('retries a transient %s and commits exactly once', async code => {
    const run = state.db.$transaction.bind(state.db);
    const transaction = vi.spyOn(state.db, '$transaction').mockRejectedValueOnce(Object.assign(new Error('busy'), { code })).mockImplementation(run);
    const response = await reviewCard(postRequest('review', { cardId: 'card-a', rating: 'good', clientEventId: `retry-${code}` }));
    expect(response.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(await state.db.memoryReview.count()).toBe(1);
    expect((await state.db.memoryCard.findUniqueOrThrow({ where: { id: 'card-a' } })).repetitions).toBe(1);
  });

  it('retries a failed optimistic write from a fresh owned card read', async () => {
    const run = state.db.$transaction.bind(state.db);
    const transaction = vi.spyOn(state.db, '$transaction').mockImplementationOnce(async operation => run(async tx => {
      const actual = tx.memoryCard.updateMany.bind(tx.memoryCard);
      let first = true;
      tx.memoryCard.updateMany = (async args => {
        if (first) { first = false; return { count: 0 }; }
        return actual(args);
      }) as typeof tx.memoryCard.updateMany;
      return (operation as (tx: unknown) => Promise<unknown>)(tx);
    }) as never).mockImplementation(run);
    const response = await reviewCard(postRequest('review', { cardId: 'card-a', rating: 'good', clientEventId: 'cas-retry' }));
    expect(response.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(await state.db.memoryReview.count()).toBe(1);
  });

  it('stops retrying after a bounded number of busy transactions', async () => {
    const error = Object.assign(new Error('busy'), { code: 'P2028' });
    const transaction = vi.spyOn(state.db, '$transaction').mockRejectedValue(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await reviewCard(postRequest('review', { cardId: 'card-a', rating: 'good', clientEventId: 'busy-always' }));
    expect(transaction.mock.calls.length).toBeGreaterThan(1);
    expect(transaction.mock.calls.length).toBeLessThanOrEqual(6);
    expect(response.status).toBe(503);
    expect(await state.db.memoryReview.count()).toBe(0);
  });

  it('rejects reusing one client event id for a different card', async () => {
    await state.db.memoryCard.create({ data: { id: 'card-b', userId: 'user-a', courseId: 'course-a', title: 'Other', prompt: 'Other', answer: 'Answer' } });
    expect((await reviewCard(postRequest('review', { cardId: 'card-a', rating: 'good', clientEventId: 'cross-card' }))).status).toBe(200);
    const conflict = await reviewCard(postRequest('review', { cardId: 'card-b', rating: 'good', clientEventId: 'cross-card' }));
    expect(conflict.status).toBe(409);
    expect(await state.db.memoryReview.count({ where: { cardId: 'card-b' } })).toBe(0);
  });

  it('returns the latest owned review with each card for offline cache', async () => {
    await reviewCard(postRequest('review', { cardId: 'card-a', rating: 'again', clientEventId: 'mistake' }));
    const response = await cardsGet(new Request('http://test.local/api/study/cards?limit=10'));
    expect(response.status).toBe(200);
    expect((await json(response))[0].latestReview).toMatchObject({ rating: 'again', clientEventId: 'mistake' });
  });

  it('uses text and markdown media types for content exports', async () => {
    const markdown = await exportGet(new Request('http://test.local/api/study/export?format=markdown'));
    expect(markdown.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    const csv = await exportGet(new Request('http://test.local/api/study/export?format=csv'));
    expect(csv.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  });

  it('backs up and restores review notes and card/history timestamps', async () => {
    await state.db.memoryCard.update({ where: { id: 'card-a' }, data: { notes: 'card note', createdAt: new Date('2025-01-02T00:00:00Z') } });
    await reviewCard(postRequest('review', { cardId: 'card-a', rating: 'good', clientEventId: 'with-note', note: 'review note', reviewedAt: '2026-10-01T00:00:00Z' }));
    await state.db.memoryCard.update({ where: { id: 'card-a' }, data: { dueAt: new Date('2030-04-05T06:07:08Z'), lastReviewedAt: new Date('2026-10-01T00:00:00Z'), intervalDays: 12.5, easeFactor: 2.7, repetitions: 9, lapses: 3, suspended: true, updatedAt: new Date('2026-10-02T00:00:00Z') } });
    const backup = await json(await backupGet());
    expect(backup.reviews[0].note).toBe('review note');
    await state.db.studyCourse.deleteMany({ where: { userId: 'user-a' } });
    const restored = await backupPost(postRequest('backup', { action: 'restore', data: JSON.stringify(backup) }));
    expect(restored.status).toBe(200);
    const card = await state.db.memoryCard.findFirstOrThrow({ where: { userId: 'user-a' } });
    expect(card.notes).toBe('card note');
    expect(card.createdAt.toISOString()).toBe('2025-01-02T00:00:00.000Z');
    expect(card.dueAt.toISOString()).toBe('2030-04-05T06:07:08.000Z');
    expect(card.lastReviewedAt?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(card.intervalDays).toBe(12.5);
    expect(card.easeFactor).toBe(2.7);
    expect(card.repetitions).toBe(9);
    expect(card.lapses).toBe(3);
    expect(card.suspended).toBe(true);
    expect(card.updatedAt.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    const review = await state.db.memoryReview.findFirstOrThrow({ where: { cardId: card.id } });
    expect(review.note).toBe('review note');
    expect(review.reviewedAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('reports malformed backup entries and scalar metadata in preview instead of 500', async () => {
    const response = await backupPost(postRequest('backup', { action: 'preview', data: JSON.stringify({ schemaVersion: 1, settings: null, courses: [null, { id: 'c', name: {} }], chapters: [null], cards: [null], reviews: [null] }) }));
    expect(response.status).toBe(200);
    const preview = await json(response);
    expect(preview.valid).toBe(false);
    expect(preview.errors.length).toBeGreaterThanOrEqual(5);
  });

  it.each([
    ['courses', 'description', 3], ['courses', 'subjectKey', {}], ['courses', 'examYear', '2027'],
    ['courses', 'createdAt', 'bad-date'], ['chapters', 'order', '1'], ['chapters', 'order', 0.5],
    ['chapters', 'updatedAt', {}],
  ])('validates backup %s.%s scalar metadata during preview', async (section, field, value) => {
    const backup = await json(await backupGet());
    backup.chapters = [{ id: 'chapter-a', courseId: 'course-a', name: 'Chapter', order: 0 }];
    backup[section][0][field] = value;
    const response = await backupPost(postRequest('backup', { action: 'preview', data: JSON.stringify(backup) }));
    expect(response.status).toBe(200);
    expect((await json(response)).valid).toBe(false);
  });

  it.each([
    ['all', 'Asia/Shanghai', '2026-01-03', '2026-01-03T15:59:59.999Z', '2026-01-03T16:00:00.000Z'],
    ['random', 'Asia/Shanghai', '2026-01-03', '2026-01-03T15:59:59.999Z', '2026-01-03T16:00:00.000Z'],
    ['mistakes', 'Asia/Shanghai', '2026-01-03', '2026-01-03T15:59:59.999Z', '2026-01-03T16:00:00.000Z'],
    ['due', 'Asia/Shanghai', '2026-01-03', '2026-01-03T15:59:59.999Z', '2026-01-03T16:00:00.000Z'],
    ['today-mistakes', 'Asia/Shanghai', '2026-01-03', '2026-01-03T15:59:59.999Z', '2026-01-03T16:00:00.000Z'],
    ['all', 'America/New_York', '2026-03-08', '2026-03-09T03:59:59.999Z', '2026-03-09T04:00:00.000Z'],
    ['all', 'America/New_York', '2026-11-01', '2026-11-02T04:59:59.999Z', '2026-11-02T05:00:00.000Z'],
  ])('applies end-of-day exam scope in %s using %s', async (mode, timezone, examDate, endOfDay, nextDay) => {
    await state.db.studySettings.update({ where: { userId: 'user-a' }, data: { timezone } });
    await state.db.memoryCard.update({ where: { id: 'card-a' }, data: { dueAt: new Date(endOfDay) } });
    await state.db.memoryCard.create({ data: { id: 'card-late', userId: 'user-a', courseId: 'course-a', title: 'late', prompt: 'p', answer: 'a', dueAt: new Date(nextDay) } });
    for (const cardId of ['card-a', 'card-late']) await state.db.memoryReview.create({ data: { cardId, userId: 'user-a', rating: 'again' } });
    const response = await reviewGet(new Request(`http://test.local/api/study/review?mode=${mode}&examDate=${examDate}&limit=20`));
    expect(response.status).toBe(200);
    expect((await json(response)).map((card: any) => card.id)).toEqual(['card-a']);
  });

  it('preserves same-time serialized latest state through full backup restoration', async () => {
    const reviewedAt = new Date('2026-10-01T00:00:00Z');
    await state.db.memoryReview.create({ data: { id: 'zz-historic', userId: 'user-a', cardId: 'card-a', rating: 'again', reviewedAt, reviewOrder: 1 } });
    await state.db.memoryReview.create({ data: { id: 'aa-current', userId: 'user-a', cardId: 'card-a', rating: 'good', reviewedAt, reviewOrder: 2 } });
    const backup = await json(await backupGet());
    expect(backup.reviews.find((row: any) => row.id === 'aa-current').reviewOrder).toBe(2);
    await state.db.studyCourse.deleteMany({ where: { userId: 'user-a' } });
    const response = await backupPost(postRequest('backup', { action: 'restore', data: JSON.stringify(backup) }));
    expect(response.status).toBe(200);
    expect((await json(await cardsGet(new Request('http://test.local/api/study/cards'))))[0].latestReview.rating).toBe('good');
  });

  it('retains distinct same-time same-rating history rows by stable source identity', async () => {
    const backup = await json(await backupGet());
    const base = { cardId: 'card-a', rating: 'good', mode: 'recall', responseText: null, note: null, responseMs: 250, previousDueAt: null, nextDueAt: null, reviewedAt: '2026-10-01T00:00:00.000Z' };
    backup.reviews = [
      { ...base, id: 'r1', clientEventId: 'event-1', reviewOrder: 1 },
      { ...base, id: 'r2', clientEventId: 'event-2', reviewOrder: 2 },
      { ...base, id: 'r3', clientEventId: 'event-3', reviewOrder: 3 },
    ];
    const response = await backupPost(postRequest('backup', { action: 'restore', data: JSON.stringify(backup) }));
    expect(response.status).toBe(200);
    expect((await json(response)).reviews).toBe(3);
    expect(await state.db.memoryReview.count()).toBe(3);
    expect((await state.db.memoryReview.findMany({ orderBy: { reviewOrder: 'asc' } })).map(review => [review.clientEventId, review.reviewOrder])).toEqual([
      ['event-1', 1], ['event-2', 2], ['event-3', 3],
    ]);
    const repeat = await backupPost(postRequest('backup', { action: 'restore', data: JSON.stringify(backup) }));
    expect((await json(repeat)).reviews).toBe(0);
    expect(await state.db.memoryReview.count()).toBe(3);
  });

  it('remaps review identities across users without colliding with the source history and repeats exactly once', async () => {
    await reviewCard(postRequest('review', { cardId: 'card-a', rating: 'good', clientEventId: 'source-event', note: 'source history' }));
    const backup = await json(await backupGet());
    const sourceReviewId = backup.reviews[0].id;
    state.userId = 'user-b';
    const restored = await backupPost(postRequest('backup', { action: 'restore', data: JSON.stringify(backup) }));
    expect(restored.status).toBe(200);
    expect((await json(restored)).reviews).toBe(1);
    const targetReview = await state.db.memoryReview.findFirstOrThrow({ where: { userId: 'user-b' } });
    expect(targetReview.id).not.toBe(sourceReviewId);
    expect(targetReview.note).toBe('source history');
    expect(await state.db.memoryReview.count({ where: { userId: 'user-a' } })).toBe(1);
    const repeated = await backupPost(postRequest('backup', { action: 'restore', data: JSON.stringify(backup) }));
    expect(repeated.status).toBe(200);
    expect((await json(repeated)).reviews).toBe(0);
    expect(await state.db.memoryReview.count({ where: { userId: 'user-b' } })).toBe(1);
  });

  it.each([
    ['cards', 'createdAt', {}],
    ['cards', 'updatedAt', {}],
    ['cards', 'repetitions', {}],
    ['cards', 'lapses', 2147483648],
    ['reviews', 'mode', {}],
    ['reviews', 'mode', 'not-a-mode'],
    ['reviews', 'reviewOrder', {}],
    ['reviews', 'reviewOrder', 2147483647],
    ['reviews', 'responseMs', {}],
  ])('reports malformed backup %s.%s during preview instead of returning 500', async (section, field, value) => {
    const backup = await json(await backupGet());
    backup.reviews = [{ cardId: 'card-a', id: 'review-1', rating: 'good', mode: 'recall', reviewOrder: 1, responseMs: 100, reviewedAt: '2026-10-01T00:00:00.000Z' }];
    backup[section][0][field] = value;
    const response = await backupPost(postRequest('backup', { action: 'preview', data: JSON.stringify(backup) }));
    expect(response.status).toBe(200);
    const preview = await json(response);
    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
  });

  it('rejects malformed review scalars on restore without coercing them into history', async () => {
    const backup = await json(await backupGet());
    backup.reviews = [{ cardId: 'card-a', id: 'bad-review', rating: 'good', mode: {}, reviewOrder: {}, responseMs: 100, reviewedAt: '2026-10-01T00:00:00.000Z' }];
    const response = await backupPost(postRequest('backup', { action: 'restore', data: JSON.stringify(backup) }));
    expect(response.status).toBe(400);
    expect(await state.db.memoryReview.count()).toBe(0);
  });

  it('restores an explicit null exam date instead of retaining the current date', async () => {
    await state.db.studySettings.update({ where: { userId: 'user-a' }, data: { examDate: new Date('2027-01-01T00:00:00Z') } });
    const backup = await json(await backupGet());
    backup.settings.examDate = null;
    const response = await backupPost(postRequest('backup', { action: 'restore', data: JSON.stringify(backup) }));
    expect(response.status).toBe(200);
    expect((await state.db.studySettings.findUniqueOrThrow({ where: { userId: 'user-a' } })).examDate).toBeNull();
  });
});
