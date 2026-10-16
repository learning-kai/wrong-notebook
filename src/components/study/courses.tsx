"use client";
import { useState } from 'react';
import type { Course } from './types';
import { SUBJECT_OPTIONS, subjectProfile } from '@/lib/study-subject-profiles';
export type Mutate = (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => Promise<unknown>;
export function CourseManager({ courses, selectedId, onSelect, onMutate }: {
    courses: Course[];
    selectedId: string;
    onSelect: (id: string) => void;
    onMutate: Mutate;
}) {
    const [name, setName] = useState('');
    const [year, setYear] = useState('');
    const [subjectKey, setSubjectKey] = useState('');
    const [chapter, setChapter] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const course = courses.find(c => c.id === selectedId);
    async function action(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) { if (busy)
        return; setBusy(true); setError(''); try {
        await onMutate(path, method, body);
        setName('');
        setChapter('');
        setSubjectKey('');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '操作失败');
    }
    finally {
        setBusy(false);
    } }
    function editCourse() { if (!course)
        return; const next = window.prompt('课程名称', course.name); if (!next?.trim())
        return; const exam = window.prompt('考试年份（留空表示不设）', String(course.examYear || '')); if (exam === null)
        return; const currentSubject = course.subjectKey || ''; const subject = window.prompt(`科目模板（留空=通用）\n可选：${SUBJECT_OPTIONS.map(o => o.value).join(' / ')}`, currentSubject); if (subject === null)
        return; void action(`/courses/${course.id}`, 'PATCH', { name: next, examYear: exam ? Number(exam) : null, subjectKey: subject.trim() || null }); }
    return <div className="study-stack"><section className="study-panel"><h2>课程与章节</h2><p className="study-muted">科目决定卡片字段和训练模式：英语只练中英与写作，数学练公式与条件，信号练变换与收敛域。留空为通用模板。</p><form className="study-form-grid" onSubmit={e => { e.preventDefault(); if (name.trim())
        void action('/courses', 'POST', { name, examYear: year ? Number(year) : null, subjectKey: subjectKey || null }); }}><label>新课程名称<input data-testid="course-name" required value={name} onChange={e => setName(e.target.value)}/></label><label>科目模板<select data-testid="course-subject" value={subjectKey} onChange={e => setSubjectKey(e.target.value)}><option value="">通用（显示全部字段）</option>{SUBJECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label><label>考试年份（可选）<input type="number" min={2000} max={2200} value={year} onChange={e => setYear(e.target.value)}/></label><button data-testid="course-create" className="study-primary" disabled={busy || !name.trim()}>新建课程</button></form>{error && <p role="alert" className="study-error">{error}</p>}</section>
 <section className="study-course-grid">{courses.map(c => <button key={c.id} data-testid={`course-tile-${c.id}`} className={`study-course-tile ${c.id === selectedId ? 'selected' : ''}`} onClick={() => onSelect(c.id)}><strong>{c.name}</strong><span>{c._count.cards} 张卡片 · {c.chapters.length} 个章节{c.examYear ? ` · ${c.examYear}` : ''}{c.subjectKey ? ` · ${subjectProfile(c.subjectKey).label}` : ''}</span></button>)}</section>
 {course ? <section className="study-panel"><div className="study-section-head"><div><h2>{course.name}</h2><p className="study-muted">{course._count.cards} 张卡片{course.examYear ? ` · 考试年份 ${course.examYear}` : ''} · 模板：{course.subjectKey ? subjectProfile(course.subjectKey).label : '通用'}</p></div><div className="study-actions"><button data-testid="course-edit" disabled={busy} onClick={editCourse}>编辑名称 / 年份 / 科目</button><button className="study-danger" disabled={busy} onClick={() => { if (window.confirm(`确定删除课程“${course.name}”？所属卡片和复习历史也会删除。`))
            void action(`/courses/${course.id}`, 'DELETE').then(() => onSelect('')); }}>删除课程</button></div></div>
 <form className="study-actions" onSubmit={e => { e.preventDefault(); if (chapter.trim())
            void action(`/courses/${course.id}/chapters`, 'POST', { name: chapter }); }}><label>新章节名称<input required value={chapter} onChange={e => setChapter(e.target.value)}/></label><button disabled={busy || !chapter.trim()}>新建章节</button></form>
 <ul className="study-list">{course.chapters.map(ch => <li key={ch.id}><span><strong>{ch.name}</strong> · {ch._count?.cards ?? 0} 张</span><div className="study-actions"><button disabled={busy} onClick={() => { const next = window.prompt('章节名称', ch.name); if (next?.trim())
            void action(`/chapters/${ch.id}`, 'PATCH', { name: next }); }}>编辑章节</button><button data-testid={`chapter-delete-${ch.id}`} className="study-danger" disabled={busy} onClick={() => { if (window.confirm(`删除章节“${ch.name}”？卡片保留但取消章节归属。`))
            void action(`/chapters/${ch.id}`, 'DELETE'); }}>删除章节</button></div></li>)}</ul>{!course.chapters.length && <p className="study-muted">尚无章节，可创建后为卡片分章。</p>}</section> : <div className="study-empty">选择一个课程查看详情；没有课程时可先新建。</div>}
 </div>;
}
