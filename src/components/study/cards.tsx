"use client";
import { useState } from 'react';
import { CardEditor, CARD_FIELDS } from './card-editor';
import type { CardDetail, CardDTO, Course, Scope } from './types';
import type { Mutate } from './courses';
import { studyRequest } from './api';
import { StudyMarkdown } from './study-markdown';
export function CardManager({ cards, courses, scope, search, onSearch, onMutate, onRefresh, disabled = false }: {
    cards: CardDTO[];
    courses: Course[];
    scope: Scope;
    search: string;
    onSearch: (v: string) => void;
    onMutate: Mutate;
    onRefresh: () => void;
    disabled?: boolean;
}) {
    const [editing, setEditing] = useState<CardDTO | 'new' | null>(null);
    const [detail, setDetail] = useState<CardDetail | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function act(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) { if (busy)
        return; setBusy(true); setError(''); try {
        await onMutate(path, method, body);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '操作失败');
    }
    finally {
        setBusy(false);
    } }
    async function history(id: string) { setBusy(true); setError(''); try {
        setDetail(await studyRequest<CardDetail>(`/cards/${id}`));
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
    }
    finally {
        setBusy(false);
    } }
    return <div className="study-stack"><section className="study-panel"><div className="study-section-head"><div><h2>卡片管理</h2><p className="study-muted">当前筛选 {cards.length} 张 · 查看详情可编辑结构化内容、到期时间和历史。</p></div><div className="study-actions"><button className="study-primary" data-testid="card-new" disabled={disabled || !courses.length} onClick={() => setEditing('new')}>新增卡片</button><button disabled={busy || disabled} onClick={onRefresh}>刷新列表</button></div></div><label>搜索标题、题面、答案或关键词<input data-testid="card-search" type="search" value={search} onChange={e => onSearch(e.target.value)} placeholder="输入关键词"/></label>{error && <p role="alert" className="study-error">{error}</p>}</section>
 {editing && <CardEditor key={editing === 'new' ? 'new' : editing.id} card={editing === 'new' ? undefined : editing} courses={courses} courseId={scope.courseId} chapterId={scope.chapterId} onCancel={() => setEditing(null)} onSave={async (body) => { await onMutate(editing === 'new' ? '/cards' : `/cards/${editing.id}`, editing === 'new' ? 'POST' : 'PATCH', body); setEditing(null); }}/>}
 {detail && <section className="study-panel"><div className="study-section-head"><h2>{detail.title} · 详情与复习历史</h2><button onClick={() => setDetail(null)}>关闭详情</button></div>{CARD_FIELDS.filter(([key]) => detail[key]).map(([key, label]) => <details key={key} open={key === 'prompt' || key === 'answer'}><summary>{label}</summary><StudyMarkdown content={detail[key] || ''}/></details>)}<p>下次复习 {new Date(detail.dueAt).toLocaleString()} · 间隔 {detail.intervalDays} 天 · 遗忘 {detail.lapses} 次</p><div className="study-table-wrap"><table><thead><tr><th>时间</th><th>自评分</th><th>模式</th><th>你的回答</th><th>下次复习</th></tr></thead><tbody>{detail.reviews?.map(r => <tr key={r.id}><td>{new Date(r.reviewedAt).toLocaleString()}</td><td>{r.rating}</td><td>{r.mode}</td><td><pre>{r.responseText || '（未作答）'}</pre></td><td>{r.nextDueAt ? new Date(r.nextDueAt).toLocaleString() : '—'}</td></tr>)}</tbody></table>{!detail.reviews?.length && <p className="study-muted">暂无复习历史。</p>}</div></section>}
 {cards.length ? <div className="study-card-grid">{cards.map(card => <article className="study-panel" key={card.id}><p className="study-eyebrow">{card.course.name}{card.chapter ? ` · ${card.chapter.name}` : ''} · {card.cardType}</p><h3>{card.title}</h3><StudyMarkdown content={card.prompt}/><p className="study-muted">下次：{new Date(card.dueAt).toLocaleString()} · {card.suspended ? '已暂停' : `已复习 ${card.repetitions ?? 0} 次`}</p><div className="study-tags">{card.tags.map(t => <span key={t}>{t}</span>)}</div><div className="study-actions"><button disabled={busy || disabled} onClick={() => setEditing(card)}>编辑 / 到期</button><button data-testid={`card-copy-${card.id}`} disabled={busy || disabled} onClick={() => act(`/cards/${card.id}/copy`, 'POST')}>复制</button><button data-testid={`card-suspend-${card.id}`} disabled={busy || disabled} onClick={() => act(`/cards/${card.id}`, 'PATCH', { suspended: !card.suspended })}>{card.suspended ? '恢复复习' : '暂停'}</button><button data-testid={`card-history-${card.id}`} disabled={busy || disabled} onClick={() => history(card.id)}>详情 / 历史</button><button className="study-danger" disabled={busy || disabled} onClick={() => { if (window.confirm('确定删除此卡片及其复习历史？'))
        void act(`/cards/${card.id}`, 'DELETE'); }}>删除</button></div></article>)}</div> : <div className="study-empty">此范围暂无卡片。新增、导入或调整搜索条件。</div>}
 </div>;
}
