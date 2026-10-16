import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { OfflineStudy, type OfflineStorage, type ReviewEvent } from '../../lib/study-offline';
import { useStudyWorkspace, type StudySnapshot } from '../../components/study/use-study-workspace';
import type { CardDTO, StudySettingsDTO } from '../../components/study/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function card(id: string, userId = 'alice'): CardDTO {
  return {
    id, userId, courseId: 'course', chapterId: null, title: id, cardType: 'basic', prompt: id, answer: id,
    explanation: null, conditions: null, pitfalls: null, source: null, notes: null, formula: null, roc: null,
    precautions: null, steps: null, initialConditions: null, finalConditions: null, chinese: null, english: null,
    letterType: null, paragraphPosition: null, sentenceFunction: null, clozeText: null, comparison: null,
    sentences: [], slots: {}, tags: [], dueAt: '2026-10-13T00:00:00.000Z', lastReviewedAt: null,
    intervalDays: 0, easeFactor: 2.5, repetitions: 0, lapses: 0, suspended: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z',
    course: { id: 'course', name: '课程' }, chapter: null, latestReview: null,
  };
}
const settings: StudySettingsDTO = {
  userId: 'alice', dailyNewLimit: 20, dailyReviewLimit: 100, relearnMinutes: 10, initialGoodDays: 1,
  initialEasyDays: 3, hardMultiplier: 1.2, easyMultiplier: 2, maxIntervalDays: 365,
  examDate: null, timezone: 'Asia/Shanghai', theme: 'system', defaultsInitialized: true,
};
function event(cardId: string): ReviewEvent {
  return { cardId, rating: 'hard', mode: 'recall', responseText: '原样\\nu', responseMs: 100,
    clientEventId: `${cardId}-once`, reviewedAt: '2026-10-13T00:00:00.000Z' };
}
function durableStorage(): OfflineStorage {
  const data = new Map<string, unknown>();
  return {
    get: async key => structuredClone(data.get(key)),
    put: async (key, value) => { data.set(key, structuredClone(value)); },
    remove: async key => { data.delete(key); },
  };
}

it.each([404, 409, 'network'] as const)('workspace persists the first server card across restart when the second event fails (%s)', async failure => {
  const storage = durableStorage();
  const store = new OfflineStudy(storage);
  const oldCard = card('first');
  const secondCard = card('second');
  const latestCard: CardDTO = {
    ...oldCard, dueAt: '2026-10-14T00:00:00.000Z', lastReviewedAt: event('first').reviewedAt,
    repetitions: 1, intervalDays: 1, updatedAt: '2026-10-13T00:01:00.000Z',
    latestReview: { id: 'server-review', rating: 'hard', mode: 'recall', responseText: event('first').responseText,
      responseMs: 100, clientEventId: 'first-once', reviewedAt: event('first').reviewedAt,
      nextDueAt: '2026-10-14T00:00:00.000Z' },
  };
  await store.activate('alice');
  await store.cache('alice', { cards: [oldCard, secondCard], courses: [], settings });
  await store.cache('bob', { cards: [card('first', 'bob')], courses: [], settings: { ...settings, userId: 'bob' } });
  await store.enqueue('alice', event('first'));
  await store.enqueue('alice', event('second'));
  await store.enqueue('bob', event('first'));
  const bobSnapshot = await store.snapshot('bob');
  const bobOutbox = await store.outbox('bob');
  const sent: ReviewEvent[] = [];
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/settings')) return Response.json(settings);
    if (String(input).endsWith('/review') && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as ReviewEvent;
      sent.push(payload);
      if (payload.cardId === 'first') return Response.json({ card: latestCard,
        review: { id: 'server-review', clientEventId: payload.clientEventId, nextDueAt: latestCard.dueAt }, duplicate: true });
      if (failure === 'network') throw new TypeError('Network unavailable');
      return Response.json({ message: 'Card deleted or review conflict' }, { status: failure });
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  }));
  let workspace!: ReturnType<typeof useStudyWorkspace>;
  function Harness() { workspace = useStudyWorkspace(store); return null; }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    expect(workspace.allCards).toEqual([oldCard, secondCard]);
    online.mockReturnValue(true);
    await act(async () => { await workspace.sync(); });
    expect(workspace.allCards.find(c => c.id === 'first')).toEqual(latestCard);
    const reopened = new OfflineStudy(storage);
    const persisted = await reopened.snapshot<StudySnapshot>('alice');
    expect(persisted?.cards.find(c => c.id === 'first')).toEqual(latestCard);
    expect(persisted?.cards.find(c => c.id === 'second')).toEqual(secondCard);
    expect(persisted?.settings).toEqual(settings);
    const pending = await reopened.outbox('alice');
    expect(pending.map(p => p.event)).toEqual([event('second')]);
    if (failure !== 'network') expect(pending[0].conflict).toContain(String(failure));
    else expect(workspace.online).toBe(false);
    expect(await reopened.snapshot('bob')).toEqual(bobSnapshot);
    expect(await reopened.outbox('bob')).toEqual(bobOutbox);
    await act(async () => { await workspace.sync(); });
    expect(sent.map(e => e.clientEventId)).toEqual(['first-once', 'second-once', 'second-once']);
    expect((await reopened.snapshot<StudySnapshot>('alice'))?.cards.filter(c => c.id === 'first')).toEqual([latestCard]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it('workspace never displays a foreign-account card returned by sync', async () => {
  const store = new OfflineStudy(durableStorage());
  const oldCard = card('first');
  await store.activate('alice');
  await store.cache('alice', { cards: [oldCard], courses: [], settings });
  await store.enqueue('alice', event('first'));
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => String(input).endsWith('/settings')
    ? Response.json(settings) : Response.json({ card: card('first', 'bob') }));
  let workspace!: ReturnType<typeof useStudyWorkspace>;
  function Harness() { workspace = useStudyWorkspace(store); return null; }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    online.mockReturnValue(true);
    await act(async () => { await workspace.sync(); });
    expect(workspace.allCards).toEqual([oldCard]);
    expect((await store.snapshot<StudySnapshot>('alice'))?.cards).toEqual([oldCard]);
    expect((await store.outbox('alice')).map(p => p.event)).toEqual([event('first')]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
