"use client";
import { useEffect, useRef, useState } from 'react';
import { OfflineStudy, offlineQueue, type Rating } from '@/lib/study-offline';
import type { CardDTO, StudySettingsDTO } from './types';
import type { StudySnapshot } from './use-study-workspace';
import { studyRequest, StudyApiError } from './api';
import { StudyMarkdown } from './study-markdown';
export function OfflineBasic({ offlineStore: provided }: {
    offlineStore?: OfflineStudy;
} = {}) {
    const [store] = useState(() => provided || new OfflineStudy());
    const [userId, setUserId] = useState('');
    const [cards, setCards] = useState<CardDTO[]>([]);
    const [answer, setAnswer] = useState('');
    const [revealed, setRevealed] = useState(false);
    const [count, setCount] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [online, setOnline] = useState(false);
    const [ready, setReady] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const lock = useRef(false);
    const eventId = useRef('');
    const started = useRef(Date.now());
    const current = cards[0];
    async function load() {
        try {
            const id = await store.activeUser();
            const snapshot = id ? await store.snapshot<StudySnapshot>(id) : null;
            if (!id || !snapshot) {
                setCards([]);
                setUserId('');
                setError('没有可用的当前账号缓存。请先联网登录，并打开 /study 初始化离线基础复习。');
                return;
            }
            if (navigator.onLine) {
                const identity = await studyRequest<StudySettingsDTO>('/settings');
                if (identity.userId !== id) {
                    await store.clearSnapshot(id);
                    await store.deactivate();
                    setCards([]);
                    setUserId('');
                    setError('账号已切换，已清除旧账号显示缓存。请到完整记忆训练初始化当前账号。');
                    return;
                }
            }
            const pending = await store.outbox(id);
            setUserId(id);
            setCount(pending.length);
            setCards(offlineQueue(snapshot.cards as CardDTO[], { userId: id, excludeCardIds: new Set(pending.map(item => item.event.cardId)), mode: showAll ? 'all' : 'due', timezone: snapshot.settings.timezone as string | undefined }));
            setMessage(`缓存时间 ${new Date(snapshot.cachedAt).toLocaleString()}。这里只提供基础回忆，不自动更新服务器统计。`);
        }
        catch (e) {
            if (e instanceof StudyApiError && e.status === 401) {
                const id = await store.activeUser();
                if (id)
                    await store.clearSnapshot(id);
                await store.deactivate();
                setCards([]);
                setUserId('');
                setError('登录失效。已清除显示缓存；未同步事件保留，请登录原账号后继续。');
            }
            else
                setError('无法读取本地缓存或网络，请检查浏览器存储权限。');
        }
        finally {
            setReady(true);
        }
    }
    async function sync() { if (!userId)
        return; setBusy(true); try {
        const result = await store.sync(userId, async () => (await studyRequest<StudySettingsDTO>('/settings')).userId, async (event) => studyRequest('/review', { method: 'POST', body: JSON.stringify(event) }));
        if (result.status === 'account-mismatch' || result.status === 'unauthorized') {
            await store.clearSnapshot(userId);
            await store.deactivate();
            setCards([]);
            setUserId('');
            setError('账号已改变或登录失效，已停止显示与同步。请登录原账号；待同步数据仍保留。');
            return;
        }
        setCount((await store.outbox(userId)).length);
        setMessage(result.status === 'ok' ? `已同步 ${result.synced} 条记录。` : result.status === 'conflict' ? '存在卡片删除 / 数据冲突，待同步记录仍保留。' : '网络不可用，记录仍保留。');
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => {
        void load();
        const on = () => { setOnline(true); void load(); };
        const off = () => setOnline(false);
        setOnline(navigator.onLine);
        const cleared = (event: MessageEvent) => { if (event.data?.type === 'CLEAR_STUDY_IDENTITY') {
            setCards([]);
            setUserId('');
            setRevealed(false);
            setAnswer('');
            setError('已退出登录，显示缓存已清除。未同步复习仍保留。');
        } };
        navigator.serviceWorker?.addEventListener('message', cleared);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { navigator.serviceWorker?.removeEventListener('message', cleared); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store, showAll]);
    useEffect(() => {
        if (online && userId)
            void sync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [online, userId]);
    useEffect(() => { setAnswer(''); setRevealed(false); eventId.current = crypto.randomUUID(); started.current = Date.now(); }, [current?.id]);
    async function rate(rating: Rating) { if (lock.current || !current || !userId)
        return; lock.current = true; setBusy(true); setError(''); try {
        await store.enqueue(userId, { cardId: current.id, rating, mode: 'recall', responseText: answer, responseMs: Math.min(86400000, Math.max(0, Date.now() - started.current)), reviewedAt: new Date().toISOString(), clientEventId: eventId.current });
        setCount((await store.outbox(userId)).length);
        setCards(c => c.filter(card => card.id !== current.id));
        setAnswer('');
        setRevealed(false);
    }
    catch {
        setError('本机保存失败：这张卡未完成，请重试，不要关闭页面。');
    }
    finally {
        lock.current = false;
        setBusy(false);
        if (navigator.onLine)
            void sync();
    } }
    return <main className="study-page study-theme-system"><div className="study-wrap study-stack"><header className="study-header"><div className="study-brand"><h1>离线基础复习</h1><p className="study-muted">仅使用本机当前用户的记忆缓存，未保存凭据。</p></div><span data-testid="study-connectivity" className={`study-status ${online ? '' : 'offline'}`}>{online ? '在线' : '离线'} · {count} 条待同步</span><a className="study-button" href="/study">返回完整记忆训练</a></header>{error && <p role="alert" className="study-error">{error}</p>}{message && <p role="status" className="study-success">{message}</p>}<section className="study-panel study-actions"><label className="study-check"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}/>包含所有未暂停缓存卡（否则仅到期）</label><button disabled={!online || busy || !userId} onClick={sync}>重试同步</button><button disabled={busy} onClick={load}>刷新本地队列</button></section>
 {!ready ? <p role="status">读取本地缓存…</p> : current ? <article className="study-review-card"><p className="study-eyebrow">{current.course.name} · 下次复习 {new Date(current.dueAt).toLocaleString()} · 剩余 {cards.length} 张</p><h2>{current.title}</h2><StudyMarkdown content={current.prompt}/><label>你的作答<textarea data-testid="study-answer-input" rows={6} value={answer} disabled={busy || revealed} onChange={e => setAnswer(e.target.value)}/></label>{revealed ? <><div className="study-answer-columns"><section><h3>你的回答</h3><StudyMarkdown content={answer || '（未作答）'}/></section><section><h3>参考答案</h3><StudyMarkdown content={current.answer}/></section></div><p className="study-warning">离线基础壳使用与完整训练相同的 KaTeX 渲染；不自动判题，请自行对照。</p><div className="study-rating-grid">{(['again', 'hard', 'good', 'easy'] as const).map(r => <button key={r} data-testid={`study-review-submit-${r}`} disabled={busy} onClick={() => rate(r)}>{r === 'again' ? '忘记了' : r === 'hard' ? '困难' : r === 'good' ? '掌握' : '熟练'}</button>)}</div></> : <button data-testid="study-review-reveal" disabled={busy} className="study-primary" onClick={() => setRevealed(true)}>显示答案</button>}</article> : <section className="study-empty"><h2>{userId ? '本轮完成 / 当前没有到期卡' : '尚未初始化离线缓存'}</h2><p>待同步记录关闭后保留；联网后仅提交给已确认的原账号。</p></section>}
 </div></main>;
}
