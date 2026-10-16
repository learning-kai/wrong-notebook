"use client";
import { useEffect, useRef, useState } from 'react';
import { OfflineStudy, offlineQueue, type PendingReview, type ReviewEvent } from '@/lib/study-offline';
import { studyRequest, StudyApiError } from './api';
import type { CardDTO, Course, Scope, StudySettingsDTO, StudyStats } from './types';
import { query } from './types';
export type StudySnapshot = {
    cards: CardDTO[];
    courses: Course[];
    settings: StudySettingsDTO;
    cachedAt: string;
};
export type QueueMode = 'due' | 'mistakes' | 'today-mistakes' | 'random' | 'all';
export function useStudyWorkspace(store: OfflineStudy) {
    const [courses, setCourses] = useState<Course[]>([]);
    const [settings, setSettings] = useState<StudySettingsDTO | null>(null);
    const [stats, setStats] = useState<StudyStats | null>(null);
    const [allCards, setAllCards] = useState<CardDTO[]>([]);
    const [loading, setLoading] = useState(true);
    const [online, setOnline] = useState(true);
    const [authenticated, setAuthenticated] = useState(false);
    const [pending, setPending] = useState<PendingReview[]>([]);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [storageReady, setStorageReady] = useState(true);
    const current = useRef<{
        settings: StudySettingsDTO;
        courses: Course[];
        cards: CardDTO[];
    } | null>(null);
    const generation = useRef(0);
    async function hideIdentity(reason: string) {
        generation.current++;
        try {
            const id = await store.activeUser();
            if (id)
                await store.clearSnapshot(id);
            await store.deactivate();
        }
        catch { }
        current.current = null;
        setSettings(null);
        setCourses([]);
        setAllCards([]);
        setStats(null);
        setPending([]);
        setAuthenticated(false);
        setError(reason);
    }
    async function cache() {
        if (!current.current)
            return;
        const state = current.current;
        try {
            await store.activate(state.settings.userId);
            await store.cache(state.settings.userId, { cards: state.cards, courses: state.courses, settings: state.settings as unknown as Record<string, unknown> });
            setPending(await store.outbox(state.settings.userId));
            setStorageReady(true);
        }
        catch {
            setStorageReady(false);
            setError('浏览器未允许 IndexedDB；在线仍可复习，但不能承诺离线保存。请检查存储权限。');
        }
    }
    async function loadCached() {
        try {
            const id = await store.activeUser();
            const cached = id ? await store.snapshot<StudySnapshot>(id) : null;
            if (!cached) {
                setError('尚未完成在线初始化。请先联网登录并进入 /study，之后可使用离线基础复习。');
                return;
            }
            current.current = { settings: cached.settings, courses: cached.courses, cards: cached.cards };
            setSettings(cached.settings);
            setCourses(cached.courses);
            setAllCards(cached.cards);
            setStats(null);
            setAuthenticated(true);
            setPending(await store.outbox(id!));
            setMessage(`最近缓存：${new Date(cached.cachedAt).toLocaleString()}。服务器统计 / 编辑在离线时不可用。`);
        }
        catch {
            setError('无法读取离线数据库。请检查浏览器存储权限并联网初始化。');
            setStorageReady(false);
        }
    }
    async function refresh() {
        setLoading(true);
        setError('');
        const token = ++generation.current;
        if (!navigator.onLine) {
            setOnline(false);
            await loadCached();
            setLoading(false);
            return;
        }
        setOnline(true);
        try {
            // Identity is resolved before any user cache is displayed or overwritten.
            const nextSettings = await studyRequest<StudySettingsDTO>('/settings');
            if (!nextSettings.userId)
                throw new Error('设置响应缺少当前用户 ID，已停止离线缓存。');
            const [nextCourses, nextStats] = await Promise.all([studyRequest<Course[]>('/courses'), studyRequest<StudyStats>('/stats')]);
            const nextCards: CardDTO[] = [];
            for (let offset = 0;; offset += 500) {
                const page = await studyRequest<CardDTO[]>(`/cards?limit=500&offset=${offset}`);
                nextCards.push(...page);
                if (page.length < 500)
                    break;
            }
            if (token !== generation.current)
                return;
            current.current = { settings: nextSettings, courses: nextCourses, cards: nextCards };
            setSettings(nextSettings);
            setCourses(nextCourses);
            setStats(nextStats);
            setAllCards(nextCards);
            setAuthenticated(true);
            await cache();
            await sync();
        }
        catch (e) {
            if (e instanceof StudyApiError && e.status === 401) {
                await hideIdentity('登录已失效：暂停同步并清除显示缓存。待同步记录保留；请登录原账号后继续。');
            }
            else {
                setError(e instanceof Error ? e.message : '数据加载失败');
                if (!(e instanceof StudyApiError)) {
                    setOnline(false);
                    await loadCached();
                }
            }
        }
        finally {
            setLoading(false);
        }
    }
    async function sync() {
        const state = current.current;
        if (!state || !navigator.onLine)
            return;
        const id = state.settings.userId;
        const result = await store.sync(id, async () => (await studyRequest<StudySettingsDTO>('/settings')).userId, async (event) => {
            const result = await studyRequest<{
                card: CardDTO;
            }>('/review', { method: 'POST', body: JSON.stringify(event) });
            if (current.current?.settings.userId === id && result.card?.userId === id && result.card.id === event.cardId) {
                current.current.cards = current.current.cards.map(c => c.id === result.card.id ? result.card : c);
                setAllCards([...current.current.cards]);
            }
            return result;
        });
        if (result.status === 'unauthorized' || result.status === 'account-mismatch') {
            await hideIdentity('登录失效或账号变化，复习未跨账号发送。请登录原账号恢复同步。');
            return;
        }
        setPending(await store.outbox(id));
        if (result.status === 'conflict')
            setError('存在同步冲突：卡片已删除或服务器拒绝。记录仍保留，可导出后处理；不会静默丢弃。');
        else if (result.status === 'offline') {
            setOnline(false);
            setMessage('网络暂不可用，记录已保存在本机，恢复后继续同步。');
        }
        else if (result.synced) {
            setMessage(`已同步 ${result.synced} 条复习。`);
            setStats(await studyRequest<StudyStats>('/stats').catch(() => null));
            await cache();
        }
    }
    async function review(event: ReviewEvent) {
        const state = current.current;
        if (!state)
            throw new Error('当前账号尚未验证，无法保存。');
        if (!storageReady) {
            if (!navigator.onLine)
                throw new Error('离线存储不可用，未保存。');
            await studyRequest('/review', { method: 'POST', body: JSON.stringify(event) });
            return;
        }
        await store.enqueue(state.settings.userId, event);
        setPending(await store.outbox(state.settings.userId));
        if (navigator.onLine)
            await sync();
        else
            setMessage('复习已持久化到本机。恢复网络并登录相同账号后自动同步。');
    }
    async function mutate(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
        if (!online || !authenticated)
            throw new Error('此操作需要联网登录。');
        await studyRequest(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
        await refresh();
    }
    async function saveSettings(body: Partial<StudySettingsDTO>) {
        await studyRequest('/settings', { method: 'PATCH', body: JSON.stringify(body) });
        await refresh();
    }
    async function queue(scope: Scope, mode: QueueMode) {
        if (online)
            return studyRequest<CardDTO[]>(`/review${query({...scope,mode,limit:500})}`);
        return offlineQueue(allCards, { mode, timezone: settings?.timezone, examDate: scope.examDate, userId: settings?.userId, courseId: scope.courseId, chapterId: scope.chapterId, cardType: scope.cardType, excludeCardIds: new Set(pending.map(p => p.event.cardId)) });
    }
    useEffect(() => {
        void refresh();
        const cameOnline = () => { setOnline(true); void refresh(); };
        const wentOffline = () => setOnline(false);
        const changedAuth = (e: StorageEvent) => { if (e.key === 'nextauth.message' && navigator.onLine)
            void refresh(); };
        const focused = () => { if (navigator.onLine)
            void studyRequest<StudySettingsDTO>('/settings').then(next => { if (current.current && next.userId !== current.current.settings.userId)
                void hideIdentity('账号已更换，显示缓存已清除。刷新以加载当前账号。'); }).catch(e => { if (e instanceof StudyApiError && e.status === 401)
                void hideIdentity('已退出登录。未同步事件保留，缓存显示已清除。'); }); };
        const workerMessage = (event: MessageEvent) => { if (event.data?.type === 'CLEAR_STUDY_IDENTITY')
            void hideIdentity('已退出登录。显示缓存已清除；未同步复习事件仍保留。'); };
        navigator.serviceWorker?.addEventListener('message', workerMessage);
        window.addEventListener('online', cameOnline);
        window.addEventListener('offline', wentOffline);
        window.addEventListener('storage', changedAuth);
        window.addEventListener('focus', focused);
        return () => { navigator.serviceWorker?.removeEventListener('message', workerMessage); window.removeEventListener('online', cameOnline); window.removeEventListener('offline', wentOffline); window.removeEventListener('storage', changedAuth); window.removeEventListener('focus', focused); };
        // The stable store is created once by the owning application.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store]);
    return { courses, settings, stats, allCards, loading, online, authenticated, pending, message, error, storageReady, refresh, queue, mutate, saveSettings, review, sync, setError };
}
