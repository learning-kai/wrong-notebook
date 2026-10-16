/** Pure, lossless study-card transfer helpers shared by import/export workers. */

export type StudyTransferFormat = 'csv' | 'markdown' | 'json';

export interface TransferCard {
  id?: string;
  userId?: string;
  courseId?: string;
  chapterId?: string;
  course?: string | null;
  chapter?: string | null;
  title: string;
  cardType: string;
  prompt: string;
  answer: string;
  explanation?: string | null;
  conditions?: string | null;
  pitfalls?: string | null;
  source?: string | null;
  notes?: string | null;
  formula?: string | null;
  roc?: string | null;
  precautions?: string | null;
  steps?: string | null;
  initialConditions?: string | null;
  finalConditions?: string | null;
  chinese?: string | null;
  english?: string | null;
  letterType?: string | null;
  paragraphPosition?: string | null;
  sentenceFunction?: string | null;
  clozeText?: string | null;
  comparison?: string | null;
  tags: string[];
  sentences: string[];
  slots: Record<string, string>;
  dueAt?: string | null;
  lastReviewedAt?: string | null;
  intervalDays?: number;
  easeFactor?: number;
  repetitions?: number;
  lapses?: number;
  suspended?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TransferError {
  row: number;
  field?: string;
  message: string;
}

export interface TransferPreview {
  headers: string[];
  rows: TransferCard[];
  errors: TransferError[];
  warnings: string[];
  validCount: number;
}

const TRANSFER_FIELDS = [
  'id', 'userId', 'courseId', 'chapterId', 'course', 'chapter',
  'title', 'cardType', 'prompt', 'answer', 'explanation', 'conditions',
  'pitfalls', 'tags', 'source', 'notes', 'formula', 'roc', 'precautions',
  'steps', 'initialConditions', 'finalConditions', 'chinese', 'english',
  'letterType', 'paragraphPosition', 'sentenceFunction', 'clozeText',
  'comparison', 'sentences', 'slots', 'dueAt', 'lastReviewedAt',
  'intervalDays', 'easeFactor', 'repetitions', 'lapses', 'suspended',
  'createdAt', 'updatedAt',
] as const;

type TransferField = (typeof TRANSFER_FIELDS)[number];

const STRING_FIELDS = new Set<TransferField>([
  'id', 'userId', 'courseId', 'chapterId', 'course', 'chapter', 'title',
  'cardType', 'prompt', 'answer', 'explanation', 'conditions', 'pitfalls',
  'source', 'notes', 'formula', 'roc', 'precautions', 'steps',
  'initialConditions', 'finalConditions', 'chinese', 'english', 'letterType',
  'paragraphPosition', 'sentenceFunction', 'clozeText', 'comparison',
  'dueAt', 'lastReviewedAt', 'createdAt', 'updatedAt',
]);
const NULLABLE_STRING_FIELDS = new Set<TransferField>([
  'course', 'chapter', 'explanation', 'conditions', 'pitfalls', 'source',
  'notes', 'formula', 'roc', 'precautions', 'steps', 'initialConditions',
  'finalConditions', 'chinese', 'english', 'letterType', 'paragraphPosition',
  'sentenceFunction', 'clozeText', 'comparison', 'dueAt', 'lastReviewedAt',
  'createdAt', 'updatedAt',
]);
const NUMBER_FIELDS = new Set<TransferField>([
  'intervalDays', 'easeFactor', 'repetitions', 'lapses',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emptyCard(): TransferCard {
  return { title: '', cardType: 'basic', prompt: '', answer: '', tags: [], sentences: [], slots: {} };
}

function addError(errors: TransferError[], row: number, message: string, field?: string): void {
  errors.push(field ? { row, field, message } : { row, message });
}

function addWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function parseJsonValue(value: string, row: number, field: string, errors: TransferError[]): unknown {
  try {
    return JSON.parse(value);
  } catch {
    addError(errors, row, '不是有效 JSON，未丢弃原始单元格内容', field);
    return undefined;
  }
}

function readStringArray(
  value: string | undefined,
  row: number,
  field: string,
  errors: TransferError[],
): string[] {
  if (value === undefined || value === '') return [];
  const parsed = parseJsonValue(value, row, field, errors);
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
    addError(errors, row, '必须是 JSON 字符串数组', field);
    return [];
  }
  return parsed;
}

function readStringMap(
  value: string | undefined,
  row: number,
  field: string,
  errors: TransferError[],
): Record<string, string> {
  if (value === undefined || value === '') return {};
  const parsed = parseJsonValue(value, row, field, errors);
  if (!isRecord(parsed) || Object.values(parsed).some(item => typeof item !== 'string')) {
    addError(errors, row, '必须是 JSON 字符串映射', field);
    return {};
  }
  return parsed as Record<string, string>;
}

function parseBoolean(value: string | undefined, row: number, field: string, errors: TransferError[]): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  addError(errors, row, '必须是 true 或 false', field);
  return undefined;
}

function parseNumber(value: string | undefined, row: number, field: string, errors: TransferError[]): number | undefined {
  if (value === undefined || value === '') return undefined;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    addError(errors, row, '必须是有限数字', field);
    return undefined;
  }
  return numberValue;
}

