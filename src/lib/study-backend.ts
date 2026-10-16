import {
  finiteInteger,
  finiteNumber,
  jsonValue,
  optionalText,
  parseStoredArray,
  parseStoredMap,
  requiredText,
  stringArray,
  stringMap,
  type CardDTO,
  type RecallRating,
  type ReviewDTO,
  StudyValidationError,
} from '@/lib/study-contract';
import { scheduleReviewWithSettings, type SchedulerSettings } from '@/lib/study-scheduler';

export type StudyCardRecord = {
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
  sentences: string | null;
  slots: string | null;
  tags: string | null;
  source: string | null;
  notes: string | null;
  dueAt: Date;
  lastReviewedAt: Date | null;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  suspended: boolean;
  createdAt: Date;
  updatedAt: Date;
  course: { id: string; name: string };
  chapter: { id: string; name: string } | null;
};

export type StudyReviewRecord = {
  id: string;
  userId: string;
  cardId: string;
  rating: RecallRating | string;
  mode: string;
  responseText: string | null;
  note?: string | null;
  responseMs: number | null;
  clientEventId: string | null;
  previousDueAt: Date | null;
  nextDueAt: Date | null;
  reviewedAt: Date;
  reviewOrder?: number;
};

export type StudyCardInput = {
  title: unknown;
  prompt: unknown;
  answer: unknown;
  courseId?: unknown;
  chapterId?: unknown;
  cardType?: unknown;
  tags?: unknown;
  sentences?: unknown;
  slots?: unknown;
  [key: string]: unknown;
};

const CARD_OPTIONAL_FIELDS = [
  'explanation', 'conditions', 'pitfalls', 'formula', 'roc', 'precautions', 'steps',
  'initialConditions', 'finalConditions', 'chinese', 'english', 'letterType',
  'paragraphPosition', 'sentenceFunction', 'clozeText', 'comparison', 'source', 'notes',
] as const;

export function buildCardData(input: StudyCardInput, courseId: string, partial = false): Record<string, unknown> {
  if (!courseId) throw new StudyValidationError('课程不能为空', 'courseId');
  const data: Record<string, unknown> = { courseId };
  if (!partial || input.title !== undefined) data.title = requiredText(input.title, 'title');
  if (!partial || input.prompt !== undefined) data.prompt = requiredText(input.prompt, 'prompt');
  if (!partial || input.answer !== undefined) data.answer = requiredText(input.answer, 'answer');
  if (!partial || input.cardType !== undefined) {
    if (input.cardType !== undefined && typeof input.cardType !== 'string') {
      throw new StudyValidationError('cardType必须是字符串', 'cardType');
    }
    data.cardType = input.cardType === undefined ? 'basic' : input.cardType;
  }
  for (const field of CARD_OPTIONAL_FIELDS) {
    if (!partial || input[field] !== undefined) data[field] = optionalText(input[field], field) ?? null;
  }
  if (!partial || input.chapterId !== undefined) {
    if (input.chapterId !== undefined && input.chapterId !== null && typeof input.chapterId !== 'string') {
      throw new StudyValidationError('chapterId必须是字符串或null', 'chapterId');
    }
    data.chapterId = input.chapterId || null;
  }
  if (!partial || input.tags !== undefined) {
    const tags = stringArray(input.tags ?? [], 'tags');
    data.tags = jsonValue(tags ?? []);
  }
  if (!partial || input.sentences !== undefined) {
    const sentences = stringArray(input.sentences ?? [], 'sentences');
    data.sentences = jsonValue(sentences ?? []);
  }
  if (!partial || input.slots !== undefined) {
    const slots = stringMap(input.slots ?? {}, 'slots');
    data.slots = jsonValue(slots ?? {});
  }
  return data;
}

