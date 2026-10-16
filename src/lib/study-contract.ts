export const CARD_TYPES = ['basic', 'translation', 'formula', 'cloze', 'condition', 'compare'] as const;
export type CardType = (typeof CARD_TYPES)[number] | string;
export type RecallRating = 'again' | 'hard' | 'good' | 'easy';
export const RATINGS: readonly RecallRating[] = ['again', 'hard', 'good', 'easy'];
export const THEMES = ['system', 'light', 'dark'] as const;

export type StudySettingsDTO = {
  userId: string;
  dailyNewLimit: number;
  dailyReviewLimit: number;
  relearnMinutes: number;
  initialGoodDays: number;
  initialEasyDays: number;
  hardMultiplier: number;
  easyMultiplier: number;
  maxIntervalDays: number;
  examDate: string | null;
  timezone: string;
  theme: (typeof THEMES)[number];
  defaultsInitialized: boolean;
};

export type CardDTO = {
  id: string;
  userId: string;
  courseId: string;
  chapterId: string | null;
  title: string;
  cardType: string;
  prompt: string;
  answer: string;
  explanation: string | null;
  conditions: string | null;
  pitfalls: string | null;
  source: string | null;
  notes: string | null;
  formula: string | null;
  roc: string | null;
  precautions: string | null;
  steps: string | null;
  initialConditions: string | null;
  finalConditions: string | null;
  chinese: string | null;
  english: string | null;
  letterType: string | null;
  paragraphPosition: string | null;
  sentenceFunction: string | null;
  clozeText: string | null;
  comparison: string | null;
  sentences: string[];
  slots: Record<string, string>;
  tags: string[];
  dueAt: string;
  lastReviewedAt: string | null;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
  course: { id: string; name: string };
  chapter: { id: string; name: string } | null;
  latestReview?: ReviewDTO | null;
};

export type ReviewDTO = {
  id: string;
  rating: RecallRating | string;
  mode: string;
  responseText: string | null;
  note?: string | null;
  responseMs: number | null;
  clientEventId: string | null;
  reviewedAt: string;
  nextDueAt: string | null;
};

export class StudyValidationError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'StudyValidationError';
    this.field = field;
  }
}

export function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new StudyValidationError(`${field}不能为空`, field);
  }
  // Validation trims only to determine emptiness. The stored value is untouched.
  return value;
}

export function optionalText(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new StudyValidationError(`${field}必须是字符串`, field);
  return value;
}

export function stringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new StudyValidationError(`${field}必须是字符串数组`, field);
  }
  return value.slice();
}

export function stringMap(value: unknown, field: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new StudyValidationError(`${field}必须是字符串字典`, field);
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new StudyValidationError(`${field}的值必须是字符串`, field);
    result[key] = item;
  }
  return result;
}

export function finiteInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new StudyValidationError(`${field}必须是${min}到${max}之间的整数`, field);
  }
  return value;
}

export function finiteNumber(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new StudyValidationError(`${field}超出允许范围`, field);
  }
  return value;
}

export function parseIsoDate(value: unknown, field: string, nullable = true): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new StudyValidationError(`${field}必须是ISO日期`, field);
  }
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new StudyValidationError(`${field}必须是ISO日期`, field);
  return result;
}

export function parseStoredArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function parseStoredMap(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

export function jsonValue(value: unknown): string {
  return JSON.stringify(value);
}

export function parseJsonBody<T = unknown>(body: unknown): T {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new StudyValidationError('请求体必须是JSON对象');
  }
  return body as T;
}