function validateAndWarn(card: TransferCard, row: number, errors: TransferError[], warnings: string[]): void {
  for (const field of ['title', 'prompt', 'answer'] as const) {
    if (card[field].length === 0) addError(errors, row, '必填文本为空；未 trim 或改写其他字段', field);
  }
  if (card.formula) {
    const dollarCount = (card.formula.match(/(?<!\\)\$/g) ?? []).length;
    if (dollarCount % 2 !== 0) addWarning(warnings, `第 ${row} 行 formula 的 $ 定界符数量为奇数，请人工核对`);
    const opens = (card.formula.match(/\{/g) ?? []).length;
    const closes = (card.formula.match(/\}/g) ?? []).length;
    if (opens !== closes) addWarning(warnings, `第 ${row} 行 formula 的花括号不平衡，请人工核对`);
  }
  if (card.clozeText) {
    const markers = [...card.clozeText.matchAll(/\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g)];
    if (markers.length === 0 && /\{\{|\}\}/.test(card.clozeText)) {
      addWarning(warnings, `第 ${row} 行 clozeText 含疑似占位符但没有有效 {{cN::text}} 标记`);
    }
    const opens = (card.clozeText.match(/\{\{/g) ?? []).length;
    const closes = (card.clozeText.match(/\}\}/g) ?? []).length;
    if (opens !== closes) addWarning(warnings, `第 ${row} 行 clozeText 的占位符定界符不平衡，请人工核对`);
  }
}

function cardFromCsvValues(
  values: Record<string, string | undefined>,
  row: number,
  errors: TransferError[],
  warnings: string[],
): TransferCard {
  const card = emptyCard();
  for (const field of TRANSFER_FIELDS) {
    const value = values[field];
    if (field === 'tags') {
      card.tags = readStringArray(value, row, field, errors);
    } else if (field === 'sentences') {
      card.sentences = readStringArray(value, row, field, errors);
    } else if (field === 'slots') {
      card.slots = readStringMap(value, row, field, errors);
    } else if (NUMBER_FIELDS.has(field)) {
      const numberValue = parseNumber(value, row, field, errors);
      if (numberValue !== undefined) (card as unknown as Record<string, unknown>)[field] = numberValue;
    } else if (field === 'suspended') {
      const booleanValue = parseBoolean(value, row, field, errors);
      if (booleanValue !== undefined) card.suspended = booleanValue;
    } else if (STRING_FIELDS.has(field)) {
      if (field === 'cardType') {
        card.cardType = value || 'basic';
      } else if (field === 'title' || field === 'prompt' || field === 'answer') {
        card[field] = value ?? '';
      } else if (value !== undefined) {
        (card as unknown as Record<string, unknown>)[field] =
          NULLABLE_STRING_FIELDS.has(field) && value === '' ? null : value;
      }
    }
  }
  validateAndWarn(card, row, errors, warnings);
  return card;
}

interface CsvRecord {
  row: number;
  fields: string[];
  malformed?: string;
}

/** Parse RFC 4180-style CSV, including quoted CR/LF and doubled quotes. */
function parseCsvRecords(data: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let afterClosingQuote = false;
  let recordStartRow = 1;
  let physicalRow = 1;
  let hasContent = false;
  let malformed: string | undefined;

  const finishRecord = (): void => {
    fields.push(field);
    records.push({ row: recordStartRow, fields, malformed });
    fields = [];
    field = '';
    malformed = undefined;
    hasContent = false;
    recordStartRow = physicalRow + 1;
  };

  for (let index = 0; index < data.length; index += 1) {
    const character = data[index];
    const next = data[index + 1];
    hasContent = true;
    if (inQuotes) {
      if (character === '"') {
        if (next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterClosingQuote = true;
        }
      } else {
        field += character;
        if (character === '\n') physicalRow += 1;
        if (character === '\r' && next !== '\n') physicalRow += 1;
      }
      continue;
    }

    if (afterClosingQuote) {
      if (character !== ',' && character !== '\n' && character !== '\r' && character !== ' ' && character !== '\t') {
        malformed ??= 'quoted field 后出现未转义字符';
        field += character;
      } else if (character !== ' ' && character !== '\t') {
        afterClosingQuote = false;
      }
      if (character === ',' && !afterClosingQuote) {
        fields.push(field);
        field = '';
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && next === '\n') index += 1;
        finishRecord();
        if (character === '\n' || character === '\r') physicalRow += 1;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === ',') {
      fields.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && next === '\n') index += 1;
      finishRecord();
      physicalRow += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    malformed = 'CSV 引号未闭合';
  }
  if (hasContent || field.length > 0 || fields.length > 0 || inQuotes) {
    fields.push(field);
    records.push({ row: recordStartRow, fields, malformed });
  }
  return records;
}