function dateIso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function serializeReview(review: StudyReviewRecord): ReviewDTO {
  return {
    id: review.id,
    rating: review.rating,
    mode: review.mode,
    responseText: review.responseText ?? null,
    note: review.note ?? null,
    responseMs: review.responseMs ?? null,
    clientEventId: review.clientEventId ?? null,
    reviewedAt: new Date(review.reviewedAt).toISOString(),
    nextDueAt: dateIso(review.nextDueAt),
  };
}

export function serializeCard(card: StudyCardRecord, latestReview?: StudyReviewRecord | null): CardDTO {
  return {
    id: card.id,
    userId: card.userId,
    courseId: card.courseId,
    chapterId: card.chapterId,
    title: card.title,
    cardType: card.cardType,
    prompt: card.prompt,
    answer: card.answer,
    explanation: card.explanation,
    conditions: card.conditions,
    pitfalls: card.pitfalls,
    source: card.source,
    notes: card.notes,
    formula: card.formula,
    roc: card.roc,
    precautions: card.precautions,
    steps: card.steps,
    initialConditions: card.initialConditions,
    finalConditions: card.finalConditions,
    chinese: card.chinese,
    english: card.english,
    letterType: card.letterType,
    paragraphPosition: card.paragraphPosition,
    sentenceFunction: card.sentenceFunction,
    clozeText: card.clozeText,
    comparison: card.comparison,
    sentences: parseStoredArray(card.sentences),
    slots: parseStoredMap(card.slots),
    tags: parseStoredArray(card.tags),
    dueAt: new Date(card.dueAt).toISOString(),
    lastReviewedAt: dateIso(card.lastReviewedAt),
    intervalDays: card.intervalDays,
    easeFactor: card.easeFactor,
    repetitions: card.repetitions,
    lapses: card.lapses,
    suspended: card.suspended,
    createdAt: new Date(card.createdAt).toISOString(),
    updatedAt: new Date(card.updatedAt).toISOString(),
    course: card.course,
    chapter: card.chapter,
    ...(latestReview === undefined ? {} : { latestReview: latestReview ? serializeReview(latestReview) : null }),
  };
}

function validTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new StudyValidationError('timezone不是有效时区', 'timezone');
  }
}

