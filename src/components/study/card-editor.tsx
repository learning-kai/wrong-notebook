"use client";
import { useMemo, useState } from 'react';
import type { CardDTO, Course } from './types';
import { subjectProfile, isProfileField, isPrimaryField, type SubjectProfile } from '@/lib/study-subject-profiles';

/** All known editable fields, in canonical order. */
export const CARD_FIELDS = [
    ['title', '标题'], ['prompt', '正面 / 回忆问题'], ['answer', '答案'], ['formula', '公式（原样 LaTeX）'], ['roc', '收敛域 ROC'],
    ['conditions', '适用条件'], ['precautions', '注意事项'], ['steps', '解题步骤'], ['initialConditions', '初值条件'], ['finalConditions', '终值条件'],
    ['explanation', '解释'], ['pitfalls', '易错点'], ['comparison', '易混辨析'], ['chinese', '中文'], ['english', '英文'],
    ['letterType', '书信类型'], ['paragraphPosition', '段落位置'], ['sentenceFunction', '句子功能'], ['clozeText', '挖空文本 {{c1::答案}}'], ['source', '来源'], ['notes', '笔记'],
] as const;
type FieldName = typeof CARD_FIELDS[number][0];
export type CardPayload = Record<FieldName, string> & {
    courseId: string;
    chapterId: string | null;
    cardType: string;
    tags: string[];
    sentences: string[];
    slots: Record<string, string>;
    suspended: boolean;
    dueAt?: string;
};

const LABELS = Object.fromEntries(CARD_FIELDS) as Record<FieldName, string>;
const WIDE: readonly FieldName[] = ['prompt', 'answer', 'formula', 'steps', 'english', 'chinese'];
const BIG: readonly FieldName[] = ['prompt', 'answer', 'formula', 'steps'];

/** "key: value" lines ↔ slot map, so users never hand-write JSON. */
function linesToSlots(value: string): Record<string, string> {
    const slots: Record<string, string> = {};
    for (const line of value.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const at = trimmed.indexOf(':');
        if (at < 0) continue;
        const key = trimmed.slice(0, at).trim();
        const text = trimmed.slice(at + 1).trim();
        if (key) slots[key] = text;
    }
    return slots;
}
const slotsToLines = (slots: Record<string, string>) => Object.entries(slots).map(([k, v]) => `${k}: ${v}`).join('\n');
const listToLines = (items: string[]) => items.join('\n');
const linesToList = (value: string) => value.split('\n').map(s => s.trim()).filter(Boolean);

