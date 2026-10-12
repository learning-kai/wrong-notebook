export type RecallRating = 'again' | 'hard' | 'good' | 'easy';

export interface SchedulingState {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
}

export interface ScheduledReview extends SchedulingState {
  dueAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A small, explainable SM-2-style scheduler for the MVP. */
export function scheduleReview(
  state: SchedulingState,
  rating: RecallRating,
  now = new Date(),
): ScheduledReview {
  const safeEase = Math.max(1.3, state.easeFactor || 2.5);
  let intervalDays = Math.max(0, state.intervalDays || 0);
  let easeFactor = safeEase;
  let repetitions = state.repetitions || 0;
  let lapses = state.lapses || 0;
  let delayMs: number;

  if (rating === 'again') {
    delayMs = 10 * 60 * 1000;
    intervalDays = 0;
    repetitions = 0;
    lapses += 1;
    easeFactor = Math.max(1.3, safeEase - 0.2);
  } else if (rating === 'hard') {
    intervalDays = Math.max(1, intervalDays ? intervalDays * 1.2 : 1);
    repetitions += 1;
    easeFactor = Math.max(1.3, safeEase - 0.15);
    delayMs = intervalDays * DAY_MS;
  } else if (rating === 'easy') {
    intervalDays = Math.max(4, intervalDays ? intervalDays * safeEase * 1.3 : 4);
    repetitions += 1;
    easeFactor = safeEase + 0.15;
    delayMs = intervalDays * DAY_MS;
  } else {
    intervalDays = Math.max(1, intervalDays ? intervalDays * safeEase : 1);
    repetitions += 1;
    delayMs = intervalDays * DAY_MS;
  }

  return {
    intervalDays: Math.round(intervalDays * 100) / 100,
    easeFactor: Math.round(easeFactor * 100) / 100,
    repetitions,
    lapses,
    dueAt: new Date(now.getTime() + delayMs),
  };
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
