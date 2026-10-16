import type { RecallRating } from '@/lib/study-contract';

export type { RecallRating };

export interface SchedulingState {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
}

export interface SchedulerSettings {
  relearnMinutes: number;
  initialGoodDays: number;
  initialEasyDays: number;
  hardMultiplier: number;
  easyMultiplier: number;
  maxIntervalDays: number;
  examDate: Date | null;
  timezone: string;
}

export interface ScheduledReview extends SchedulingState {
  dueAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  relearnMinutes: 10,
  initialGoodDays: 1,
  initialEasyDays: 4,
  hardMultiplier: 1.2,
  easyMultiplier: 1.3,
  maxIntervalDays: 365,
  examDate: null,
  timezone: 'Asia/Shanghai',
};

export function scheduleReviewWithSettings(
  state: SchedulingState,
  rating: RecallRating,
  settings: Partial<SchedulerSettings> = {},
  now = new Date(),
): ScheduledReview {
  const config = { ...DEFAULT_SCHEDULER_SETTINGS, ...settings };
  const safeEase = Math.max(1.3, Number.isFinite(state.easeFactor) ? state.easeFactor : 2.5);
  let intervalDays = Math.max(0, state.intervalDays || 0);
  let easeFactor = safeEase;
  let repetitions = Math.max(0, state.repetitions || 0);
  let lapses = Math.max(0, state.lapses || 0);
  let delayMs: number;

  if (rating === 'again') {
    delayMs = Math.max(1, config.relearnMinutes) * 60 * 1000;
    intervalDays = 0;
    repetitions = 0;
    lapses += 1;
    easeFactor = Math.max(1.3, safeEase - 0.2);
  } else if (rating === 'hard') {
    intervalDays = repetitions === 0
      ? Math.max(1, config.initialGoodDays)
      : Math.max(1, intervalDays * config.hardMultiplier);
    repetitions += 1;
    easeFactor = Math.max(1.3, safeEase - 0.15);
    delayMs = intervalDays * DAY_MS;
  } else if (rating === 'easy') {
    intervalDays = repetitions === 0
      ? Math.max(1, config.initialEasyDays)
      : Math.max(1, intervalDays * safeEase * config.easyMultiplier);
    repetitions += 1;
    easeFactor = safeEase + 0.15;
    delayMs = intervalDays * DAY_MS;
  } else {
    intervalDays = repetitions === 0
      ? Math.max(1, config.initialGoodDays)
      : Math.max(1, intervalDays * safeEase);
    repetitions += 1;
    delayMs = intervalDays * DAY_MS;
  }

  intervalDays = Math.min(config.maxIntervalDays, intervalDays);
  delayMs = rating === 'again' ? delayMs : intervalDays * DAY_MS;
  let dueAt = new Date(now.getTime() + delayMs);
  if (config.examDate && dueAt.getTime() > config.examDate.getTime()) dueAt = new Date(config.examDate);

  return {
    intervalDays: Math.round(intervalDays * 100) / 100,
    easeFactor: Math.round(easeFactor * 100) / 100,
    repetitions,
    lapses,
    dueAt,
  };
}

/** Backward-compatible default scheduler used by existing callers. */
export function scheduleReview(
  state: SchedulingState,
  rating: RecallRating,
  now = new Date(),
): ScheduledReview {
  return scheduleReviewWithSettings(state, rating, DEFAULT_SCHEDULER_SETTINGS, now);
}

export function parseTags(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return value.split(/[,，\n]/).map(x => x.trim()).filter(Boolean);
  }
}
