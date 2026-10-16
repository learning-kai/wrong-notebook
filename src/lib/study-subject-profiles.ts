import type { TrainingModeId } from './study-training';

/**
 * Subject-aware card profiles.
 *
 * The original requirement is explicit: one memory system, several knowledge
 * types, several training modes — English composition is NOT recalled like a
 * formula. This module is the single source of truth that maps a course's
 * `subjectKey` onto the fields and training modes that actually make sense for
 * that subject. Components must read profiles from here instead of rendering
 * every field/mode for every course.
 */

export type CardTypeOption = { value: string; label: string };

export type SubjectProfile = {
  /** Stable id; also the fallback profile id. */
  key: string;
  label: string;
  /** Card type preselected when creating a card in this subject. */
  defaultCardType: string;
  cardTypes: CardTypeOption[];
  /** Ordered card-editor field keys shown by default for this subject. */
  fields: readonly string[];
  /** Training modes offered for this subject, in display order. */
  modes: readonly TrainingModeId[];
  /** Short guidance shown in the editor header. */
  hint: string;
};

const SHARED_FIELDS = ['explanation', 'pitfalls', 'source', 'notes'] as const;

const ENGLISH_PROFILE: SubjectProfile = {
  key: 'postgraduate-english',
  label: '考研英语一',
  defaultCardType: 'translation',
  cardTypes: [
    { value: 'translation', label: '句子 / 段落翻译' },
    { value: 'template', label: '作文模板' },
    { value: 'sentence', label: '句子结构' },
  ],
  fields: ['title', 'prompt', 'answer', 'chinese', 'english', 'letterType', 'paragraphPosition', 'sentenceFunction', 'sentences', 'slots', ...SHARED_FIELDS],
  modes: ['recall', 'zh-en', 'en-zh', 'paragraph', 'sentence-order', 'sentence-compose', 'template-match'],
  hint: '英语按「中译英 / 英译中 / 段落定位 / 句子排序组句 / 模板关键词替换」背诵；不出现公式与收敛域字段。',
};

const MATH_PROFILE: SubjectProfile = {
  key: 'math',
  label: '考研数学',
  defaultCardType: 'formula',
  cardTypes: [
    { value: 'formula', label: '公式 / 定理' },
    { value: 'condition', label: '条件与结论' },
    { value: 'compare', label: '易混对比' },
    { value: 'cloze', label: '挖空' },
  ],
  fields: ['title', 'prompt', 'answer', 'formula', 'conditions', 'steps', 'comparison', 'clozeText', ...SHARED_FIELDS],
  modes: ['recall', 'formula', 'formula-cloze', 'condition-conclusion', 'conclusion-condition', 'compare', 'steps'],
  hint: '数学把「公式主体」和「使用条件」分开练：公式默写、条件推结论、结论反推条件、易混对比、解题步骤。',
};

const SIGNALS_PROFILE: SubjectProfile = {
  key: 'signals-systems',
  label: '信号与系统',
  defaultCardType: 'transform',
  cardTypes: [
    { value: 'transform', label: '变换对' },
    { value: 'formula', label: '公式 / 性质' },
    { value: 'condition', label: '适用条件' },
    { value: 'compare', label: '易混变换' },
  ],
  fields: ['title', 'prompt', 'answer', 'formula', 'roc', 'conditions', 'precautions', 'initialConditions', 'finalConditions', 'steps', 'comparison', 'clozeText', ...SHARED_FIELDS],
  modes: ['recall', 'formula', 'transform', 'inverse-transform', 'roc', 'initial-final', 'condition-conclusion', 'conclusion-condition', 'compare', 'steps'],
  hint: '信号把变换对、收敛域、初值/终值条件分开记：正变换、逆变换、单独回忆 ROC、初值与终值条件辨析。',
};

/** Fallback: unknown/custom course keeps every field and mode available. */
const GENERAL_PROFILE: SubjectProfile = {
  key: 'general',
  label: '通用',
  defaultCardType: 'basic',
  cardTypes: [
    { value: 'basic', label: '基础问答' },
    { value: 'formula', label: '公式' },
    { value: 'condition', label: '条件' },
    { value: 'compare', label: '对比' },
    { value: 'cloze', label: '挖空' },
    { value: 'translation', label: '翻译' },
  ],
  fields: ['title', 'prompt', 'answer', 'formula', 'roc', 'conditions', 'precautions', 'steps', 'initialConditions', 'finalConditions', 'explanation', 'pitfalls', 'comparison', 'chinese', 'english', 'letterType', 'paragraphPosition', 'sentenceFunction', 'clozeText', 'source', 'notes'],
  modes: ['recall', 'zh-en', 'en-zh', 'formula', 'cloze', 'formula-cloze', 'condition-conclusion', 'conclusion-condition', 'compare', 'steps', 'paragraph', 'sentence-order', 'sentence-compose', 'template-match', 'transform', 'inverse-transform', 'roc', 'initial-final'],
  hint: '未指定科目的课程显示全部字段与训练模式；为课程设置科目可获得更聚焦的卡片模板。',
};

/** subjectKey aliases used by study-track / knowledge-tags / seeded courses. */
const ALIASES: Record<string, string> = {
  'calculus': 'math',
  'linear-algebra': 'math',
  'linear_algebra': 'math',
  'probability': 'math',
  'probability-statistics': 'math',
  'math': 'math',
  '高数': 'math',
  '线代': 'math',
  '概率论': 'math',
  'signals-systems': 'signals-systems',
  'signals_systems': 'signals-systems',
  '信号与系统': 'signals-systems',
  'postgraduate-english': 'postgraduate-english',
  'english_exam': 'postgraduate-english',
  '考研英语': 'postgraduate-english',
  '考研英语一': 'postgraduate-english',
};

const PROFILES: Record<string, SubjectProfile> = {
  'postgraduate-english': ENGLISH_PROFILE,
  math: MATH_PROFILE,
  'signals-systems': SIGNALS_PROFILE,
  general: GENERAL_PROFILE,
};

/**
 * Choices offered when creating/editing a course. The stored `subjectKey` is the
 * profile key (or the concrete subject key), so a course created as "数学" maps
 * onto the math profile and any finer subject key still resolves through ALIASES.
 */
export const SUBJECT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'postgraduate-english', label: '考研英语一（中英 · 写作模板）' },
  { value: 'calculus', label: '高等数学（公式 · 条件）' },
  { value: 'linear-algebra', label: '线性代数（公式 · 性质）' },
  { value: 'probability', label: '概率论与数理统计（公式 · 分布）' },
  { value: 'signals-systems', label: '信号与系统（变换 · 收敛域）' },
];

export function subjectProfileKey(subjectKey?: string | null): string {
  if (!subjectKey) return 'general';
  const normalized = subjectKey.trim().toLowerCase();
  return ALIASES[normalized] ?? ALIASES[subjectKey.trim()] ?? 'general';
}

export function subjectProfile(subjectKey?: string | null): SubjectProfile {
  return PROFILES[subjectProfileKey(subjectKey)] ?? GENERAL_PROFILE;
}

/** True when the field belongs to the subject's default set. */
export function isProfileField(profile: SubjectProfile, field: string): boolean {
  return profile.fields.includes(field);
}

/** Training modes for a subject, intersected with the full registry order. */
export function subjectModes(profile: SubjectProfile): TrainingModeId[] {
  return [...profile.modes];
}
