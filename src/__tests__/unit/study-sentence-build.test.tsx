import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { buildTrainingTask, tokenizeSentence } from '@/lib/study-training';
import type { TransferCard } from '@/lib/study-transfer';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined; let host: HTMLDivElement;
afterEach(async () => { if(root) await act(async () => root?.unmount()); host?.remove(); root=undefined; vi.restoreAllMocks(); });

const card: TransferCard = {
  title: '大作文第一段', cardType: 'template',
  prompt: '中文提示', answer: 'English answer',
  chinese: '图画揭示更深层问题。\n当积极作用发挥时它帮助人们判断。',
  english: 'The drawing reveals a deeper issue.\nWhen realized, it helps people judge.',
  sentences: ['The drawing reveals a deeper issue.', 'When realized, it helps people judge.'],
  slots: {}, tags: [],
};

it('tokenizeSentence 按空格切词并保留标点', () => {
  expect(tokenizeSentence('The drawing reveals a deeper issue.')).toEqual(['The','drawing','reveals','a','deeper','issue.']);
});

it('sentence-build 任务：每句一个中文提示 + 英文词块', () => {
  const task = buildTrainingTask(card, 'sentence-build');
  expect(task.kind).toBe('build');
  expect(task.buildSentences).toHaveLength(2);
  expect(task.buildSentences?.[0]).toMatchObject({ prompt: '图画揭示更深层问题。', answer: 'The drawing reveals a deeper issue.' });
  expect(task.buildSentences?.[0].tokens).toContain('issue.');
});

it('sentence-build 缺少英文时禁用并给出警告，不伪造内容', () => {
  const task = buildTrainingTask({ ...card, sentences: [], english: null }, 'sentence-build');
  expect(task.kind).toBe('text');
  expect(task.warnings.join(' ')).toContain('缺少英文句子');
});

it('SentenceBuild 组件：点词块拼句、检查给出对错、完成后回传拼句文本', async () => {
  const { SentenceBuild } = await import('../../components/study/sentence-build');
  const sentences = [{ prompt: '图画揭示更深层问题。', answer: 'The drawing reveals a deeper issue.', tokens: ['The','drawing','reveals','a','deeper','issue.'] }];
  let done = '';
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<SentenceBuild sentences={sentences} onAllDone={text => { done = text; }} />));
  expect(host.querySelector('[data-testid="sb-cue"]')?.textContent).toContain('图画揭示更深层问题。');
  // Tap tiles in the correct order.
  const wanted = ['The','drawing','reveals','a','deeper','issue.'];
  for (const word of wanted) {
    const tile = [...host.querySelectorAll('[data-testid="sb-tile"]')].find(b => b.textContent === word && !(b as HTMLButtonElement).disabled) as HTMLButtonElement;
    await act(async () => tile.click());
  }
  expect(host.querySelector('[data-testid="sb-answer"]')?.textContent).toContain('The drawing reveals a deeper issue.');
  await act(async () => (host.querySelector('[data-testid="sb-check"]') as HTMLButtonElement).click());
  expect(host.querySelector('[data-testid="sb-verdict"]')?.textContent).toContain('正确');
  await act(async () => (host.querySelector('[data-testid="sb-next"]') as HTMLButtonElement).click());
  expect(done).toBe('The drawing reveals a deeper issue.');
});

it('SentenceBuild 组件：顺序错误时判错并显示参考答案', async () => {
  const { SentenceBuild } = await import('../../components/study/sentence-build');
  const sentences = [{ prompt: '中文', answer: 'I love you', tokens: ['I','love','you'] }];
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root?.render(<SentenceBuild sentences={sentences} onAllDone={() => {}} />));
  // Pick in a deliberately wrong order: you, I, love
  for (const word of ['you','I','love']) {
    const tile = [...host.querySelectorAll('[data-testid="sb-tile"]')].find(b => b.textContent === word && !(b as HTMLButtonElement).disabled) as HTMLButtonElement;
    await act(async () => tile.click());
  }
  await act(async () => (host.querySelector('[data-testid="sb-check"]') as HTMLButtonElement).click());
  const verdict = host.querySelector('[data-testid="sb-verdict"]')?.textContent ?? '';
  expect(verdict).toContain('再想想');
  expect(verdict).toContain('I love you');
});
