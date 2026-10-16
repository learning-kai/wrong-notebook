"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { OfflineStudy } from '@/lib/study-offline';
import { CardManager } from './cards';
import { CourseManager } from './courses';
import { ReviewHome } from './review-home';
import { ImportExport } from './import-export';
import { BackupPanel } from './backup';
import { SettingsPanel } from './settings';
import { Statistics } from './statistics';
import { SamplePanel } from './samples';
import { useStudyWorkspace, type QueueMode } from './use-study-workspace';
import type { CardDTO, Scope } from './types';
type Tab = 'review' | 'cards' | 'stats' | 'settings';
const TABS: [Tab, string][] = [['review', '复习'], ['cards', '卡片'], ['stats', '统计'], ['settings', '设置']];
export function StudyApp({ offlineStore: providedStore }: {
    offlineStore?: OfflineStudy;
} = {}) {
    const [store] = useState(() => providedStore || new OfflineStudy());
    const workspace = useStudyWorkspace(store);
    const [tab, setTab] = useState<Tab>('review');
    const [scope, setScope] = useState<Scope>({ courseId: '', chapterId: '', cardType: '', examDate: '' });
    const [queueMode, setQueueMode] = useState<QueueMode>('due');
    const [search, setSearch] = useState('');
    const [tag, setTag] = useState('');
    const [suspended, setSuspended] = useState<'all' | 'active' | 'paused'>('all');
    const [cardsView, setCardsView] = useState<'manage' | 'courses' | 'import' | 'backup'>('manage');
    const [trainingCards, setTrainingCards] = useState<CardDTO[]>([]);
    const [queueLoading, setQueueLoading] = useState(false);
    const [queueRevision, setQueueRevision] = useState(0);
    const revision = useRef(0);
    const { courses, settings, stats, allCards, loading, online, authenticated, pending, message, error } = workspace;
    const writable = online && authenticated;
    const filteredCards = useMemo(() => allCards.filter(c => (!scope.courseId || c.courseId === scope.courseId) && (!scope.chapterId || c.chapterId === scope.chapterId) && (!scope.cardType || c.cardType === scope.cardType) && (!tag || c.tags.includes(tag)) && (suspended === 'all' || c.suspended === (suspended === 'paused')) && (!search || [c.title, c.prompt, c.answer, c.formula, c.source, c.notes, c.roc].join('\n').toLocaleLowerCase().includes(search.toLocaleLowerCase()))), [allCards, scope, search, tag, suspended]);
    const queueKey = [queueMode, scope.courseId, scope.chapterId, settings?.userId, queueRevision].join(':');
    useEffect(() => {
        if (!authenticated || tab !== 'review')
            return;
        let cancelled = false;
        const version = ++revision.current;
        setQueueLoading(true);
        setTrainingCards([]);
        void workspace.queue(scope, queueMode).then(cards => { if (!cancelled && version === revision.current)
            setTrainingCards(cards); }).catch(e => workspace.setError(e instanceof Error ? e.message : '加载队列失败')).finally(() => { if (!cancelled && version === revision.current)
            setQueueLoading(false); });
        return () => { cancelled = true; };
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
  <header className="study-header"><Link className="study-button" href="/">返回错题本</Link><div className="study-brand"><h1>记忆训练</h1></div><span data-testid="study-connectivity" className={`study-status ${online ? '' : 'offline'}`} role="status"><i />{online ? '在线' : '离线'}{pending.length ? ` · ${pending.length} 条待同步` : ''}</span></header>
  {error && <p role="alert" className="study-error">{error}</p>}
  {message && <p role="status" className="study-success">{message}</p>}
  {!!pending.length && <section className="study-panel"><div className="study-section-head"><div><strong>{pending.length} 条待同步</strong><p className="study-muted">关闭页面后仍保留，同一事件只调度一次。{conflicts.length ? ` ${conflicts.length} 条冲突。` : ''}</p></div><div className="study-actions"><button data-testid="study-sync" disabled={!writable} onClick={() => workspace.sync()}>重试同步</button><button onClick={downloadOutbox}>导出记录</button></div></div>{conflicts.map(p => <p className="study-error" key={p.event.clientEventId}>{p.event.cardId} · {p.conflict}</p>)}</section>}
  <nav className="study-nav" aria-label="记忆训练页面">{TABS.map(([id, label]) => <button key={id} data-testid={`study-tab-${id}`} aria-current={tab === id} onClick={() => setTab(id)}>{label}{id === 'review' && stats?.due ? ` (${stats.due})` : ''}</button>)}</nav>
  {!authenticated && !loading ? <section className="study-empty">需要登录后使用。<Link href="/login">前往登录</Link>；离线需先完成在线初始化。</section> : <section aria-busy={loading}>
    {tab === 'review' && <ReviewHome stats={stats} courses={courses} scope={scope} onScope={setScope} queueMode={queueMode} onQueueMode={setQueueMode} cards={trainingCards} loading={queueLoading} onSubmit={workspace.review} onRestart={() => setQueueRevision(r => r + 1)}/>}
    {tab === 'cards' && <div className="study-stack"><nav className="study-subnav" aria-label="卡片管理">{([['manage', '卡片'], ['courses', '课程与章节'], ['import', '导入 / 导出'], ['backup', '完整备份']] as const).map(([id, label]) => <button key={id} type="button" data-testid={`cards-sub-${id}`} aria-current={cardsView === id} onClick={() => setCardsView(id)}>{label}</button>)}</nav>
      {cardsView === 'manage' && <><div className="study-toolbar"><label className="study-inline study-grow">搜索<input data-testid="card-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="标题、题面、答案或关键词"/></label><label className="study-inline">标签<input value={tag} onChange={e => setTag(e.target.value)} placeholder="全部标签"/></label><label className="study-inline">状态<select value={suspended} onChange={e => setSuspended(e.target.value as typeof suspended)}><option value="all">全部</option><option value="active">正常</option><option value="paused">已暂停</option></select></label></div><CardManager cards={filteredCards} courses={courses} scope={scope} search={search} onSearch={setSearch} onMutate={workspace.mutate} onRefresh={workspace.refresh} disabled={!writable}/></>}
      {cardsView === 'courses' && <CourseManager courses={courses} selectedId={scope.courseId} onSelect={id => setScope({ ...scope, courseId: id, chapterId: '' })} onMutate={workspace.mutate}/>}
      {cardsView === 'import' && <div className="study-stack"><ImportExport key={scope.courseId} scope={scope} onImported={workspace.refresh} disabled={!writable}/><SamplePanel onImported={workspace.refresh} disabled={!writable}/></div>}
      {cardsView === 'backup' && <BackupPanel onRestored={workspace.refresh} disabled={!writable}/>}
    </div>}
    {tab === 'stats' && (online ? <Statistics stats={stats}/> : <div className="study-empty">离线时不伪造服务器统计；联网同步后再查看。</div>)}
    {tab === 'settings' && settings && <SettingsPanel key={settings.userId} settings={settings} onSave={workspace.saveSettings} offlineCount={pending.length} disabled={!writable}/>}
   </section>}
  <footer className="study-muted" style={{ marginTop: 24 }}>离线复习：首次在线初始化后访问 <Link href="/study/offline">离线基础复习</Link>。不缓存凭据或其他账号。</footer>
 </div></main>;
}