function resolveColumn(headers: string[], requested: string | undefined): number | undefined {
  if (requested === undefined) return undefined;
  const byName = headers.indexOf(requested);
  if (byName >= 0) return byName;
  if (/^\d+$/.test(requested)) {
    const numeric = Number(requested);
    if (numeric >= 0 && numeric < headers.length) return numeric;
  }
  return undefined;
}

function parseCsv(data: string, mapping: Record<string, string> | undefined): TransferPreview {
  const records = parseCsvRecords(data);
  const errors: TransferError[] = [];
  const warnings: string[] = [];
  if (records.length === 0) {
    return { headers: [], rows: [], errors: [], warnings: [], validCount: 0 };
  }
  const headers = records[0].fields;
  if (records[0].malformed) addError(errors, records[0].row, records[0].malformed);

  const indexes: Partial<Record<TransferField, number>> = {};
  for (const field of TRANSFER_FIELDS) {
    const requested = mapping?.[field] ?? field;
    const index = resolveColumn(headers, requested);
    if (index !== undefined) indexes[field] = index;
    else if (mapping?.[field] !== undefined) {
      addError(errors, 1, `映射列不存在：${mapping[field]}`, field);
    }
  }
  for (const header of headers) {
    if (!TRANSFER_FIELDS.includes(header as TransferField) && !Object.values(mapping ?? {}).includes(header)) {
      addWarning(warnings, `CSV 列「${header}」没有对应规范字段；若内容重要，请提供 mapping`);
    }
  }

  const rows: TransferCard[] = [];
  for (const record of records.slice(1)) {
    const values: Record<string, string | undefined> = {};
    for (const field of TRANSFER_FIELDS) {
      const index = indexes[field];
      values[field] = index === undefined ? undefined : record.fields[index];
    }
    if (record.malformed) addError(errors, record.row, record.malformed);
    rows.push(cardFromCsvValues(values, record.row, errors, warnings));
  }
  const invalidRows = new Set(errors.map(error => error.row));
  return { headers, rows, errors, warnings, validCount: rows.filter((_, index) => !invalidRows.has(records[index + 1].row)).length };
}

function validateJsonCard(value: unknown, row: number, errors: TransferError[], warnings: string[]): TransferCard {
  if (!isRecord(value)) {
    addError(errors, row, '行必须是对象，未静默跳过');
    const blank = emptyCard();
    validateAndWarn(blank, row, errors, warnings);
    return blank;
  }
  const card = { ...value } as unknown as TransferCard;
  if (typeof value.title !== 'string') {
    addError(errors, row, '必填字段必须是字符串', 'title');
    card.title = typeof value.title === 'undefined' ? '' : String(value.title);
  }
  if (typeof value.prompt !== 'string') {
    addError(errors, row, '必填字段必须是字符串', 'prompt');
    card.prompt = typeof value.prompt === 'undefined' ? '' : String(value.prompt);
  }
  if (typeof value.answer !== 'string') {
    addError(errors, row, '必填字段必须是字符串', 'answer');
    card.answer = typeof value.answer === 'undefined' ? '' : String(value.answer);
  }
  if (typeof value.cardType === 'undefined') card.cardType = 'basic';
  else if (typeof value.cardType !== 'string') addError(errors, row, '必须是字符串', 'cardType');

  for (const field of STRING_FIELDS) {
    const fieldValue = value[field];
    if (typeof fieldValue !== 'undefined' && fieldValue !== null && typeof fieldValue !== 'string') {
      addError(errors, row, '必须是字符串或 null', field);
    }
  }
  for (const field of NUMBER_FIELDS) {
    const fieldValue = value[field];
    if (typeof fieldValue !== 'undefined' && (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue))) {
      addError(errors, row, '必须是有限数字', field);
    }
  }
  if (typeof value.suspended !== 'undefined' && typeof value.suspended !== 'boolean') {
    addError(errors, row, '必须是 boolean', 'suspended');
  }
  if (!Array.isArray(value.tags) || value.tags.some(item => typeof item !== 'string')) {
    if (typeof value.tags !== 'undefined') addError(errors, row, '必须是 JSON 字符串数组', 'tags');
    card.tags = [];
  }
  if (!Array.isArray(value.sentences) || value.sentences.some(item => typeof item !== 'string')) {
    if (typeof value.sentences !== 'undefined') addError(errors, row, '必须是 JSON 字符串数组', 'sentences');
    card.sentences = [];
  }
  if (!isRecord(value.slots) || Object.values(value.slots).some(item => typeof item !== 'string')) {
    if (typeof value.slots !== 'undefined') addError(errors, row, '必须是 JSON 字符串映射', 'slots');
    card.slots = {};
  }
  validateAndWarn(card, row, errors, warnings);
  return card;
}