function partsFor(date: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

export function localDateKey(date: Date, timezone: string): string {
  validTimezone(timezone);
  const parts = partsFor(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Convert a wall-clock date in an IANA zone to the corresponding UTC instant. */
export function getDateRangeForTimezone(dateKey: string, timezone: string): { start: Date; end: Date } {
  validTimezone(timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new StudyValidationError('日期格式无效');
  const [year, month, day] = dateKey.split('-').map(Number);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (calendarCheck.getUTCFullYear() !== year || calendarCheck.getUTCMonth() !== month - 1 || calendarCheck.getUTCDate() !== day) throw new StudyValidationError('日期无效');
  const toUtc = (hour: number): Date => {
    let guess = new Date(Date.UTC(year, month - 1, day, hour));
    for (let i = 0; i < 3; i += 1) {
      const p = partsFor(guess, timezone);
      const actual = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
      const wanted = Date.UTC(year, month - 1, day, hour);
      guess = new Date(guess.getTime() + wanted - actual);
    }
    return guess;
  };
  return { start: toUtc(0), end: toUtc(24) };
}

export type DueQueueOptions = {
  now: Date;
  timezone: string;
  mode?: 'due' | 'mistakes' | 'today-mistakes' | 'random' | 'all';
  courseId?: string;
  chapterId?: string;
  cardType?: string;
  examDate?: Date | null;
  reviews?: StudyReviewRecord[];
  dailyNewLimit: number;
  dailyReviewLimit: number;
  todayNewUsed: number;
  todayReviewsUsed: number;
};

function compareCards(a: StudyCardRecord, b: StudyCardRecord): number {
  return a.dueAt.getTime() - b.dueAt.getTime()
    || a.createdAt.getTime() - b.createdAt.getTime()
    || a.id.localeCompare(b.id);
}

function latestReviews(reviews: StudyReviewRecord[]): Map<string, StudyReviewRecord> {
  const result = new Map<string, StudyReviewRecord>();
  for (const review of reviews) {
    const old = result.get(review.cardId);
    if (!old || review.reviewedAt.getTime() > old.reviewedAt.getTime()
      || (review.reviewedAt.getTime() === old.reviewedAt.getTime() && ((review.reviewOrder ?? 0) > (old.reviewOrder ?? 0) || ((review.reviewOrder ?? 0) === (old.reviewOrder ?? 0) && review.id > old.id)))) result.set(review.cardId, review);
  }
  return result;
}

export function buildDueQueue(cards: StudyCardRecord[], options: DueQueueOptions): StudyCardRecord[] {
  const mode = options.mode ?? 'due';
  const reviews = options.reviews ?? [];
  const latest = latestReviews(reviews);
  const eligible = cards.filter(card => {
    if (card.suspended) return false;
    if (options.courseId && card.courseId !== options.courseId) return false;
    if (options.chapterId && card.chapterId !== options.chapterId) return false;
    if (options.cardType && card.cardType !== options.cardType) return false;
    if (mode === 'due' && card.dueAt.getTime() > options.now.getTime()) return false;
    if (mode === 'mistakes' || mode === 'today-mistakes') {
      const latestReview = latest.get(card.id);
      if (!latestReview || !['again', 'hard'].includes(latestReview.rating)) return false;
      if (mode === 'today-mistakes' && localDateKey(latestReview.reviewedAt, options.timezone) !== localDateKey(options.now, options.timezone)) return false;
    }
    if (options.examDate && card.dueAt.getTime() > options.examDate.getTime()) return false;
    return true;
  });
  eligible.sort(compareCards);
  if (mode === 'random') {
    // Fisher-Yates is intentionally applied after all ownership/scope filters.
    for (let i = eligible.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    return eligible;
  }
  if (mode !== 'due') return eligible;
  const newRemaining = Math.max(0, options.dailyNewLimit - options.todayNewUsed);
  const reviewRemaining = Math.max(0, options.dailyReviewLimit - options.todayReviewsUsed);
  const newCards = eligible.filter(card => card.repetitions === 0 && card.lastReviewedAt === null).slice(0, newRemaining);
  const reviewCards = eligible.filter(card => !(card.repetitions === 0 && card.lastReviewedAt === null)).slice(0, reviewRemaining);
  return [...newCards, ...reviewCards];
}

export function schedulerFromSettings(settings: Partial<SchedulerSettings>): SchedulerSettings {
  return {
    relearnMinutes: settings.relearnMinutes ?? 10,
    initialGoodDays: settings.initialGoodDays ?? 1,
    initialEasyDays: settings.initialEasyDays ?? 4,
    hardMultiplier: settings.hardMultiplier ?? 1.2,
    easyMultiplier: settings.easyMultiplier ?? 1.3,
    maxIntervalDays: settings.maxIntervalDays ?? 365,
    examDate: settings.examDate ?? null,
    timezone: settings.timezone ?? 'Asia/Shanghai',
  };
}

export type StudyStats = {
  total: number;
  due: number;
  reviewsToday: number;
  accuracy: number;
  todayAccuracy: number;
  streak: number;
  forgettingRate: number;
  courses: Array<{ id: string; name: string; count: number; mastery: number }>;
  weakChapters: Array<{ id: string; name: string; course: string; count: number; forgettingRate: number; mastery: number }>;
  daily: Array<{ date: string; reviews: number; successes: number; forgotten: number }>;
  weakCards: Array<{ id: string; title: string; course: string; chapter: string | null; consecutiveFailures: number; lapses: number }>;
  todayNewUsed: number;
  todayReviewsUsed: number;
};

const success = (rating: string) => rating === 'good' || rating === 'easy';
const failed = (rating: string) => rating === 'again' || rating === 'hard';
const percent = (numerator: number, denominator: number) => denominator ? Math.round((numerator / denominator) * 10000) / 100 : 0;

export function calculateStudyStats(cards: StudyCardRecord[], reviews: StudyReviewRecord[], options: { now: Date; timezone: string; courses?: Array<{ id: string; name: string }> }): StudyStats {
  const today = localDateKey(options.now, options.timezone);
  const todayReviews = reviews.filter(review => localDateKey(review.reviewedAt, options.timezone) === today);
  const sortedReviews = [...reviews].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime() || a.id.localeCompare(b.id));
  const successes = reviews.filter(review => success(review.rating)).length;
  const todaySuccesses = todayReviews.filter(review => success(review.rating)).length;
  const firstReviewIds = new Set<string>();
  const seenCards = new Set<string>();
  for (const review of sortedReviews) {
    if (!seenCards.has(review.cardId)) {
      seenCards.add(review.cardId);
      firstReviewIds.add(review.id);
    }
  }
  const dailyMap = new Map<string, { reviews: number; successes: number; forgotten: number }>();
  for (const review of reviews) {
    const key = localDateKey(review.reviewedAt, options.timezone);
    const row = dailyMap.get(key) ?? { reviews: 0, successes: 0, forgotten: 0 };
    row.reviews += 1;
    if (success(review.rating)) row.successes += 1;
    if (review.rating === 'again' || review.rating === 'hard') row.forgotten += 1;
    dailyMap.set(key, row);
  }
  const daily: StudyStats['daily'] = [];
  const end = new Date(getDateRangeForTimezone(today, options.timezone).start);
  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date(end.getTime() - i * 86400000);
    const key = localDateKey(date, options.timezone);
    const row = dailyMap.get(key) ?? { reviews: 0, successes: 0, forgotten: 0 };
    daily.push({ date: key, ...row });
  }
  const activeDays = new Set(dailyMap.keys());
  let streak = 0;
  let cursor = today;
  if (!activeDays.has(cursor)) {
    const yesterday = new Date(end.getTime() - 86400000);
    cursor = localDateKey(yesterday, options.timezone);
  }
  while (activeDays.has(cursor)) {
    streak += 1;
    const [year, month, day] = cursor.split('-').map(Number);
    const prior = new Date(Date.UTC(year, month - 1, day) - 86400000);
    cursor = `${prior.getUTCFullYear()}-${String(prior.getUTCMonth() + 1).padStart(2, '0')}-${String(prior.getUTCDate()).padStart(2, '0')}`;
  }
  const latest = latestReviews(reviews);
  const due = cards.filter(card => !card.suspended && card.dueAt.getTime() <= options.now.getTime()).length;
  const cardsByCourse = new Map<string, StudyCardRecord[]>();
  const cardsByChapter = new Map<string, StudyCardRecord[]>();
  for (const card of cards) {
    const list = cardsByCourse.get(card.courseId) ?? [];
    list.push(card); cardsByCourse.set(card.courseId, list);
    if (card.chapterId) {
      const chapterList = cardsByChapter.get(card.chapterId) ?? [];
      chapterList.push(card); cardsByChapter.set(card.chapterId, chapterList);
    }
  }
  const mastery = (items: StudyCardRecord[]) => percent(items.filter(card => {
    const review = latest.get(card.id);
    return review && success(review.rating) && card.intervalDays >= 7;
  }).length, items.length);
  const courses = (options.courses ?? [...cardsByCourse.entries()].map(([id, items]) => ({ id, name: items[0].course.name }))).map(course => {
    const items = cardsByCourse.get(course.id) ?? [];
    return { id: course.id, name: course.name, count: items.length, mastery: mastery(items) };
  });
  const weakChapters = [...cardsByChapter.entries()].map(([id, items]) => {
    const chapterReviews = reviews.filter(review => items.some(card => card.id === review.cardId));
    return {
      id,
      name: items[0].chapter?.name ?? '未分章节',
      course: items[0].course.name,
      count: items.filter(card => failed(latest.get(card.id)?.rating ?? '')).length,
      forgettingRate: percent(chapterReviews.filter(review => failed(review.rating)).length, chapterReviews.length),
      mastery: mastery(items),
    };
  }).filter(item => item.count > 0).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)).slice(0, 20);
  const weakCards = cards.map(card => {
    const cardReviews = reviews.filter(review => review.cardId === card.id).sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime() || (b.reviewOrder ?? 0) - (a.reviewOrder ?? 0) || b.id.localeCompare(a.id));
    let consecutiveFailures = 0;
    for (const review of cardReviews) {
      if (!failed(review.rating)) break;
      consecutiveFailures += 1;
    }
    return { id: card.id, title: card.title, course: card.course.name, chapter: card.chapter?.name ?? null, consecutiveFailures, lapses: card.lapses };
  }).filter(card => card.consecutiveFailures > 0).sort((a, b) => b.consecutiveFailures - a.consecutiveFailures || a.id.localeCompare(b.id)).slice(0, 20);
  return {
    total: cards.filter(card => !card.suspended).length,
    due,
    reviewsToday: todayReviews.length,
    accuracy: percent(successes, reviews.length),
    todayAccuracy: percent(todaySuccesses, todayReviews.length),
    streak,
    forgettingRate: percent(reviews.filter(review => failed(review.rating)).length, reviews.length),
    courses,
    weakChapters,
    daily,
    weakCards,
    todayNewUsed: todayReviews.filter(review => firstReviewIds.has(review.id)).length,
    todayReviewsUsed: todayReviews.filter(review => !firstReviewIds.has(review.id)).length,
  };
}

