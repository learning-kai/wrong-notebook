import { describe, expect, it } from 'vitest';
import { buildTrainingTask, TRAINING_MODES } from '@/lib/study-training';
import type { TransferCard } from '@/lib/study-transfer';

const card: TransferCard = {
  title: '英文模板',
  cardType: 'translation',
  prompt: 'Translate this sentence.',
  answer: 'The answer.',
  chinese: '这是一句中文。',
  english: 'This is an English sentence.',
  clozeText: 'The {{c1::quick}} fox jumps over the {{c2::lazy}} dog.',
  sentences: ['First, keep this.', 'Then preserve this.'],
  slots: { keyword: '原始值' },
  tags: [],
};

describe('study training pure tasks', () => {
  it('exports every contract mode in stable order', () => {
    expect(TRAINING_MODES.map(mode => mode.id)).toEqual([
      'recall', 'zh-en', 'en-zh', 'formula', 'cloze', 'formula-cloze',
      'condition-conclusion', 'conclusion-condition', 'compare', 'steps',
      'paragraph', 'sentence-order', 'sentence-compose', 'template-match',
      'transform', 'inverse-transform', 'roc', 'initial-final',
    ]);
  });

  it('keeps translation direction and explicit cloze answers exact', () => {
    expect(buildTrainingTask(card, 'zh-en')).toMatchObject({
      prompt: card.chinese,
      expectedAnswer: card.english,
      kind: 'text',
      warnings: [],
    });
    expect(buildTrainingTask(card, 'en-zh')).toMatchObject({
      prompt: card.english,
      expectedAnswer: card.chinese,
    });
    const cloze = buildTrainingTask(card, 'cloze');
    expect(cloze.prompt).not.toContain('quick');
    expect(cloze.prompt).toContain('_____');
    expect(cloze.expectedAnswer).toBe('quick / lazy');
    expect(cloze.kind).toBe('cloze');
  });

  it('uses source sentence order and composes without mutating the card', () => {
    const ordered = buildTrainingTask(card, 'sentence-order');
    expect(ordered.items).toEqual(card.sentences);
    expect(ordered.expectedAnswer).toBe(card.sentences.join('\n'));
    const composed = buildTrainingTask(card, 'sentence-compose');
    expect(composed.items).toEqual(card.sentences);
    expect(composed.expectedAnswer).toBe(card.sentences.join(' '));
    expect(card.sentences).toEqual(['First, keep this.', 'Then preserve this.']);
  });

  it('replaces only explicitly supplied template keywords in the task', () => {
    const templated = { ...card, prompt: 'Use {{keyword}} and {{missing}}.' };
    const task = buildTrainingTask(templated, 'template-match', { keyword: 'ROC' });
    expect(task.prompt).toBe('Use ROC and {{missing}}.');
    expect(task.expectedAnswer).toBe(card.answer);
    expect(task.warnings.some(warning => warning.includes('missing'))).toBe(true);
    expect(templated.prompt).toBe('Use {{keyword}} and {{missing}}.');
  });

  it('returns a disabled task with a warning instead of inventing prerequisites', () => {
    const incomplete = { ...card, chinese: null, english: null, prompt: '', answer: '' };
    const task = buildTrainingTask(incomplete, 'zh-en');
    expect(task.prompt).toBe('');
    expect(task.expectedAnswer).toBe('');
    expect(task.warnings.length).toBeGreaterThan(0);
  });

  it('builds math and signal tasks from named metadata only', () => {
    const math = {
      ...card,
      prompt: '给定条件，写出公式',
      answer: '结论',
      formula: '\\\\det(A)\\\\ne 0',
      conditions: 'A 为方阵',
      comparison: '条件甲 vs 条件乙',
      steps: '第一步\\n第二步',
      initialConditions: 'x(0+)=1',
      finalConditions: 'x(∞)=0',
      roc: 'Re(s)>-1',
    };
    expect(buildTrainingTask(math, 'formula').expectedAnswer).toBe(math.formula);
    expect(buildTrainingTask(math, 'condition-conclusion').expectedAnswer).toBe(math.answer);
    expect(buildTrainingTask(math, 'conclusion-condition').expectedAnswer).toBe(math.conditions);
    expect(buildTrainingTask(math, 'compare').expectedAnswer).toBe(math.comparison);
    expect(buildTrainingTask(math, 'steps').expectedAnswer).toBe(math.steps);
    expect(buildTrainingTask(math, 'transform').expectedAnswer).toBe(math.answer);
    expect(buildTrainingTask(math, 'inverse-transform').prompt).toBe(math.formula);
    expect(buildTrainingTask(math, 'inverse-transform').expectedAnswer).toBe(math.prompt);
    expect(buildTrainingTask(math, 'roc').expectedAnswer).toBe(math.roc);
    expect(buildTrainingTask(math, 'initial-final').expectedAnswer).toBe('x(0+)=1\nx(∞)=0');
  });

  it('builds paragraph metadata and does not pretend to grade math equivalence', () => {
    const paragraph = buildTrainingTask({
      ...card,
      english: 'A paragraph.',
      paragraphPosition: '第二段',
      sentenceFunction: '转折',
    }, 'paragraph');
    expect(paragraph.expectedAnswer).toBe('第二段；转折');
    const compare = buildTrainingTask(card, 'compare');
    expect(compare.warnings.join(' ')).toContain('不承诺通用等价性');
  });
});
