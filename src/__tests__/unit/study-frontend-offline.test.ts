// @vitest-environment node
import { it, expect } from 'vitest';
import type { OfflineStorage, ReviewEvent } from '../../lib/study-offline';
it('离线事件持久化、用户隔离、相同 clientEventId 去重与重新打开', async () => {
  const mod = await import('../../lib/study-offline').catch(() => ({}));
  expect(mod).toHaveProperty('OfflineStudy');
  const records = new Map<string, unknown>();
  const storage = { get: async (k: string) => records.get(k), put: async (k: string,v: unknown) => { records.set(k,v); }, remove: async (k: string) => { records.delete(k); } };
  const { OfflineStudy } = mod as typeof import('../../lib/study-offline');
  const first = new OfflineStudy(storage);
  const event = { cardId:'a',rating:'good' as const,mode:'recall',responseText:'原样\\nu',responseMs:100,clientEventId:'same-id',reviewedAt:'2026-10-13T00:00:00.000Z' };
  await first.enqueue('alice', event); await first.enqueue('alice', event);
  const reopened = new OfflineStudy(storage);
  expect(await reopened.outbox('alice')).toHaveLength(1);
  expect(await reopened.outbox('bob')).toEqual([]);
  expect((await reopened.outbox('alice'))[0].event.responseText).toBe('原样\\nu');
});
it('切换账号仅清除旧账号显示缓存，保留未同步事件；登出移除当前账号标记', async () => {
  const {OfflineStudy}=await import('../../lib/study-offline');const data=new Map<string,unknown>();
  const store=new OfflineStudy({get:async k=>data.get(k),put:async(k,v)=>{data.set(k,v);},remove:async k=>{data.delete(k);}});
  await store.activate('alice');expect(await store.activeUser()).toBe('alice');
  await store.cache('alice',{cards:[],courses:[],settings:{userId:'alice'}});
  await store.enqueue('alice',{cardId:'a',rating:'hard',mode:'recall',responseText:'draft',responseMs:3,clientEventId:'keep',reviewedAt:'2026-10-13T00:00:00Z'});
  await store.activate('bob');expect(await store.snapshot('alice')).toBeNull();expect(await store.outbox('alice')).toHaveLength(1);expect(await store.activeUser()).toBe('bob');
  await store.deactivate();expect(await store.activeUser()).toBeNull();
});
it('同步先确认账号；401 暂停；删除冲突保留；成功重试移除同一事件', async () => {
  const { OfflineStudy } = await import('../../lib/study-offline');
  const data = new Map<string, unknown>();
  const store = new OfflineStudy({ get: async k => data.get(k), put: async (k,v) => {data.set(k,v);}, remove: async k => {data.delete(k);} });
  const event = {cardId:'deleted',rating:'again' as const,mode:'recall',responseText:'',responseMs:0,clientEventId:'once',reviewedAt:'2026-10-13T00:00:00Z'};
  await store.enqueue('alice',event);
  let sent = 0;
  const mismatch = await store.sync('alice', async () => 'bob', async () => {sent++; return { card: { id: event.cardId, userId: 'alice' } };});
  expect(mismatch.status).toBe('account-mismatch'); expect(sent).toBe(0);
  const unauthorized = await store.sync('alice', async () => {throw {status:401};}, async () => ({ card: { id: event.cardId, userId: 'alice' } }));
  expect(unauthorized.status).toBe('unauthorized');
  const conflict = await store.sync('alice', async () => 'alice', async () => {throw {status:404};});
  expect(conflict.status).toBe('conflict'); expect((await store.outbox('alice'))[0].conflict).toBeTruthy();
  await store.sync('alice', async () => 'alice', async payload => {expect(payload.clientEventId).toBe('once'); return { card: { id: event.cardId, userId: 'alice' } };});
  expect(await store.outbox('alice')).toEqual([]);
});
it('缓存投影绝不持久化凭据；登出删除缓存但待同步事件仍可找回', async () => {
  const { OfflineStudy } = await import('../../lib/study-offline');
  const data = new Map<string, unknown>();
  const store = new OfflineStudy({ get: async k => data.get(k), put: async (k,v) => {data.set(k,v);}, remove: async k => {data.delete(k);} });
  await store.cache('alice', { cards:[],courses:[],settings:{userId:'alice',dailyNewLimit:20,password:'secret',apiKey:'SECRET'} });
  expect(JSON.stringify(await store.snapshot('alice'))).not.toContain('secret');
  expect(JSON.stringify(await store.snapshot('alice'))).not.toContain('SECRET');
  await store.clearSnapshot('alice'); expect(await store.snapshot('alice')).toBeNull();
});
it('离线队列与在线规则一致：hard 是最新错题、今日按用户时区、考试日按本地日结束', async () => {
  const { offlineQueue } = await import('../../lib/study-offline');
  const card = (id: string, dueAt: string, rating: 'again' | 'hard' | 'good', reviewedAt: string) => ({
    id, userId: 'alice', courseId: 'course', chapterId: null, title: id, cardType: 'basic', prompt: id, answer: id,
    explanation: null, conditions: null, pitfalls: null, source: null, notes: null, formula: null, roc: null,
    precautions: null, steps: null, initialConditions: null, finalConditions: null, chinese: null, english: null,
    letterType: null, paragraphPosition: null, sentenceFunction: null, clozeText: null, comparison: null,
    sentences: [], slots: {}, tags: [], dueAt, lastReviewedAt: reviewedAt, intervalDays: 0, easeFactor: 2.5,
    repetitions: 1, lapses: 0, suspended: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: dueAt,
    course: { id: 'course', name: '课程' }, chapter: null,
    latestReview: { id: `${id}-review`, rating, mode: 'recall', responseText: null, responseMs: null, clientEventId: null, reviewedAt, nextDueAt: dueAt },
  });
  const today = '2026-10-13T15:00:00.000Z';
  const cards = [
    card('hard-today', '2026-10-13T12:00:00.000Z', 'hard', '2026-10-13T14:59:00.000Z'),
    card('again-today', '2026-10-13T12:00:00.000Z', 'again', '2026-10-13T14:00:00.000Z'),
    card('hard-tomorrow', '2026-10-13T12:00:00.000Z', 'hard', '2026-10-13T16:00:00.000Z'),
    card('good-today', '2026-10-13T12:00:00.000Z', 'good', '2026-10-13T14:00:00.000Z'),
    card('exam-day-end', '2026-10-13T15:59:59.999Z', 'good', '2026-10-12T14:00:00.000Z'),
    card('after-exam-day', '2026-10-13T16:00:00.000Z', 'good', '2026-10-12T14:00:00.000Z'),
  ] as never[];
  expect(offlineQueue(cards as never, { mode: 'mistakes', timezone: 'Asia/Shanghai', now: new Date(today) }).map(c => c.id)).toEqual(['again-today', 'hard-today', 'hard-tomorrow']);
  expect(offlineQueue(cards as never, { mode: 'today-mistakes', timezone: 'Asia/Shanghai', now: new Date(today) }).map(c => c.id)).toEqual(['again-today', 'hard-today']);
  expect(offlineQueue(cards as never, { mode: 'due', timezone: 'Asia/Shanghai', examDate: '2026-10-13', now: new Date('2026-10-13T16:30:00.000Z') }).map(c => c.id)).toEqual(['again-today', 'good-today', 'hard-today', 'hard-tomorrow', 'exam-day-end']);
});
it('同步成功后用服务器最新卡片状态 upsert 缓存，并拒绝其他用户卡片', async () => {
  const { OfflineStudy } = await import('../../lib/study-offline');
  const data = new Map<string, unknown>();
  const store = new OfflineStudy({ get: async k => data.get(k), put: async (k, v) => { data.set(k, v); }, remove: async k => { data.delete(k); } });
  const oldCard = { id: 'a', userId: 'alice', dueAt: '2026-10-13T00:00:00.000Z', latestReview: null };
  const latestCard = { ...oldCard, dueAt: '2026-10-14T00:00:00.000Z', latestReview: { rating: 'hard', reviewedAt: '2026-10-13T00:00:00.000Z' } };
  await store.activate('alice');
  await store.cache('alice', { cards: [oldCard, { id: 'foreign', userId: 'bob' }], courses: [], settings: { userId: 'alice' } });
  await store.enqueue('alice', { cardId: 'a', rating: 'hard', mode: 'recall', responseText: '', responseMs: 1, clientEventId: 'latest-once', reviewedAt: '2026-10-13T00:00:00.000Z' });
  const result = await store.sync('alice', async () => 'alice', async () => ({ card: latestCard }));
  expect(result.status).toBe('ok');
  expect(await store.outbox('alice')).toEqual([]);
  expect((await store.snapshot<{ cards: typeof latestCard[] }>('alice'))?.cards).toEqual([latestCard]);
});
it.each([undefined, { card: { id: 'a', userId: 'bob' } }, { card: { id: 'other', userId: 'alice' } }])('同步响应缺少当前账号的对应卡片时保留事件与原缓存：%j', async response => {
  const { OfflineStudy } = await import('../../lib/study-offline');
  const data = new Map<string, unknown>();
  const store = new OfflineStudy({ get: async k => data.get(k), put: async (k, v) => { data.set(k, v); }, remove: async k => { data.delete(k); } });
  const oldCard = { id: 'a', userId: 'alice', dueAt: '2026-10-13T00:00:00.000Z' };
  const event = { cardId: 'a', rating: 'hard' as const, mode: 'recall', responseText: '', responseMs: 1,
    clientEventId: 'retain-once', reviewedAt: '2026-10-13T00:00:00.000Z' };
  await store.cache('alice', { cards: [oldCard], courses: [], settings: { userId: 'alice' } });
  await store.enqueue('alice', event);
  // Exercise malformed runtime data even after the callback contract is typed.
  const result = await store.sync('alice', async () => 'alice', async () => response as never);
  expect(result).toEqual({ status: 'offline', synced: 0 });
  expect((await store.outbox('alice')).map(item => item.event)).toEqual([event]);
  expect((await store.snapshot<{ cards: typeof oldCard[] }>('alice'))?.cards).toEqual([oldCard]);
});
it.each([false, true])('缓存写入失败不确认事件，重启后用相同 clientEventId 幂等重试（atomic update：%s）', async atomicUpdate => {
  const { OfflineStudy } = await import('../../lib/study-offline');
  const data = new Map<string, unknown>();
  let failSnapshotWrite = false;
  const persist = (key: string, value: unknown) => {
    if (failSnapshotWrite && key === 'study:alice:snapshot') throw new Error('storage write failed');
    data.set(key, structuredClone(value));
  };
  const storage: OfflineStorage = {
    get: async key => structuredClone(data.get(key)),
    put: async (key, value) => { persist(key, value); },
    remove: async key => { data.delete(key); },
    ...(atomicUpdate ? { update: async (key: string, change: (value: unknown) => unknown) => {
      persist(key, change(structuredClone(data.get(key))));
    } } : {}),
  };
  const store = new OfflineStudy(storage);
  const oldCard = { id: 'a', userId: 'alice', dueAt: '2026-10-13T00:00:00.000Z' };
  const latestCard = { ...oldCard, dueAt: '2026-10-14T00:00:00.000Z', repetitions: 1 };
  const event = { cardId: 'a', rating: 'hard' as const, mode: 'recall', responseText: '', responseMs: 1,
    clientEventId: 'storage-retry-once', reviewedAt: '2026-10-13T00:00:00.000Z' };
  await store.cache('alice', { cards: [oldCard], courses: [], settings: { userId: 'alice' } });
  await store.enqueue('alice', event);
  const sent: string[] = [];
  const send = async (payload: ReviewEvent) => {
    sent.push(payload.clientEventId);
    return { card: latestCard, duplicate: sent.length > 1 };
  };
  failSnapshotWrite = true;
  expect(await store.sync('alice', async () => 'alice', send)).toEqual({ status: 'offline', synced: 0 });
  const reopened = new OfflineStudy(storage);
  expect((await reopened.outbox('alice')).map(p => p.event)).toEqual([event]);
  expect((await reopened.snapshot<{ cards: typeof oldCard[] }>('alice'))?.cards).toEqual([oldCard]);
  failSnapshotWrite = false;
  expect(await reopened.sync('alice', async () => 'alice', send)).toEqual({ status: 'ok', synced: 1 });
  expect(await reopened.outbox('alice')).toEqual([]);
  expect((await reopened.snapshot<{ cards: typeof latestCard[] }>('alice'))?.cards).toEqual([latestCard]);
  expect(sent).toEqual([event.clientEventId, event.clientEventId]);
});
