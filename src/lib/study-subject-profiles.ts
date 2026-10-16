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
  /** The few fields shown up front; the rest of `fields` collapse under 更多选项. */
  primaryFields: readonly string[];
  /** Training modes offered for this subject, in display order. */
  modes: readonly TrainingModeId[];
  /** Short guidance shown in the editor header. */
  hint: string;
};

const SHARED_FIELDS = ['explanation', 'pitfalls', 'source', 'notes'] as const;

const ENGLISH_PROFILE: SubjectProfile = {
  key: 'postgraduate-english',
  label: '考研英语一 · 作文背诵',
  defaultCardType: 'template',
  cardTypes: [
    { value: 'template', label: '作文段落模板' },
    { value: 'sentence', label: '句式与连接词' },
  ],
  // Composition memorization only: a card is one paragraph template, organized
  // by letter type (小作文) or paragraph position (大作文). No reading-analysis
  // fields (sentence function) and no formula/ROC fields.
  fields: ['title', 'prompt', 'answer', 'chinese', 'english', 'letterType', 'paragraphPosition', 'sentences', 'slots', ...SHARED_FIELDS],
  // Only these are shown up front; prompt/answer are derived from 中文/英文.
  primaryFields: ['chinese', 'english', 'letterType', 'paragraphPosition'],
  modes: ['zh-en', 'cloze', 'sentence-order', 'sentence-compose', 'template-match'],
  hint: '只填「中文提示 + 英文答案」即可；信件类型 / 段落位置用于分类，其余字段在「更多选项」里。',
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
  primaryFields: ['prompt', 'formula', 'conditions'],
  modes: ['recall', 'formula', 'formula-cloze', 'condition-conclusion', 'conclusion-condition', 'compare', 'steps'],
  hint: '填「题面 + 公式 + 适用条件」即可；解题步骤、易混对比、挖空在「更多选项」里。',
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
  primaryFields: ['prompt', 'formula', 'roc'],
  modes: ['recall', 'formula', 'transform', 'inverse-transform', 'roc', 'initial-final', 'condition-conclusion', 'conclusion-condition', 'compare', 'steps'],
  hint: '填「题面 + 公式/变换 + 收敛域」即可；适用条件、初值/终值、步骤在「更多选项」里。',
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
  primaryFields: ['prompt', 'answer'],
  modes: ['recall', 'zh-en', 'en-zh', 'formula', 'cloze', 'formula-cloze', 'condition-conclusion', 'conclusion-condition', 'compare', 'steps', 'paragraph', 'sentence-order', 'sentence-compose', 'template-match', 'transform', 'inverse-transform', 'roc', 'initial-final'],
  hint: '填「题面 + 答案」即可；其余字段在「更多选项」里。为课程设置科目可获得更聚焦的模板。',
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
  { value: 'postgraduate-english', label: '考研英语一（作文背诵）' },
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

/** True when the field is shown up front rather than under 更多选项. */
export function isPrimaryField(profile: SubjectProfile, field: string): boolean {
  return profile.primaryFields.includes(field);
}

/** Training modes for a subject, intersected with the full registry order. */
export function subjectModes(profile: SubjectProfile): TrainingModeId[] {
  return [...profile.modes];
}