export function CardEditor({ card, courses, courseId, chapterId = '', onSave, onCancel }: {
    card?: CardDTO;
    courses: Course[];
    courseId: string;
    chapterId?: string;
    onSave: (payload: CardPayload) => Promise<void>;
    onCancel: () => void;
}) {
    const [fields, setFields] = useState(() => Object.fromEntries(CARD_FIELDS.map(([key]) => [key, card?.[key] || ''])) as Record<FieldName, string>);
    const [course, setCourse] = useState(card?.courseId || courseId);
    const [chapter, setChapter] = useState(card?.chapterId || chapterId);
    const [cardType, setCardType] = useState(card?.cardType || '');
    const [tags, setTags] = useState((card?.tags || []).join('、'));
    const [sentences, setSentences] = useState(listToLines(card?.sentences || []));
    const [slots, setSlots] = useState(slotsToLines(card?.slots || {}));
    const [suspended, setSuspended] = useState(card?.suspended || false);
    const [dueAt, setDueAt] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [more, setMore] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const selectedCourse = courses.find(c => c.id === course);
    const profile: SubjectProfile = useMemo(() => subjectProfile(selectedCourse?.subjectKey), [selectedCourse?.subjectKey]);
    const effectiveCardType = cardType || (card?.cardType ?? profile.defaultCardType);
    // Only the subject's primary fields show up front; everything else (profile
    // extras, shared fields, or any field that already has content) collapses
    // under 更多选项 so a new card needs just a couple of inputs.
    const primary = useMemo(() => CARD_FIELDS.filter(([key]) => isPrimaryField(profile, key)), [profile]);
    const { secondary, hiddenExtras } = useMemo(() => {
        const hasContent = (key: FieldName) => !!((card?.[key] ?? '') || fields[key]);
        const secondaryFields = CARD_FIELDS.filter(([key]) =>
            !primary.some(([k]) => k === key)
            && (showAll || isProfileField(profile, key) || hasContent(key))
        );
        const hidden = CARD_FIELDS.filter(([key]) => hasContent(key) && !primary.some(([k]) => k === key) && !secondaryFields.some(([k]) => k === key));
        return { secondary: secondaryFields, hiddenExtras: hidden };
    }, [profile, primary, showAll, fields, card]);

    // 中文/英文 are the human inputs; prompt/answer mirror them unless the user
    // has typed something specific. This avoids filling the same text twice.
    function setField(key: FieldName, value: string) {
        setFields(prev => {
            const next = { ...prev, [key]: value };
            if (key === 'chinese' && !prev.prompt.trim()) next.prompt = value;
            if (key === 'english' && !prev.answer.trim()) next.answer = value;
            return next;
        });
    }
    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (busy)
            return;
        setError('');
        try {
            if (!course)
                throw new Error('请选择课程。');
            const prompt = fields.prompt.trim() || fields.chinese.trim();
            const answer = fields.answer.trim() || fields.english.trim();
            if (!prompt || !answer)
                throw new Error('请填写题面与答案（或中文 / 英文）。');
            const payload: CardPayload = {
                ...fields, prompt, answer,
                courseId: course, chapterId: chapter || null, cardType: effectiveCardType,
                tags: tags.split(/[、,，]+/).map(t => t.trim()).filter(Boolean),
                sentences: linesToList(sentences), slots: linesToSlots(slots), suspended,
            };
            if (dueAt)
                payload.dueAt = new Date(dueAt).toISOString();
            setBusy(true);
            await onSave(payload);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : '保存失败');
        }
        finally {
            setBusy(false);
        }
    }
    function field(fieldKey: FieldName) {
        const label = LABELS[fieldKey];
        const common = { 'data-testid': `card-${fieldKey}`, value: fields[fieldKey], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setField(fieldKey, e.target.value) };
        return <label key={fieldKey} className={WIDE.includes(fieldKey) ? 'study-wide' : ''}>{label}
            {fieldKey === 'title'
                ? <input required {...common}/>
                : <textarea rows={BIG.includes(fieldKey) ? 3 : 2} {...common}/>}
        </label>;
    }
    return <section className="study-panel"><h2>{card ? '编辑卡片' : '新增卡片'}</h2>
    <p className="study-muted">{profile.hint}</p>
    <form onSubmit={save} className="study-form-grid">
      <label>所属课程<select data-testid="card-course" value={course} onChange={e => { setCourse(e.target.value); setChapter(''); setCardType(''); }} required><option value="">请选择</option>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>所属章节<select data-testid="card-chapter" value={chapter} onChange={e => setChapter(e.target.value)}><option value="">未分章</option>{selectedCourse?.chapters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></label>
      {primary.map(([key]) => field(key))}
      {(!!secondary.length || !!hiddenExtras.length) && <p className="study-wide"><button type="button" data-testid="card-more-toggle" onClick={() => setMore(v => !v)}>{more ? '收起更多选项' : '更多选项（可选）'}</button></p>}
      {more && <>
        {secondary.map(([key]) => field(key))}
        {!!hiddenExtras.length && <p className="study-muted study-wide">已保留字段：{hiddenExtras.map(([key]) => LABELS[key]).join('、')}。<button type="button" onClick={() => setShowAll(true)}>显示全部字段</button></p>}
        <label className="study-wide">句子（每行一句，用于排序 / 组句）<textarea data-testid="card-sentences" rows={3} value={sentences} onChange={e => setSentences(e.target.value)}/></label>
        <label className="study-wide">关键词槽位（每行 <code>关键词: 替换值</code>，用于模板迁移）<textarea data-testid="card-slots" rows={3} value={slots} onChange={e => setSlots(e.target.value)}/></label>
        <label className="study-wide">标签（用、或空格分隔）<input data-testid="card-tags" value={tags} onChange={e => setTags(e.target.value)}/></label>
        <label className="study-wide">卡片类型<select data-testid="card-type" value={effectiveCardType} onChange={e => setCardType(e.target.value)}>{profile.cardTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}{profile.cardTypes.every(t => t.value !== effectiveCardType) && <option value={effectiveCardType}>{effectiveCardType}</option>}</select></label>
        <label>手动修改下次复习时间<input type="datetime-local" data-testid="card-dueAt" value={dueAt} onChange={e => setDueAt(e.target.value)}/>{card && <small>当前：{new Date(card.dueAt).toLocaleString()}</small>}</label>
        <label className="study-check"><input type="checkbox" checked={suspended} onChange={e => setSuspended(e.target.checked)}/>暂停复习</label>
      </>}
      {error && <p role="alert" className="study-error study-wide">{error}</p>}
      <div className="study-actions study-wide"><button data-testid="card-save" className="study-primary" disabled={busy}>{busy ? '保存中…' : '保存卡片'}</button><button type="button" disabled={busy} onClick={onCancel}>取消</button></div>
    </form></section>;
}
