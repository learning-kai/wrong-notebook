"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardDTO } from './types';
import { completeCard, startSession } from './session';
import { buildTrainingTask, TRAINING_MODES } from '@/lib/study-training';
import { StudyMarkdown } from './study-markdown';
import type { Rating, ReviewEvent } from '@/lib/study-offline';
type Mode = typeof TRAINING_MODES[number]['id'];
export function ReviewView({ cards, onSubmit }: {
    cards: CardDTO[];
    onSubmit: (event: ReviewEvent) => Promise<unknown>;
}) {
    const [session, setSession] = useState(() => startSession(cards));
    const [mode, setMode] = useState<Mode>('recall');
    const [answer, setAnswer] = useState('');
    const [revealed, setRevealed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [slots, setSlots] = useState<Record<string, string>>({});
    const [order, setOrder] = useState<number[]>([]);
    const [selected, setSelected] = useState<number[]>([]);
    const [matches, setMatches] = useState<Record<number, string>>({});
    const lock = useRef(false);
    const attempt = useRef<ReviewEvent | null>(null);
    const eventId = useRef('');
    const started = useRef(Date.now());
    const card = session.queue[0];
    useEffect(() => { setSession(startSession(cards)); }, [cards]);
    useEffect(() => { setAnswer(''); setRevealed(false); setError(''); setSlots({}); setOrder([]); setSelected([]); setMatches({}); attempt.current = null; eventId.current = crypto.randomUUID(); started.current = Date.now(); }, [card?.id, mode]);
    const task = useMemo(() => {
        if (!card)
            return null;
        const built = buildTrainingTask({ ...card, course: card.course.name, chapter: card.chapter?.name ?? null, chapterId: card.chapterId ?? undefined }, mode, slots);
        if (mode === 'compare' && card.comparison && !built.expectedAnswer)
            return { ...built, prompt: card.prompt || card.title, expectedAnswer: card.comparison };
        return built;
    }, [card, mode, slots]);
    const items = task?.items || [];
    const itemOrder = order.length ? order : items.map((_, i) => i).reverse();
    const keywordNames = useMemo(() => card ? [...new Set(Object.keys(card.slots || {}).concat([...Object.values(card).filter(v => typeof v === 'string').join('\n').matchAll(/\{\{([\w-]+)\}\}/g)].map(m => m[1])))] : [], [card]);
    const matchPairs = task?.pairs?.length ? task.pairs : (mode === 'template-match' && card ? [...Object.entries(card.slots || {}).map(([left, right]) => ({ left, right })), ...[['书信类型', card.letterType], ['段落位置', card.paragraphPosition], ['句子功能', card.sentenceFunction]].filter(([, right]) => !!right).map(([left, right]) => ({ left: left!, right: right! }))] : []);
    function taskResponse() {
        if (task?.kind === 'order')
            return itemOrder.map(i => items[i]).join('\n');
        if (task?.kind === 'compose')
            return selected.map(i => items[i]).join(' ');
        if (task?.kind === 'match')
            return matchPairs.map((p, i) => `${p.left}: ${matches[i] || '（未选择）'}`).join('\n');
        return answer;
    }
    async function submit(rating: Rating) {
        if (!card || lock.current || !revealed)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        const event = attempt.current || { cardId: card.id, rating, mode, responseText: taskResponse(), responseMs: Math.min(86400000, Math.max(0, Date.now() - started.current)), clientEventId: eventId.current, reviewedAt: new Date().toISOString() };
        attempt.current = event;
        try {
            await onSubmit(event);
            setSession(s => completeCard(s, card.id));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : '提交失败，请重试（保留相同事件编号）。');
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    }
    function move(position: number, delta: number) { const next = [...itemOrder], target = position + delta; if (target < 0 || target >= next.length)
        return; [next[position], next[target]] = [next[target], next[position]]; setOrder(next); }
    return <section className="study-panel"><div className="study-section-head"><div><h2>主动回忆训练</h2><p className="study-muted">{session.completed} / {session.total} 已完成 · 本轮队列保持稳定</p></div><label>训练任务<select data-testid="study-task-mode" value={mode} disabled={busy} onChange={e => setMode(e.target.value as Mode)}>{TRAINING_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label></div>
    {card && task ? <><div className="study-progress" role="progressbar" aria-label="本轮进度" aria-valuemin={0} aria-valuenow={session.completed} aria-valuemax={session.total}><span style={{ width: `${session.total ? session.completed / session.total * 100 : 0}%` }}/></div>
    <article className="study-review-card"><p className="study-eyebrow">{card.course.name}{card.chapter ? ` · ${card.chapter.name}` : ''} · 下次复习 {new Date(card.dueAt).toLocaleString()}</p><h3>{card.title}</h3>
      {!!keywordNames.length && <fieldset disabled={busy || revealed}><legend>显式关键词槽位（仅替换本次任务，不修改卡片）</legend><div className="study-form-grid">{keywordNames.map(key => <label key={key}>{key}<input value={slots[key] ?? card.slots?.[key] ?? ''} onChange={e => setSlots({ ...slots, [key]: e.target.value })}/></label>)}</div></fieldset>}
      <StudyMarkdown content={task.prompt}/>{task.warnings.map(w => <p className="study-warning" key={w}>{w}</p>)}
      {task.kind === 'order' && <ol className="study-sentence-list">{itemOrder.map((index, pos) => <li key={index}><span>{items[index]}</span><button aria-label={`句子 ${pos + 1} 上移`} disabled={busy || revealed || pos === 0} onClick={() => move(pos, -1)}>↑</button><button aria-label={`句子 ${pos + 1} 下移`} disabled={busy || revealed || pos === items.length - 1} onClick={() => move(pos, 1)}>↓</button></li>)}</ol>}
      {task.kind === 'compose' && <fieldset disabled={busy || revealed}><legend>按组合顺序选择句子</legend>{items.map((s, i) => <label key={i} className="study-check"><input type="checkbox" checked={selected.includes(i)} onChange={e => setSelected(e.target.checked ? [...selected, i] : selected.filter(n => n !== i))}/>{selected.includes(i) ? `${selected.indexOf(i) + 1}. ` : ''}{s}</label>)}</fieldset>}
      {task.kind === 'match' && <div className="study-form-grid">{matchPairs.map((pair, i) => <label key={i}>{pair.left}<select data-testid="study-match-choice" value={matches[i] || ''} disabled={busy || revealed} onChange={e => setMatches({ ...matches, [i]: e.target.value })}><option value="">请选择对应项</option>{[...matchPairs].reverse().map((p, j) => <option key={j} value={p.right}>{p.right}</option>)}</select></label>)}</div>}
      <label>你的作答 / 草稿<textarea rows={5} data-testid="study-answer-input" value={['order', 'compose', 'match'].includes(task.kind) ? taskResponse() : answer} readOnly={['order', 'compose', 'match'].includes(task.kind)} disabled={busy || revealed} onChange={e => setAnswer(e.target.value)} placeholder={task.kind === 'cloze' ? '按顺序填写空缺答案' : '先独立回忆；草稿只在明确评分后保存'}/></label>
      {!revealed ? <button data-testid="study-review-reveal" className="study-primary study-full" disabled={busy || !task.prompt || !task.expectedAnswer || task.warnings.some(w => w.includes('模式不可用') || w.includes('缺少'))} onClick={() => setRevealed(true)}>显示答案并对照</button> : <><div className="study-answer-columns"><section><h4>你的作答</h4><StudyMarkdown content={taskResponse() || '（未填写）'}/></section><section><h4>参考答案</h4><StudyMarkdown content={task.expectedAnswer}/></section></div>
      <p className="study-warning">仅供对照：英语存在多种合理表达，数学/LaTeX 不自动判断等价。以下评分由你自行确认。</p>
      {taskResponse() && <p className="study-muted">文字参考：{taskResponse() === task.expectedAnswer ? '与参考文本完全一致（不代表自动判对）' : '与参考文本存在差异（不代表错误）'}</p>}
      {[['explanation', '解释'], ['conditions', '适用条件'], ['roc', '收敛域'], ['precautions', '注意事项'], ['pitfalls', '易错点']].map(([key, label]) => card[key as keyof CardDTO] && <details key={key}><summary>{label}</summary><StudyMarkdown content={String(card[key as keyof CardDTO])}/></details>)}
      <div className="study-rating-grid">{(['again', 'hard', 'good', 'easy'] as const).map(r => <button key={r} data-testid={`study-review-submit-${r}`} disabled={busy} className={r === 'again' ? 'study-danger' : r === 'good' ? 'study-primary' : ''} onClick={() => submit(r)}>{busy ? '保存中…' : r === 'again' ? '忘记了' : r === 'hard' ? '困难' : r === 'good' ? '掌握' : '熟练'}</button>)}</div></>}
      {error && <p role="alert" className="study-error">{error}</p>}
    </article></> : <div className="study-empty"><h3>{session.total ? '本轮完成' : '当前范围没有可复习卡片'}</h3><p>调整队列 / 课程 / 章节 / 考试日期筛选，或新增卡片。重新开始一轮请刷新队列。</p></div>}
  </section>;
}
