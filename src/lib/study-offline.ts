export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type ReviewEvent = { cardId: string; rating: Rating; mode: string; responseText: string; responseMs: number; clientEventId: string; reviewedAt: string };
export type PendingReview = { event: ReviewEvent; conflict?: string };
export type ReviewSyncResponse = { card: { id: string; userId: string } };
export type OfflineQueueOptions = {
  mode?: 'due' | 'mistakes' | 'today-mistakes' | 'random' | 'all';
  now?: Date;
  timezone?: string;
  examDate?: string;
  userId?: string;
  courseId?: string;
  chapterId?: string;
  cardType?: string;
  excludeCardIds?: ReadonlySet<string>;
};
type OfflineCard = {
  id: string;
  userId?: string;
  courseId?: string;
  chapterId?: string | null;
  cardType?: string;
  suspended?: boolean;
  dueAt: string;
  createdAt?: string;
  latestReview?: { rating?: string; reviewedAt?: string } | null;
};
function localDateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(date);
}
/** Keep the offline queue's eligibility rules in one pure, testable seam. */
export function offlineQueue<T extends OfflineCard>(cards: T[], options: OfflineQueueOptions = {}): T[] {
  const mode = options.mode ?? 'due';
  const timezone = options.timezone ?? 'Asia/Shanghai';
  const now = options.now ?? new Date();
  const today = localDateKey(now, timezone);
  let result = cards.filter(card => {
    if (options.userId && card.userId !== options.userId) return false;
    if (options.courseId && card.courseId !== options.courseId) return false;
    if (options.chapterId && card.chapterId !== options.chapterId) return false;
    if (options.cardType && card.cardType !== options.cardType) return false;
    if (card.suspended || options.excludeCardIds?.has(card.id)) return false;
    if (mode === 'due' && new Date(card.dueAt).getTime() > now.getTime()) return false;
    if (mode === 'mistakes' || mode === 'today-mistakes') {
      const latest = card.latestReview;
      if (!latest || !['again', 'hard'].includes(latest.rating ?? '')) return false;
      if (mode === 'today-mistakes' && (!latest.reviewedAt || localDateKey(new Date(latest.reviewedAt), timezone) !== today)) return false;
    }
    // examDate is a local calendar date, so its effective limit is the end of that date.
    if (options.examDate && localDateKey(new Date(card.dueAt), timezone) > options.examDate) return false;
    return true;
  });
  if (mode !== 'random') {
    result = result.slice().sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      || new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
      || a.id.localeCompare(b.id));
  } else {
    result = result.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
  }
  return result;
}
export interface OfflineStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  update?(key: string, change: (value: unknown) => unknown): Promise<void>;
}
const DB_NAME = 'study-memory-v1';
export class IndexedStudyStorage implements OfflineStorage {
  private async db(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('memory');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async get(key: string): Promise<unknown> {
    const db = await this.db();
    try { return await new Promise((resolve, reject) => {
      const request = db.transaction('memory').objectStore('memory').get(key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }); } finally { db.close(); }
  }
  async update(key: string, change: (value: unknown) => unknown): Promise<void> {
    const db = await this.db();
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('memory', 'readwrite'); const store = tx.objectStore('memory');
      const request = store.get(key);
      request.onsuccess = () => { try { store.put(change(request.result), key); } catch { tx.abort(); } };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(new Error('离线存储写入失败'));
    }); } finally { db.close(); }
  }
  async put(key: string, value: unknown): Promise<void> { await this.update(key, () => value); }
  async remove(key: string): Promise<void> {
    const db = await this.db();
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('memory', 'readwrite'); tx.objectStore('memory').delete(key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); } finally { db.close(); }
  }
}
export class OfflineStudy {
  constructor(private storage: OfflineStorage = new IndexedStudyStorage()) {}
  private key(userId: string, kind: string) { return `study:${encodeURIComponent(userId)}:${kind}`; }
  async outbox(userId: string): Promise<PendingReview[]> { return (await this.storage.get(this.key(userId, 'outbox')) as PendingReview[] | undefined) || []; }
  async enqueue(userId: string, event: ReviewEvent): Promise<void> {
    const key = this.key(userId, 'outbox');
    const change = (value: unknown) => {
      const entries = (value as PendingReview[] | undefined) || [];
      return entries.some(item => item.event.clientEventId === event.clientEventId) ? entries : [...entries, { event: { cardId:event.cardId, rating:event.rating, mode:event.mode, responseText:event.responseText, responseMs:event.responseMs, clientEventId:event.clientEventId, reviewedAt:event.reviewedAt } }];
    };
    if (this.storage.update) await this.storage.update(key, change); else await this.storage.put(key, change(await this.storage.get(key)));
  }
  async snapshot<T>(userId: string): Promise<T | null> {
    const value = await this.storage.get(this.key(userId, 'snapshot')) as T | undefined;
    if (!value || typeof value !== 'object') return null;
    const snapshot = value as T & { cards?: unknown[] };
    if (Array.isArray(snapshot.cards)) {
      // Sanitize snapshots written by an older client before displaying them.
      return { ...snapshot, cards: snapshot.cards.filter(card => !!card && typeof card === 'object' && (card as {userId?: unknown}).userId === userId) } as T;
    }
    return snapshot;
  }
  async activeUser(): Promise<string|null> { return (await this.storage.get(this.key('_runtime','active-user')) as string | undefined) || null; }
  async activate(userId: string): Promise<void> {
    const old = await this.activeUser();
    if (old && old !== userId) await this.clearSnapshot(old);
    await this.storage.put(this.key('_runtime','active-user'),userId);
  }
  async deactivate(): Promise<void> { await this.storage.remove(this.key('_runtime','active-user')); }
  async cache(userId: string, data: {cards: unknown[]; courses: unknown[]; settings: Record<string, unknown>}): Promise<void> {
    const allowed = ['dailyNewLimit','dailyReviewLimit','relearnMinutes','initialGoodDays','initialEasyDays','hardMultiplier','easyMultiplier','maxIntervalDays','examDate','timezone','theme','defaultsInitialized'];
    const settings = { userId, ...Object.fromEntries(allowed.filter(k => k in data.settings).map(k => [k,data.settings[k]])) };
    const cards = data.cards.filter(card => !!card && typeof card === 'object' && (card as {userId?: unknown}).userId === userId);
    await this.storage.put(this.key(userId, 'snapshot'), {cards,courses:data.courses,settings,cachedAt:new Date().toISOString()});
  }
  async clearSnapshot(userId: string): Promise<void> { await this.storage.remove(this.key(userId, 'snapshot')); }
  private async updateOutbox(userId: string, change: (entries: PendingReview[]) => PendingReview[]): Promise<void> {
    const key = this.key(userId, 'outbox'); const update = (v: unknown) => change((v as PendingReview[] | undefined) || []);
    if (this.storage.update) await this.storage.update(key, update); else await this.storage.put(key, update(await this.storage.get(key)));
  }
  private async upsertCachedCard(userId: string, card: unknown): Promise<void> {
    if (!card || typeof card !== 'object' || (card as {userId?: unknown}).userId !== userId) return;
    const key = this.key(userId, 'snapshot');
    const update = (value: unknown) => {
      if (!value || typeof value !== 'object') return value;
      const snapshot = value as {cards?: unknown[]};
      if (!Array.isArray(snapshot.cards)) return value;
      const cards = snapshot.cards.filter(item => !!item && typeof item === 'object' && (item as {userId?: unknown}).userId === userId && (item as {id?: unknown}).id !== (card as {id?: unknown}).id);
      return {...snapshot, cards: [...cards, card]};
    };
    if (this.storage.update) await this.storage.update(key, update);
    else await this.storage.put(key, update(await this.storage.get(key)));
  }
  private syncing = new Map<string, Promise<{status:string; synced:number}>>();
  async sync(userId: string, identity: () => Promise<string>, send: (event: ReviewEvent) => Promise<ReviewSyncResponse>): Promise<{status:string; synced:number}> {
    const running = this.syncing.get(userId); if (running) return running;
    const run = async () => {
      let synced = 0;
      try {
        if (await identity() !== userId) { await this.clearSnapshot(userId); return {status:'account-mismatch',synced}; }
        for (const item of await this.outbox(userId)) {
          try {
            const response = await send(item.event);
            const latestCard = response?.card;
            if (!latestCard || latestCard.userId !== userId || latestCard.id !== item.event.cardId) {
              throw new Error('同步响应缺少当前账号的对应卡片，记录仍保留。');
            }
            // Persist the authoritative card before acknowledging this event, even if a later event fails.
            await this.upsertCachedCard(userId, latestCard);
            await this.updateOutbox(userId, entries => entries.filter(e => e.event.clientEventId !== item.event.clientEventId)); synced++;
          } catch (error) {
            const status = (error as {status?:number}).status;
            if (status === 401) { await this.clearSnapshot(userId); return {status:'unauthorized',synced}; }
            if (status === 404 || status === 409 || status === 400 || status === 403 || status === 422) {
              await this.updateOutbox(userId, entries => entries.map(e => e.event.clientEventId === item.event.clientEventId ? {...e,conflict:`服务器拒绝此记录（${status}），原记录仍保留。请检查卡片或导出待同步记录。`} : e));
              return {status:'conflict',synced};
            }
            return {status:'offline',synced};
          }
        }
        return {status:'ok',synced};
      } catch (error) {
        if ((error as {status?:number}).status === 401) { await this.clearSnapshot(userId); return {status:'unauthorized',synced}; }
        return {status:'offline',synced};
      }
    };
    const promise = run(); this.syncing.set(userId,promise);
    try {return await promise;} finally {this.syncing.delete(userId);}
  }
}
