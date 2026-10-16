import { prisma } from '@/lib/prisma';
import { type StudyCardRecord } from '@/lib/study-backend';
import { StudyValidationError } from '@/lib/study-contract';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_CARDS = 10_000;

type TransferModule = {
  parseStudyImport(data: string, format: string, mapping?: Record<string, string>): Promise<import('./study-transfer').TransferPreview> | import('./study-transfer').TransferPreview;
  serializeStudyCards(cards: Record<string, unknown>[], format: string): Promise<string> | string;
};

export async function transferWorker(): Promise<TransferModule> {
  // The transfer workstream owns this pure module; keeping the import here avoids
  // coupling API auth/transactions to its parser implementation.
  return import('@/lib/study-transfer') as unknown as TransferModule;
}

export function transferCardFromRecord(card: StudyCardRecord): Record<string, unknown> {
  return {
    id: card.id,
    userId: card.userId,
    courseId: card.courseId,
    course: card.course.name,
    chapterId: card.chapterId,
    chapter: card.chapter?.name ?? null,
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
    sentences: parseJsonArray(card.sentences),
    slots: parseJsonMap(card.slots),
    tags: parseJsonArray(card.tags),
  };
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function parseJsonMap(value: string | null): Record<string, string> {
  if (!value) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}

export function transferRowToInput(row: Record<string, unknown>) {
  return {
    title: row.title,
    cardType: row.cardType ?? 'basic',
    prompt: row.prompt,
    answer: row.answer,
    explanation: row.explanation ?? null,
    conditions: row.conditions ?? null,
    pitfalls: row.pitfalls ?? null,
    source: row.source ?? null,
    notes: row.notes ?? null,
    formula: row.formula ?? null,
    roc: row.roc ?? null,
    precautions: row.precautions ?? null,
    steps: row.steps ?? null,
    initialConditions: row.initialConditions ?? null,
    finalConditions: row.finalConditions ?? null,
    chinese: row.chinese ?? null,
    english: row.english ?? null,
    letterType: row.letterType ?? null,
    paragraphPosition: row.paragraphPosition ?? null,
    sentenceFunction: row.sentenceFunction ?? null,
    clozeText: row.clozeText ?? null,
    comparison: row.comparison ?? null,
    sentences: row.sentences ?? [],
    slots: row.slots ?? {},
    tags: row.tags ?? [],
  };
}

export function exactCardSignature(data: Record<string, unknown>): string {
  const fields = [
    'title', 'cardType', 'prompt', 'answer', 'explanation', 'conditions', 'pitfalls', 'formula', 'roc',
    'precautions', 'steps', 'initialConditions', 'finalConditions', 'chinese', 'english', 'letterType',
    'paragraphPosition', 'sentenceFunction', 'clozeText', 'comparison', 'sentences', 'slots', 'tags', 'source', 'notes',
  ];
  return JSON.stringify(fields.map(field => {
    const value = data[field] ?? (field === 'slots' ? {} : ['sentences', 'tags'].includes(field) ? [] : null);
    if (['sentences', 'slots', 'tags'].includes(field) && typeof value === 'string') {
      try { return [field, JSON.parse(value)]; } catch { return [field, value]; }
    }
    return [field, value];
  }));
}

export function assertImportSize(data: string): void {
  if (Buffer.byteLength(data, 'utf8') > MAX_IMPORT_BYTES) throw new StudyValidationError('导入数据过大');
}

export async function existingSignatures(userId: string): Promise<Set<string>> {
  const cards = await prisma.memoryCard.findMany({ where: { userId }, include: { course: { select: { name: true } }, chapter: { select: { name: true } } } });
  return new Set(cards.map(card => `${card.courseId}:${card.chapterId ?? ''}:${exactCardSignature(transferCardFromRecord(card as never))}`));
}
