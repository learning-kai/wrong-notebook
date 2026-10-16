"use client";
import { useMemo, useState } from 'react';
import type { CardDTO, Course } from './types';
import { subjectProfile, isProfileField, type SubjectProfile } from '@/lib/study-subject-profiles';

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
    const [tags, setTags] = useState(JSON.stringify(card?.tags || []));
    const [sentences, setSentences] = useState(JSON.stringify(card?.sentences || [], null, 2));
    const [slots, setSlots] = useState(JSON.stringify(card?.slots || {}, null, 2));
    const [suspended, setSuspended] = useState(card?.suspended || false);
    const [dueAt, setDueAt] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const selectedCourse = courses.find(c => c.id === course);
    const profile: SubjectProfile = useMemo(() => subjectProfile(selectedCourse?.subjectKey), [selectedCourse?.subjectKey]);
    // Subject default card type applies when the user has not chosen one.
    const effectiveCardType = cardType || (card?.cardType ?? profile.defaultCardType);
    const shownFields = useMemo(() => CARD_FIELDS.filter(([key]) => showAll || isProfileField(profile, key)), [profile, showAll]);
    // Any field that already holds content must stay visible/editable even if the
    // profile would hide it, so subject switches never silently drop data.
    const extraFields = useMemo(() => CARD_FIELDS.filter(([key]) => !isProfileField(profile, key) && (card?.[key] || fields[key])), [profile, card, fields]);
    // Rendered fields = subject profile fields (or all when expanded) + any
    // off-profile field that already has content.
    const renderedFields = useMemo(() => showAll ? CARD_FIELDS : [...shownFields, ...extraFields.filter(([key]) => !shownFields.some(([k]) => k === key))], [showAll, shownFields, extraFields]);

    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (busy)
            return;
        setError('');
        try {
            if (!course || !fields.title.trim() || !fields.prompt.trim() || !fields.answer.trim())
                throw new Error('请选择课程，填写标题、正面和答案。');
            const sentenceArray: unknown = JSON.parse(sentences), tagArray: unknown = JSON.parse(tags), slotMap: unknown = JSON.parse(slots);
            if (!Array.isArray(sentenceArray) || sentenceArray.some(s => typeof s !== 'string'))
                throw new Error('句子必须是 JSON 字符串数组。');
            if (!Array.isArray(tagArray) || tagArray.some(s => typeof s !== 'string'))
                throw new Error('标签必须是 JSON 字符串数组。');
            if (!slotMap || typeof slotMap !== 'object' || Array.isArray(slotMap) || Object.values(slotMap).some(v => typeof v !== 'string'))
                throw new Error('关键词槽位必须是 JSON 字符串字典。');
            const payload: CardPayload = { ...fields, courseId: course, chapterId: chapter || null, cardType: effectiveCardType, tags: tagArray, sentences: sentenceArray, slots: slotMap as Record<string, string>, suspended };
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
        const wide = ['prompt', 'answer', 'formula', 'steps', 'english', 'sentences'].includes(fieldKey);
        return <label key={fieldKey} className={wide ? 'study-wide' : ''}>{LABELS[fieldKey]}{fieldKey === 'title' ? <input data-testid={`card-${fieldKey}`} value={fields[fieldKey]} onChange={e => setFields({ ...fields, [fieldKey]: e.target.value })} required/> : <textarea data-testid={`card-${fieldKey}`} rows={['prompt', 'answer', 'formula', 'steps'].includes(fieldKey) ? 4 : 2} value={fields[fieldKey]} onChange={e => setFields({ ...fields, [fieldKey]: e.target.value })} required={fieldKey === 'prompt' || fieldKey === 'answer'}/>}</label>;
    }
    return <section className="study-panel"><h2>{card ? '编辑卡片' : '新增卡片'}</h2>
    <p className="study-muted">当前科目模板：<strong>{profile.label}</strong>。{profile.hint} Markdown / LaTeX 原样保存，答案判定由你自评。</p>
    <form onSubmit={save} className="study-form-grid">
      <label>所属课程<select data-testid="card-course" value={course} onChange={e => { setCourse(e.target.value); setChapter(''); setCardType(''); }} required><option value="">请选择</option>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>所属章节<select data-testid="card-chapter" value={chapter} onChange={e => setChapter(e.target.value)}><option value="">未分章</option>{selectedCourse?.chapters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></label>
      <label>卡片类型<select data-testid="card-type" value={effectiveCardType} onChange={e => setCardType(e.target.value)}>{profile.cardTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}{profile.cardTypes.every(t => t.value !== effectiveCardType) && <option value={effectiveCardType}>{effectiveCardType}</option>}</select></label>
      {renderedFields.map(([key]) => field(key))}
      {!showAll && !!extraFields.length && <p className="study-muted study-wide">该卡片还保存了当前科目模板外的字段（已保留，可编辑）：{extraFields.map(([key]) => LABELS[key]).join('、')}。<button type="button" onClick={() => setShowAll(true)}>显示全部字段</button></p>}
      {showAll && <p className="study-wide"><button type="button" onClick={() => setShowAll(false)}>只看本模板字段</button></p>}
      <label className="study-wide">标签（JSON 数组）<textarea data-testid="card-tags" value={tags} onChange={e => setTags(e.target.value)}/></label>
      <label className="study-wide">句子（JSON 数组，原始顺序为答案；英语排序 / 组句使用）<textarea data-testid="card-sentences" rows={4} value={sentences} onChange={e => setSentences(e.target.value)}/></label>
      <label className="study-wide">关键词槽位（JSON 字典，例如 {`{"keyword":"主题"}`}）<textarea data-testid="card-slots" rows={3} value={slots} onChange={e => setSlots(e.target.value)}/></label>
      <label>手动修改下次复习时间<input type="datetime-local" data-testid="card-dueAt" value={dueAt} onChange={e => setDueAt(e.target.value)}/>{card && <small>当前：{new Date(card.dueAt).toLocaleString()}</small>}</label>
      <label className="study-check"><input type="checkbox" checked={suspended} onChange={e => setSuspended(e.target.checked)}/>暂停复习</label>
      {error && <p role="alert" className="study-error study-wide">{error}</p>}
      <div className="study-actions study-wide"><button data-testid="card-save" className="study-primary" disabled={busy}>{busy ? '保存中…' : '保存卡片'}</button><button type="button" disabled={busy} onClick={onCancel}>取消</button></div>
    </form></section>;
}
