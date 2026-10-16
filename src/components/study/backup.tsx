"use client";
import { useState } from 'react';
import type { BackupPreview } from './types';
import { studyRequest } from './api';
export function BackupPanel({ onRestored, disabled = false }: {
    onRestored: () => Promise<void>;
    disabled?: boolean;
}) {
    const [data, setData] = useState('');
    const [preview, setPreview] = useState<BackupPreview | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    function change(v: string) { setData(v); setPreview(null); setConfirmed(false); setError(''); setMessage(''); }
    async function run(action: 'preview' | 'restore') { if (busy || disabled || !data || (action === 'restore' && (!preview || !confirmed || !!preview.errors?.length)))
        return; setBusy(true); setError(''); try {
        const value = await studyRequest<BackupPreview | {
            restored: number;
            skipped: number;
        }>('/backup', { method: 'POST', body: JSON.stringify({ action, data }) });
        if (action === 'preview') {
            setPreview(value as BackupPreview);
            setConfirmed(false);
        }
        else {
            const result = value as {
                imported?: number;
                restored?: number;
                skipped: number;
                reviews?: number;
            };
            setMessage(`已恢复 ${result.imported ?? result.restored ?? 0} 张卡片 / ${result.reviews ?? 0} 条复习，跳过重复 ${result.skipped} 张；现有数据未删除。`);
            setPreview(null);
            setConfirmed(false);
            await onRestored();
        }
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '备份处理失败');
    }
    finally {
        setBusy(false);
    } }
    return <div className="study-stack"><section className="study-panel"><h2>完整备份 / 恢复</h2><p className="study-muted">备份包含当前用户的设置、课程、章节、卡片和复习历史（schemaVersion:1），不包含凭据或其他账号。恢复是事务性增量恢复，不删除现有数据；先预览并检查。</p><div className="study-actions"><a className="study-button" href="/api/study/backup" download>下载完整备份 JSON</a></div> <label>选择完整备份文件<input type="file" accept=".json,application/json" disabled={busy || disabled} onChange={async (e) => { const file = e.target.files?.[0]; if (!file)
        return; try {
        if (file.size > 20 * 1024 * 1024)
            throw new Error('完整备份文件最多 20 MB。');
        change(await file.text());
    }
    catch (err) {
        setError(err instanceof Error ? err.message : '文件读取失败');
    } }}/></label><label>粘贴备份 JSON<textarea data-testid="backup-data" rows={10} value={data} disabled={busy || disabled} onChange={e => change(e.target.value)} placeholder='{"schemaVersion":1,"settings":{},"courses":[],"cards":[],"reviews":[]}'/></label><div className="study-actions"><button data-testid="backup-preview" disabled={busy || disabled || !data} className="study-primary" onClick={() => run('preview')}>预览恢复</button><button data-testid="backup-restore" disabled={busy || disabled || !preview || !!preview.errors?.length || !confirmed} onClick={() => run('restore')}>确认增量恢复</button></div>{error && <p role="alert" className="study-error">{error}</p>}{message && <p role="status" className="study-success">{message}</p>}{preview && <section className="study-panel"><h3>恢复预览</h3>{preview.errors?.length ? <ul className="study-error">{preview.errors.map((e, i) => <li key={i}>{typeof e === 'string' ? e : e.message}</li>)}</ul> : <><p>校验通过。{preview.counts && Object.entries(preview.counts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p><label className="study-check"><input data-testid="backup-confirm" type="checkbox" onChange={e => setConfirmed(e.target.checked)}/>我确认这是当前账号的备份，并了解恢复只新增 / 合并，不删除现有数据。</label></>}</section>}</section></div>;
}
