"use client";
import { useEffect, useState } from 'react';
import { studyRequest } from './api';
import { StudyMarkdown } from './study-markdown';
import type { TransferCard } from '@/lib/study-transfer';
export function SamplePanel({ onImported, disabled = false }: {
    onImported: () => Promise<void>;
    disabled?: boolean;
}) {
    const [examples, setExamples] = useState<TransferCard[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    useEffect(() => { if (disabled)
        return; let cancelled = false; void studyRequest<{
        examples: TransferCard[];
    }>('/samples').then(data => { if (!cancelled)
        setExamples(data.examples); }).catch(e => { if (!cancelled)
        setError(e instanceof Error ? e.message : '示例加载失败'); }); return () => { cancelled = true; }; }, [disabled]);
    async function run() { if (!selected.length || busy || disabled)
        return; setBusy(true); setError(''); try {
        const value = await studyRequest<{
            imported: number;
            skipped: number;
        }>('/samples', { method: 'POST', body: JSON.stringify({ sampleIds: selected }) });
        setMessage(`已导入 ${value.imported} 张示例，跳过 ${value.skipped} 张重复。`);
        setSelected([]);
        await onImported();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '导入失败');
    }
    finally {
        setBusy(false);
    } }
    return <section className="study-panel"><h2>可选的小量示例</h2><p className="study-warning">仅示例：不是完整权威公式库。检查来源与适用条件后明确勾选，系统不会自动导入。</p>{examples.map((card, i) => <details key={card.id || i}><summary>{card.title}</summary><StudyMarkdown content={card.prompt}/><StudyMarkdown content={card.answer}/><p className="study-muted">来源：{card.source}</p><label className="study-check"><input type="checkbox" checked={selected.includes(card.id || '')} disabled={busy || disabled || !card.id} onChange={e => setSelected(e.target.checked ? [...selected, card.id!] : selected.filter(id => id !== card.id))}/>选择此示例</label></details>)}{!examples.length && <p className="study-muted">当前暂无可用示例，仍可自行建卡或导入。</p>}<button data-testid="study-sample-import" disabled={busy || disabled || !selected.length} onClick={run}>明确导入勾选的 {selected.length} 张示例</button>{error && <p role="alert" className="study-error">{error}</p>}{message && <p role="status" className="study-success">{message}</p>}</section>;
}
