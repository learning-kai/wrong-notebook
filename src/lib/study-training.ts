import type { TransferCard } from './study-transfer';

export type TrainingModeId =
  | 'recall' | 'zh-en' | 'en-zh' | 'formula' | 'cloze' | 'formula-cloze'
  | 'condition-conclusion' | 'conclusion-condition' | 'compare' | 'steps'
  | 'paragraph' | 'sentence-order' | 'sentence-compose' | 'template-match'
  | 'transform' | 'inverse-transform' | 'roc' | 'initial-final';

export interface TrainingMode {
  id: TrainingModeId;
  label: string;
}

export type TrainingTaskKind = 'text' | 'cloze' | 'order' | 'compose' | 'match';

export interface TrainingTask {
  prompt: string;
  expectedAnswer: string;
  items?: string[];
  pairs?: Array<{ left: string; right: string }>;
  kind: TrainingTaskKind;
  warnings: string[];
}

export const TRAINING_MODES: TrainingMode[] = [
  { id: 'recall', label: '回忆' },
  { id: 'zh-en', label: '中译英' },
  { id: 'en-zh', label: '英译中' },
  { id: 'formula', label: '公式默写' },
  { id: 'cloze', label: '挖空' },
  { id: 'formula-cloze', label: '公式挖空' },
  { id: 'condition-conclusion', label: '条件推出结论' },
  { id: 'conclusion-condition', label: '结论反推条件' },
  { id: 'compare', label: '对比' },
  { id: 'steps', label: '步骤' },
  { id: 'paragraph', label: '段落定位' },
  { id: 'sentence-order', label: '句子排序' },
  { id: 'sentence-compose', label: '句子组句' },
  { id: 'template-match', label: '模板匹配' },
  { id: 'transform', label: '变换' },
  { id: 'inverse-transform', label: '逆变换' },
  { id: 'roc', label: 'ROC' },
  { id: 'initial-final', label: '初值/终值' },
];

function text(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

function disabled(warnings: string[]): TrainingTask {
  return { prompt: '', expectedAnswer: '', kind: 'text', warnings };
}

function requireText(
  values: Array<[string, string | null | undefined]>,
  warnings: string[],
): boolean {
  const before = warnings.length;
  for (const [label, value] of values) {
    if (!text(value)) warnings.push(`模式不可用：缺少${label}，不会生成伪造内容`);
  }
  return warnings.length === before;
}

function textTask(
  promptValue: string | null | undefined,
  answerValue: string | null | undefined,
  labels: [string, string],
  warnings: string[] = [],
): TrainingTask {
  const prompt = text(promptValue);
  const expectedAnswer = text(answerValue);
  const available = requireText([[labels[0], prompt], [labels[1], expectedAnswer]], warnings);
  return !available
    ? disabled(warnings)
    : { prompt, expectedAnswer, kind: 'text', warnings };
}

interface ClozeParse {
  prompt: string;
  answers: string[];
}

function renderCloze(value: string): ClozeParse {
  const answers: string[] = [];
  const prompt = value.replace(/\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_whole, answer: string) => {
    answers.push(answer);
    return '_____';
  });
  return { prompt, answers };
}

function slotsIn(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g)].map(match => match[1]);
}

function replaceSlots(value: string, card: TransferCard, slotValues: Record<string, string>): { value: string; warnings: string[] } {
  const replacements = { ...card.slots, ...slotValues };
  const warnings: string[] = [];
  const result = value.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, (whole, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(replacements, key)) {
      warnings.push(`缺少模板关键词：${key}`);
      return whole;
    }
    return replacements[key];
  });
  return { value: result, warnings: [...new Set(warnings)] };
}

function joinConditions(card: TransferCard): string {
  return [text(card.initialConditions), text(card.finalConditions)].filter(Boolean).join('\n');
}

function signalTask(
  card: TransferCard,
  expected: string | null | undefined,
  label: string,
  warnings: string[],
  promptValue?: string | null,
): TrainingTask {
  const prompt = text(promptValue) || text(card.prompt) || text(card.formula);
  const available = requireText([[`${label}题面`, prompt], [`${label}答案`, expected]], warnings);
  return !available
    ? disabled(warnings)
    : { prompt, expectedAnswer: text(expected), kind: 'text', warnings };
}

