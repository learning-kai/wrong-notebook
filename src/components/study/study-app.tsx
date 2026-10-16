"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { OfflineStudy } from '@/lib/study-offline';
import { CardManager } from './cards';
import { CourseManager } from './courses';
import { ScopeFilters } from './scope-filters';
import { ReviewView } from './review';
import { ImportExport } from './import-export';
import { BackupPanel } from './backup';
import { SettingsPanel } from './settings';
import { Statistics } from './statistics';
import { SamplePanel } from './samples';
import { Overview } from './overview';
import { useStudyWorkspace, type QueueMode } from './use-study-workspace';
import type { CardDTO, Scope } from './types';
type Tab = 'overview' | 'courses' | 'cards' | 'training' | 'mistakes' | 'import' | 'stats' | 'settings' | 'backup';
const TABS: [
    Tab,
    string
][] = [['overview', '概览'], ['courses', '课程'], ['cards', '卡片'], ['training', '训练'], ['mistakes', '错题'], ['stats', '统计'], ['settings', '设置'], ['import', '导入 / 导出'], ['backup', '完整备份']];
export function StudyApp({ offlineStore: providedStore }: {
    offlineStore?: OfflineStudy;
} = {}) {
    const [store] = useState(() => providedStore || new OfflineStudy());
    const workspace = useStudyWorkspace(store);
    const [tab, setTab] = useState<Tab>('overview');
    const [scope, setScope] = useState<Scope>({ courseId: '', chapterId: '', cardType: '', examDate: '' });
    const [queueMode, setQueueMode] = useState<QueueMode>('due');
    const [search, setSearch] = useState('');
    const [tag, setTag] = useState('');
    const [suspended, setSuspended] = useState<'all' | 'active' | 'paused'>('all');
    const [trainingCards, setTrainingCards] = useState<CardDTO[]>([]);
    const [queueLoading, setQueueLoading] = useState(false);
    const [queueRevision, setQueueRevision] = useState(0);
    const revision = useRef(0);
    const { courses, settings, stats, allCards, loading, online, authenticated, pending, message, error } = workspace;
    const writable = online && authenticated;
    const filteredCards = useMemo(() => allCards.filter(c => (!scope.courseId || c.courseId === scope.courseId) && (!scope.chapterId || c.chapterId === scope.chapterId) && (!scope.cardType || c.cardType === scope.cardType) && (!tag || c.tags.includes(tag)) && (suspended === 'all' || c.suspended === (suspended === 'paused')) && (!search || [c.title, c.prompt, c.answer, c.formula, c.source, c.notes, c.roc].join('\n').toLocaleLowerCase().includes(search.toLocaleLowerCase()))), [allCards, scope, search, tag, suspended]);
    const queueKey = [tab === 'mistakes' ? 'mistakes' : queueMode, scope.courseId, scope.chapterId, scope.cardType, scope.examDate, settings?.userId, queueRevision].join(':');
    useEffect(() => {
        if (!authenticated || (tab !== 'training' && tab !== 'mistakes'))
            return;
        let cancelled = false;
        const version = ++revision.current;
        setQueueLoading(true);
        setTrainingCards([]);
        void workspace.queue(scope, tab === 'mistakes' ? (queueMode === 'today-mistakes' ? 'today-mistakes' : 'mistakes') : queueMode).then(cards => { if (!cancelled && version === revision.current)
            setTrainingCards(cards); }).catch(e => workspace.setError(e instanceof Error ? e.message : '加载队列失败')).finally(() => { if (!cancelled && version === revision.current)
            setQueueLoading(false); });
        return () => { cancelled = true; };
        // Do not refetch on rated card/cache changes: this is a stable session, not a shrinking indexed queue.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queueKey, tab, authenticated]);
    useEffect(() => {
        if (!authenticated || !online || !('serviceWorker' in navigator))
            return;
        void navigator.serviceWorker.register('/study-sw.js', { scope: '/' }).then(async (registration) => { await navigator.serviceWorker.ready; const worker = registration.active || registration.waiting; worker?.postMessage({ type: 'INITIALIZE_STUDY_SHELL' }); }).catch(() => workspace.setError('浏览器未启用离线页面缓存；IndexedDB 待同步记录仍会保留。'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authenticated, online]);
    const conflicts = pending.filter(p => p.conflict);
    function downloadOutbox() { const url = URL.createObjectURL(new Blob([JSON.stringify({ userId: settings?.userId, events: pending }, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'study-unsynced-reviews.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return <main className={`study-page study-theme-${settings?.theme || 'system'}`}><div className="study-wrap">
  <header className="study-header"><Link className="study-button" href="/">返回错题本</Link><div className="study-brand"><h1>记忆训练</h1><p className="study-muted">主动回忆 · 间隔复习 · 用户自己的知识库</p></div><span data-testid="study-connectivity" className={`study-status ${online ? '' : 'offline'}`} role="status"><i />{online ? '在线' : '离线'}{pending.length ? ` · ${pending.length} 条待同步` : ''}</span><button disabled={loading} onClick={() => { void workspace.refresh(); setQueueRevision(r => r + 1); }}>{loading ? '加载中…' : '刷新'}</button></header>
  {error && <p role="alert" className="study-error">{error}</p>}
  {message && <p role="status" className="study-success">{message}</p>}
  {!!pending.length && <section className="study-panel"><div className="study-section-head"><div><strong>{pending.length} 条已持久化的复习待同步</strong><p className="study-muted">关闭页面后仍保留，同一事件编号只调度一次。{conflicts.length ? ` ${conflicts.length} 条冲突：请检查卡片或导出记录。` : ''}</p></div><div className="study-actions"><button data-testid="study-sync" disabled={!writable} onClick={() => workspace.sync()}>重试同步</button><button onClick={downloadOutbox}>导出待同步记录</button></div></div>{conflicts.map(p => <p className="study-error" key={p.event.clientEventId}>{p.event.cardId} · {p.conflict}</p>)}</section>}
  <nav className="study-nav" aria-label="记忆训练页面">{TABS.map(([id, label]) => <button key={id} data-testid={`study-tab-${id}`} aria-current={tab === id} onClick={() => { setTab(id); if (id === 'mistakes')
        setQueueMode('mistakes'); }}>{label}{id === 'training' && stats?.due ? ` (${stats.due})` : ''}</button>)}</nav>
  <div className="study-layout"><ScopeFilters courses={courses} scope={scope} onChange={setScope} disabled={loading}/>
   {!authenticated && !loading ? <section className="study-empty">需要登录后使用。<Link href="/login">前往登录</Link>；离线需先完成在线初始化。</section> : <section aria-busy={loading}>
    {tab === 'overview' && <Overview stats={stats} courses={courses} onStart={() => setTab('training')}/>}
    {tab === 'courses' && <CourseManager courses={courses} selectedId={scope.courseId} onSelect={id => setScope({ ...scope, courseId: id, chapterId: '' })} onMutate={workspace.mutate}/>}
    {tab === 'cards' && <><div className="study-filter-grid study-panel"><label>标签<input value={tag} onChange={e => setTag(e.target.value)} placeholder="全部标签"/></label><label>暂停状态<select value={suspended} onChange={e => setSuspended(e.target.value as typeof suspended)}><option value="all">全部</option><option value="active">正常复习</option><option value="paused">已暂停</option></select></label></div><CardManager cards={filteredCards} courses={courses} scope={scope} search={search} onSearch={setSearch} onMutate={workspace.mutate} onRefresh={workspace.refresh} disabled={!writable}/></>}
    {(tab === 'training' || tab === 'mistakes') && <div className="study-stack"><section className="study-panel study-section-head"><label>队列范围（与训练任务分别选择）<select data-testid="study-queue-mode" value={queueMode} onChange={e => { const next = e.target.value as QueueMode; setQueueMode(next); if (tab === 'mistakes' && next !== 'mistakes' && next !== 'today-mistakes')
            setTab('training'); }}><option value="due">今日到期</option><option value="mistakes">当前错题</option><option value="today-mistakes">今日错题</option><option value="random">随机</option><option value="all">全部</option></select></label><button disabled={queueLoading} onClick={() => setQueueRevision(r => r + 1)}>重新开始 / 刷新队列</button></section>{queueLoading ? <section className="study-panel" role="status">正在载入训练队列…</section> : <ReviewView key={tab === 'mistakes' ? `mistakes:${queueKey}` : queueKey} cards={trainingCards} onSubmit={workspace.review}/>}</div>}
    {tab === 'import' && <div className="study-stack"><ImportExport key={scope.courseId} scope={scope} onImported={workspace.refresh} disabled={!writable}/><SamplePanel onImported={workspace.refresh} disabled={!writable}/></div>}
    {tab === 'stats' && (online ? <Statistics stats={stats}/> : <div className="study-empty">离线时不伪造服务器统计；联网同步后再查看。</div>)}
    {tab === 'settings' && settings && <SettingsPanel key={settings.userId} settings={settings} onSave={workspace.saveSettings} offlineCount={pending.length} disabled={!writable}/>}
    {tab === 'backup' && <BackupPanel onRestored={workspace.refresh} disabled={!writable}/>}
   </section>}
  </div>
  <footer className="study-muted" style={{ marginTop: 24 }}>离线基础复习：首次在线初始化后访问 <Link href="/study/offline">/study/offline</Link>。不缓存认证响应、凭据或其他账号；未同步事件只会提交给原账号。</footer>
 </div></main>;
}
