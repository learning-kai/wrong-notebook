"use client";
import { useState } from 'react';
import type { ImportPreview, Scope } from './types';
import { query } from './types';
import { studyRequest } from './api';
const MAPPING_FIELDS = ['title', 'prompt', 'answer', 'cardType', 'course', 'chapter', 'tags', 'formula', 'roc', 'conditions', 'precautions', 'steps', 'initialConditions', 'finalConditions', 'explanation', 'pitfalls', 'source', 'notes', 'chinese', 'english', 'letterType', 'paragraphPosition', 'sentenceFunction', 'clozeText', 'comparison', 'sentences', 'slots'];
export function ImportExport({ scope, onImported, disabled = false }: {
    scope: Scope;
    onImported: () => Promise<void>;
    disabled?: boolean;
}) {
    const [data, setData] = useState('');
    const [format, setFormat] = useState<'json' | 'csv' | 'markdown'>('json');
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [skip, setSkip] = useState(true);
    function invalidate() { setPreview(null); setConfirmed(false); setMessage(''); }
    async function run(action: 'preview' | 'commit') {
        if (busy || disabled || (action === 'commit' && (!confirmed || !preview || !!preview.errors.length)))
            return;
        setBusy(true);
        setError('');
        try {
            const payload = { action, format, data, courseId: scope.courseId || undefined, mapping, skipDuplicates: skip };
            if (action === 'preview') {
                const next = await studyRequest<ImportPreview>('/import', { method: 'POST', body: JSON.stringify(payload) });
                setPreview(next);
                setHeaders(next.headers || []);
                setConfirmed(false);
            }
            else {
                const result = await studyRequest<{
                    imported: number;
                    skipped: number;
                }>('/import', { method: 'POST', body: JSON.stringify(payload) });
                setMessage(`已导入 ${result.imported} 张，跳过重复 ${result.skipped} 张。`);
                setPreview(null);
                setConfirmed(false);
                await onImported();
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : '导入失败');
        }
        finally {
            setBusy(false);
        }
    }
    async function loadFile(file?: File) { if (!file)
        return; try {
        if (file.size > 5 * 1024 * 1024)
            throw new Error('文件太大，请分批导入（最多 5 MB）。');
        setData(await file.text());
        setFormat(file.name.endsWith('.csv') ? 'csv' : /\.md$/i.test(file.name) ? 'markdown' : 'json');
        setMapping({});
        invalidate();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '文件读取失败');
    } }
    return <div className="study-stack"><section className="study-panel"><h2>内容导入与导出</h2><p className="study-muted">JSON、CSV、Markdown 均保留结构化字段与 LaTeX。先检查预览和字段映射，再明确确认。完整调度 / 复习历史请使用「完整备份」，内容导出不是全量备份。</p>
 <div className="study-actions">{(['json', 'csv', 'markdown'] as const).map(f => <a className="study-button" key={f} href={`/api/study/export${query({ format: f, courseId: scope.courseId, chapterId: scope.chapterId, cardType: scope.cardType })}`} download>导出 {f === 'markdown' ? 'Markdown' : f.toUpperCase()}</a>)}</div>
 <form onSubmit={e => { e.preventDefault(); void run('preview'); }} className="study-stack"><div className="study-form-grid"><label>导入格式<select data-testid="study-import-format" value={format} disabled={busy || disabled} onChange={e => { setFormat(e.target.value as typeof format); setMapping({}); invalidate(); }}><option value="json">JSON</option><option value="csv">CSV</option><option value="markdown">Markdown</option></select></label><label>选择文件<input type="file" accept=".json,.csv,.md,text/*" disabled={busy || disabled} onChange={e => { void loadFile(e.target.files?.[0]); e.target.value = ''; }}/></label></div>
 <label>或粘贴原始内容<textarea data-testid="study-import-data" rows={10} value={data} disabled={busy || disabled} onChange={e => { setData(e.target.value); invalidate(); }} placeholder='[{"title":"标题","prompt":"问题","answer":"答案"}]'/></label>
 <label className="study-check"><input type="checkbox" checked={skip} disabled={busy} onChange={e => { setSkip(e.target.checked); setConfirmed(false); }}/>跳过完全相同的重复卡片</label>
 <div className="study-actions"><button data-testid="study-import-preview" disabled={busy || disabled || !data} className="study-primary">{busy ? '处理中…' : '解析预览'}</button><button type="button" data-testid="study-import-commit" disabled={busy || disabled || !preview || !!preview.errors.length || !preview.validCount || !confirmed} onClick={() => run('commit')}>确认导入</button></div>
 </form>{error && <p role="alert" className="study-error">{error}</p>}{message && <p role="status">{message}</p>}
 {format === 'csv' && !!headers.length && <details open><summary>CSV 字段映射（修改后必须重新预览）</summary><div className="study-form-grid">{MAPPING_FIELDS.map(key => <label key={key}>{key}<select data-testid={`study-mapping-${key}`} value={mapping[key] || ''} onChange={e => { setMapping({ ...mapping, [key]: e.target.value }); setConfirmed(false); setPreview(null); }}><option value="">自动 / 不映射</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}</select></label>)}</div></details>}
 {preview && <section className="study-stack"><h3>导入预览：{preview.validCount} 张有效 · {preview.duplicates} 张重复</h3>
 {preview.errors.length > 0 && <ul role="alert" className="study-error">{preview.errors.map((e, i) => <li key={i}>第 {e.row} 行{e.field ? ` · ${e.field}` : ''}：{e.message}</li>)}</ul>}{preview.warnings.map((w, i) => <p key={i} className="study-warning">{w}</p>)}
 <div className="study-table-wrap"><table><thead><tr><th>行</th><th>标题</th><th>题面</th><th>答案</th><th>全部字段</th></tr></thead><tbody>{preview.rows.map((row, i) => <tr key={i}><td>{i + 1}</td><td>{String(row.title ?? '')}</td><td><pre>{String(row.prompt ?? '')}</pre></td><td><pre>{String(row.answer ?? '')}</pre></td><td><details><summary>检查内容</summary><pre>{JSON.stringify(row, null, 2)}</pre></details></td></tr>)}</tbody></table></div>
 <label className="study-check"><input data-testid="study-import-confirm" type="checkbox" checked={confirmed} disabled={!!preview.errors.length} onChange={e => setConfirmed(e.target.checked)}/>我已检查字段、原文、错误与重复；确认导入预览所示内容。</label></section>}
 </section></div>;
}
