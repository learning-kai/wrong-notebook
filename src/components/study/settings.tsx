"use client";
import { useState } from 'react';
import type { StudySettingsDTO } from './types';
const numeric = [['dailyNewLimit', '每日新卡上限', 0, 1000], ['dailyReviewLimit', '每日复习上限', 0, 5000], ['relearnMinutes', '忘记后重学分钟', 1, 1440], ['initialGoodDays', '首次掌握间隔天', 1, 365], ['initialEasyDays', '首次熟练间隔天', 1, 365], ['hardMultiplier', '困难倍率', 1, 3], ['easyMultiplier', '熟练倍率', 1, 5], ['maxIntervalDays', '最长间隔天', 1, 3650]] as const;
export function SettingsPanel({ settings, onSave, offlineCount = 0, disabled = false }: {
    settings: StudySettingsDTO;
    onSave: (body: Partial<StudySettingsDTO>) => Promise<void>;
    offlineCount?: number;
    disabled?: boolean;
}) {
    const [form, setForm] = useState({ ...settings, examDate: settings.examDate?.slice(0, 10) || null });
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    async function save(e: React.FormEvent) { e.preventDefault(); if (busy)
        return; setBusy(true); setError(''); try {
        for (const [key, label, min, max] of numeric) {
            const v = Number(form[key]);
            if (!Number.isFinite(v) || v < min || v > max)
                throw new Error(`${label}必须在 ${min}–${max} 之间。`);
        }
        await onSave({ dailyNewLimit: Number(form.dailyNewLimit), dailyReviewLimit: Number(form.dailyReviewLimit), relearnMinutes: Number(form.relearnMinutes), initialGoodDays: Number(form.initialGoodDays), initialEasyDays: Number(form.initialEasyDays), hardMultiplier: Number(form.hardMultiplier), easyMultiplier: Number(form.easyMultiplier), maxIntervalDays: Number(form.maxIntervalDays), examDate: form.examDate || null, timezone: form.timezone, theme: form.theme });
        setMessage('设置已保存');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '保存失败');
    }
    finally {
        setBusy(false);
    } }
    const set = (key: keyof StudySettingsDTO, value: string) => setForm({ ...form, [key]: value });
    return <section className="study-panel"><h2>学习设置</h2><p className="study-muted">设置影响服务器调度。userId 由已认证 settings GET 返回，仅用于隔离本地缓存；不存储密码或凭据。{offlineCount ? ` 当前有 ${offlineCount} 条待同步复习。` : ''}</p><form className="study-form-grid" onSubmit={save}>{numeric.map(([key, label, min, max]) => <label key={key}>{label}<input data-testid={key === 'dailyNewLimit' ? 'settings-daily-new' : `settings-${key}`} type="number" min={min} max={max} step={key.includes('Multiplier') ? '0.1' : '1'} value={String(form[key])} onChange={e => set(key, e.target.value)} required/></label>)}<label>考试日期（可选）<input type="date" value={form.examDate || ''} onChange={e => set('examDate', e.target.value)}/></label><label>时区<select value={form.timezone} onChange={e => set('timezone', e.target.value)}><option>Asia/Shanghai</option><option>Asia/Tokyo</option><option>UTC</option><option>America/Los_Angeles</option></select></label><label>主题<select value={form.theme} onChange={e => set('theme', e.target.value as StudySettingsDTO['theme'])}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label><div className="study-actions study-wide"><button data-testid="settings-save" className="study-primary" disabled={busy || disabled}>{busy ? '保存中…' : '保存设置'}</button></div>{message && <p role="status" className="study-success study-wide">{message}</p>}{error && <p role="alert" className="study-error study-wide">{error}</p>}</form></section>;
}