function parseJson(data: string): TransferPreview {
  const errors: TransferError[] = [];
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { headers: [], rows: [], errors: [{ row: 1, message: '不是有效 JSON；没有静默跳过输入' }], warnings: [], validCount: 0 };
  }
  let values: unknown[];
  if (Array.isArray(parsed)) values = parsed;
  else if (isRecord(parsed) && Array.isArray(parsed.cards)) values = parsed.cards;
  else values = [parsed];
  const rows = values.map((value, index) => validateJsonCard(value, index + 1, errors, warnings));
  const invalidRows = new Set(errors.map(error => error.row));
  return {
    headers: TRANSFER_FIELDS.slice(),
    rows,
    errors,
    warnings,
    validCount: rows.filter((_, index) => !invalidRows.has(index + 1)).length,
  };
}

function parseMarkdown(data: string): TransferPreview {
  const errors: TransferError[] = [];
  const warnings: string[] = [];
  const rows: TransferCard[] = [];
  const rowNumbers: number[] = [];
  const marker = '<!-- study-card:metadata -->';
  const hasMarker = data.includes(marker);
  const fencePattern = hasMarker
    ? /<!-- study-card:metadata -->[ \t]*\r?\n(`{3,})json[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*(?=\n|$)/g
    : /(^|\n)(`{3,})json[ \t]*\r?\n([\s\S]*?)\r?\n\2[ \t]*(?=\n|$)/g;
  let match: RegExpExecArray | null;
  let row = 0;
  while ((match = fencePattern.exec(data)) !== null) {
    try {
      const payload = hasMarker ? match[2] : match[3];
      const parsed = JSON.parse(payload) as unknown;
      const cards = Array.isArray(parsed) ? parsed : [parsed];
      for (const card of cards) {
        row += 1;
        rowNumbers.push(row);
        rows.push(validateJsonCard(card, row, errors, warnings));
      }
    } catch {
      row += 1;
      addError(errors, row, 'lossless metadata fenced block 不是有效 JSON');
    }
  }
  if (rows.length === 0 && errors.length === 0) {
    addError(errors, 1, '缺少 lossless ```json metadata fenced block；人类问答文本不能替代完整字段');
  }
  const invalidRows = new Set(errors.map(error => error.row));
  return { headers: [], rows, errors, warnings, validCount: rows.filter((_, index) => !invalidRows.has(rowNumbers[index])).length };
}

function maxBacktickRun(value: string): number {
  return Math.max(0, ...(value.match(/`+/g) ?? []).map(run => run.length));
}

function csvCell(value: unknown, field: TransferField): string {
  if (value === undefined || value === null) return '';
  if (field === 'tags' || field === 'sentences' || field === 'slots') return JSON.stringify(value);
  return String(value);
}

function quoteCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function serializeCsv(cards: TransferCard[]): string {
  const header = TRANSFER_FIELDS.join(',');
  const lines = cards.map(card => TRANSFER_FIELDS.map(field => quoteCsv(csvCell(card[field], field))).join(','));
  return [header, ...lines].join('\r\n');
}

function serializeMarkdown(cards: TransferCard[]): string {
  return cards.map((card, index) => {
    const metadata = JSON.stringify(card, null, 2);
    const fence = '`'.repeat(Math.max(3, maxBacktickRun(metadata) + 1));
    return [
      `## Card ${index + 1}: ${card.title}`,
      '',
      '### Question',
      card.prompt,
      '',
      '### Answer',
      card.answer,
      '',
      '<!-- study-card:metadata -->',
      `${fence}json`,
      metadata,
      fence,
    ].join('\n');
  }).join('\n\n');
}

/** Parse an import without mutating input strings or silently dropping rows. */
export function parseStudyImport(
  data: string,
  format: StudyTransferFormat,
  mapping?: Record<string, string>,
): TransferPreview {
  switch (format) {
    case 'csv': return parseCsv(data, mapping);
    case 'markdown': return parseMarkdown(data);
    case 'json': return parseJson(data);
    default: throw new Error(`Unsupported study import format: ${String(format)}`);
  }
}

/** Serialize content exports only. Full backup schema is intentionally separate. */
export function serializeStudyCards(cards: TransferCard[], format: StudyTransferFormat): string {
  switch (format) {
    case 'csv': return serializeCsv(cards);
    case 'markdown': return serializeMarkdown(cards);
    case 'json': return JSON.stringify(cards, null, 2);
    default: throw new Error(`Unsupported study export format: ${String(format)}`);
  }
}

export { TRANSFER_FIELDS };