export function validateSettingsPatch(input: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.dailyNewLimit !== undefined) data.dailyNewLimit = finiteInteger(input.dailyNewLimit, 'dailyNewLimit', 0, 10000);
  if (input.dailyReviewLimit !== undefined) data.dailyReviewLimit = finiteInteger(input.dailyReviewLimit, 'dailyReviewLimit', 0, 10000);
  if (input.relearnMinutes !== undefined) data.relearnMinutes = finiteInteger(input.relearnMinutes, 'relearnMinutes', 1, 10080);
  if (input.initialGoodDays !== undefined) data.initialGoodDays = finiteInteger(input.initialGoodDays, 'initialGoodDays', 1, 3650);
  if (input.initialEasyDays !== undefined) data.initialEasyDays = finiteInteger(input.initialEasyDays, 'initialEasyDays', 1, 3650);
  if (input.hardMultiplier !== undefined) data.hardMultiplier = finiteNumber(input.hardMultiplier, 'hardMultiplier', 1, 3);
  if (input.easyMultiplier !== undefined) data.easyMultiplier = finiteNumber(input.easyMultiplier, 'easyMultiplier', 1, 5);
  if (input.maxIntervalDays !== undefined) data.maxIntervalDays = finiteInteger(input.maxIntervalDays, 'maxIntervalDays', 1, 36500);
  if (input.examDate !== undefined) {
    if (input.examDate === null) data.examDate = null;
    else {
      const parsed = input.examDate instanceof Date ? input.examDate : new Date(String(input.examDate));
      if (Number.isNaN(parsed.getTime())) throw new StudyValidationError('examDate必须是有效日期', 'examDate');
      data.examDate = parsed;
    }
  }
  if (input.timezone !== undefined) {
    if (typeof input.timezone !== 'string') throw new StudyValidationError('timezone必须是字符串', 'timezone');
    validTimezone(input.timezone); data.timezone = input.timezone;
  }
  if (input.theme !== undefined) {
    if (typeof input.theme !== 'string' || !['system', 'light', 'dark'].includes(input.theme)) throw new StudyValidationError('theme无效', 'theme');
    data.theme = input.theme;
  }
  return data;
}

export { scheduleReviewWithSettings };