/** Build one deterministic self-assessment task; no equivalence grading is attempted. */
export function buildTrainingTask(
  card: TransferCard,
  mode: TrainingModeId,
  slotValues: Record<string, string> = {},
): TrainingTask {
  switch (mode) {
    case 'recall':
      return textTask(card.prompt, card.answer, ['题面', '答案']);
    case 'zh-en':
      return textTask(card.chinese, card.english, ['中文', '英文']);
    case 'en-zh':
      return textTask(card.english, card.chinese, ['英文', '中文']);
    case 'formula':
      return textTask(card.prompt || card.title, card.formula, ['题面或标题', 'formula']);
    case 'cloze': {
      const source = text(card.clozeText);
      const warnings: string[] = [];
      requireText([['clozeText', source]], warnings);
      if (warnings.length === 0) {
        const rendered = renderCloze(source);
        if (rendered.answers.length === 0) warnings.push('模式不可用：clozeText 缺少 {{cN::text}} 标记，不会猜测挖空位置');
        if (warnings.length === 0) {
          return { prompt: rendered.prompt, expectedAnswer: rendered.answers.join(' / '), kind: 'cloze', warnings };
        }
      }
      return disabled(warnings);
    }
    case 'formula-cloze': {
      const source = text(card.clozeText) || text(card.formula);
      const warnings: string[] = [];
      requireText([['clozeText 或 formula', source]], warnings);
      if (warnings.length === 0) {
        const rendered = renderCloze(source);
        if (rendered.answers.length === 0) warnings.push('模式不可用：没有显式 {{cN::text}} 标记');
        if (warnings.length === 0) {
          return { prompt: rendered.prompt, expectedAnswer: rendered.answers.join(' / '), kind: 'cloze', warnings };
        }
      }
      return disabled(warnings);
    }
    case 'condition-conclusion':
      return textTask(card.conditions, card.answer, ['条件', '结论/答案']);
    case 'conclusion-condition':
      return textTask(card.answer, card.conditions, ['结论/答案', '条件']);
    case 'compare': {
      const warnings = ['对比结果仅作自评提示；英文答案不承诺通用等价性'];
      return textTask(card.prompt || card.title, card.comparison, ['题面或标题', 'comparison'], warnings);
    }
    case 'steps':
      return textTask(card.prompt || card.title, card.steps, ['题面或标题', 'steps']);
    case 'paragraph': {
      const warnings: string[] = [];
      const expected = [text(card.paragraphPosition), text(card.sentenceFunction)].filter(Boolean).join('；');
      requireText([['英文段落或题面', card.english || card.prompt], ['段落定位或句子功能', expected]], warnings);
      return warnings.length > 0
        ? disabled(warnings)
        : { prompt: text(card.english) || text(card.prompt), expectedAnswer: expected, kind: 'text', warnings };
    }
    case 'sentence-order': {
      const warnings: string[] = [];
      if (card.sentences.length === 0) warnings.push('模式不可用：缺少 sentences，不能推测句子顺序');
      return warnings.length > 0
        ? disabled(warnings)
        : { prompt: '请按原始来源顺序排列句子。', expectedAnswer: card.sentences.join('\n'), items: [...card.sentences], kind: 'order', warnings };
    }
    case 'sentence-compose': {
      const warnings: string[] = [];
      if (card.sentences.length === 0) warnings.push('模式不可用：缺少 sentences，不能生成组句内容');
      return warnings.length > 0
        ? disabled(warnings)
        : { prompt: '请用所给句子组成原文。', expectedAnswer: card.sentences.join(' '), items: [...card.sentences], kind: 'compose', warnings };
    }
    case 'template-match': {
      const source = text(card.prompt) || text(card.english);
      const warnings: string[] = [];
      requireText([['模板题面', source], ['答案', card.answer]], warnings);
      if (warnings.length === 0) {
        const replaced = replaceSlots(source, card, slotValues);
        warnings.push(...replaced.warnings);
        return { prompt: replaced.value, expectedAnswer: card.answer, kind: 'match', warnings };
      }
      return disabled(warnings);
    }
    case 'transform':
      return signalTask(card, card.answer || card.formula, '变换', [], card.prompt);
    case 'inverse-transform':
      return signalTask(card, card.prompt, '逆变换', [], card.formula || card.answer);
    case 'roc':
      return signalTask(card, card.roc, 'ROC', [], card.formula || card.answer || card.prompt);
    case 'initial-final': {
      const warnings: string[] = [];
      const expected = joinConditions(card);
      requireText([['公式或题面', card.prompt || card.formula], ['initialConditions/finalConditions', expected]], warnings);
      return warnings.length > 0
        ? disabled(warnings)
        : { prompt: text(card.prompt) || text(card.formula), expectedAnswer: expected, kind: 'text', warnings };
    }
    default:
      return disabled([`不支持训练模式：${String(mode)}`]);
  }
}

export { slotsIn };
