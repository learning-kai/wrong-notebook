import { describe, expect, it } from 'vitest';
import {
  parseStudyImport,
  serializeStudyCards,
  type TransferCard,
} from '@/lib/study-transfer';

const card: TransferCard = {
  title: '傅里叶变换，基本式',
  cardType: 'formula',
  prompt: '保留逗号、换行与 Unicode：\n求 $X(\\omega)$',
  answer: '双边约定：X(\\omega)=\\int_{-\\infty}^{\\infty}x(t)e^{-j\\omega t}dt',
  explanation: '说明中有 "引号"、逗号，以及第二行。',
  conditions: 'x(t) 可积\n或按广义函数理解',
  pitfalls: null,
  source: 'https://example.test/source?x=1,2',
  notes: '示例\n不要改写 LaTeX：\\nu',
  formula: '\\mathcal{F}\\{e^{-at}u(t)\\}=\\frac{1}{a+j\\omega}',
  roc: 'Re(a)>0；本卡采用双边 Fourier/Laplace 约定',
  precautions: 'ROC 不能脱离时域支撑单独决定。',
  steps: '第一步\n第二步',
  initialConditions: 'x(0^+)=1',
  finalConditions: 'x(\\infty)=0',
  chinese: '中文题面',
  english: 'English question',
  letterType: 'A',
  paragraphPosition: '首段',
  sentenceFunction: '转折',
  clozeText: '公式：{{c1::\\frac{1}{a+j\\omega}}}',
  comparison: '双边与单边不可混用',
  tags: ['信号', 'LaTeX,逗号'],
  sentences: ['第一句。', 'Second sentence, with comma.'],
  slots: { keyword: 'ROC' },
};

describe('study transfer CSV', () => {
  it('round-trips quoted multiline Unicode and LaTeX content without rewriting it', () => {
    const csv = serializeStudyCards([card], 'csv');
    const result = parseStudyImport(csv, 'csv');

    expect(result.errors).toEqual([]);
    expect(result.validCount).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject(card);
    expect(result.rows[0].prompt).toBe(card.prompt);
    expect(result.rows[0].answer).toBe(card.answer);
    expect(result.rows[0].formula).toBe(card.formula);
    expect(result.rows[0].conditions).toBe(card.conditions);
    expect(result.rows[0].tags).toEqual(card.tags);
    expect(result.rows[0].sentences).toEqual(card.sentences);
    expect(result.rows[0].slots).toEqual(card.slots);
  });

  it('uses mapping and reports every malformed row instead of silently dropping it', () => {
    const csv = [
      '题目,答案,公式',
      '完整题,"答案，含逗号",\\\\alpha + \\$x\\$',
      '缺答案,,\\\\beta',
      '"未闭合,答案,\\\\gamma',
    ].join('\n');
    const result = parseStudyImport(csv, 'csv', {
      title: '题目',
      prompt: '题目',
      answer: '答案',
      formula: '公式',
    });

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].formula).toBe('\\\\alpha + \\$x\\$');
    expect(result.errors.some(error => error.row === 3 && error.field === 'answer')).toBe(true);
    expect(result.errors.some(error => error.row === 4)).toBe(true);
    expect(result.validCount).toBe(1);
  });

  it('preserves exact JSON fields and parses Markdown fenced typed metadata', () => {
    const json = serializeStudyCards([card], 'json');
    expect(parseStudyImport(json, 'json').rows[0]).toEqual(card);

    const markdown = serializeStudyCards([card], 'markdown');
    expect(markdown).toContain('### Question');
    expect(markdown).toContain('### Answer');
    const parsedMarkdown = parseStudyImport(markdown, 'markdown');
    expect(parsedMarkdown.errors).toEqual([]);
    expect(parsedMarkdown.rows[0]).toEqual(card);
  });

  it('warns about dubious formula or cloze syntax without changing the source', () => {
    const suspicious = { ...card, formula: 'f(x)=$x', clozeText: 'A {{keyword}}' };
    const result = parseStudyImport(JSON.stringify([suspicious]), 'json');
    expect(result.rows[0].formula).toBe(suspicious.formula);
    expect(result.rows[0].clozeText).toBe(suspicious.clozeText);
    expect(result.warnings).toHaveLength(2);
  });

  it('keeps Markdown fences inside card text lossless and reports bad JSON rows', () => {
    const fenced = { ...card, prompt: '```json\n{"not":"a card"}\n```\n题面结束' };
    const markdown = serializeStudyCards([fenced], 'markdown');
    expect(parseStudyImport(markdown, 'markdown').rows[0].prompt).toBe(fenced.prompt);

    const malformed = parseStudyImport(JSON.stringify([card, { title: '坏行' }]), 'json');
    expect(malformed.rows).toHaveLength(2);
    expect(malformed.errors.some(error => error.row === 2 && error.field === 'prompt')).toBe(true);
    expect(malformed.errors.some(error => error.row === 2 && error.field === 'answer')).toBe(true);
    expect(malformed.validCount).toBe(1);
  });
});
