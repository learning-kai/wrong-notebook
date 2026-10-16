import { test as base, expect, type BrowserContext, type Page, type APIResponse } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { getBinaryTargetForCurrentPlatform } from '@prisma/get-platform';
import { hash } from 'bcryptjs';
import { encode } from 'next-auth/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import type { CardDTO, StudySettingsDTO } from '../src/lib/study-contract';

// Self-contained isolated suite: never read .env or DATABASE_URL, and never
// persist tokens, passwords, storageState or network traces.
export { expect };
export type { CardDTO, StudySettingsDTO };
export const BASE_URL = process.env.MEMORY_E2E_BASE_URL || 'http://127.0.0.1:3100';
export const CONTENT_FIELDS = [
  'title', 'cardType', 'prompt', 'answer', 'formula', 'roc', 'conditions',
  'precautions', 'steps', 'initialConditions', 'finalConditions', 'explanation',
  'pitfalls', 'comparison', 'chinese', 'english', 'letterType',
  'paragraphPosition', 'sentenceFunction', 'clozeText', 'source', 'notes',
  'sentences', 'slots', 'tags',
] as const;
export type Content = Pick<CardDTO, typeof CONTENT_FIELDS[number]>;
export type Course = { id: string; name: string; examYear: number | null; chapters: { id: string; name: string }[] };
export type Detail = CardDTO & { reviews: Review[] };
export type Review = { id: string; cardId?: string; clientEventId: string | null; rating: string; mode: string; responseText: string | null; nextDueAt: string | null; reviewedAt: string; [key: string]: unknown };
export type Preview = { errors: unknown[]; rows: Record<string, unknown>[]; validCount: number; duplicates: number; headers: string[] };
export type Backup = { schemaVersion: number; settings: StudySettingsDTO; courses: Record<string, unknown>[]; chapters: Record<string, unknown>[]; cards: CardDTO[]; reviews: Review[] };
type Identity = { id: string; email: string; name: string | null };
export type Actor = { user: Identity; context: BrowserContext; page: Page };
export type Lab = { a: Actor; b: Actor; db: PrismaClient; switchUser: (context: BrowserContext, user: Identity) => Promise<void> };

function inside(root: string, child: string) {
  const rel = relative(root, child);
  return !!rel && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

export function temporaryDatabaseURL() {
  const value = process.env.MEMORY_E2E_DATABASE_URL;
  if (!value || !value.startsWith('file:/') || /[?#]/.test(value)) {
    throw new Error('Set MEMORY_E2E_DATABASE_URL=file:/absolute/temp-directory/test.db (already migrated)');
  }
  const filename = value.slice('file:'.length);
  if (!isAbsolute(filename) || !existsSync(filename)) throw new Error('The migrated temporary DB must already exist');
  const actual = realpathSync(filename);
  // GitHub Actions keeps its scratch space in RUNNER_TEMP, which is not under
  // /tmp. Accept every designated temp root while still rejecting anything
  // outside a temp directory or inside the repository.
  const roots = [...new Set([tmpdir(), '/tmp', process.env.RUNNER_TEMP, process.env.TMPDIR])]
    .filter((root): root is string => Boolean(root) && existsSync(root as string))
    .map(root => realpathSync(root));
  if (!roots.some(root => inside(root, actual as string)) || inside(realpathSync(process.cwd()), actual)
      || !statSync(actual).isFile() || actual === join(dirname(actual), 'dev.db')) {
    throw new Error('Refusing DB outside a temporary directory, inside the repository, or named dev.db');
  }
  // Resolve symlinks before connecting; never inherit the application's DB URL.
  return `file:${actual as string}`;
}

async function authenticatedCookie(context: BrowserContext, user: Identity) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('NEXTAUTH_SECRET must be a caller-provided random secret of at least 32 bytes');
  // Test-only JWT fixture, validated by the real session endpoint and normal
  // study auth. This does NOT test CredentialsProvider or the login form.
  await context.clearCookies();
  await context.addCookies([{
    name: 'next-auth.session-token',
    value: await encode({ secret, maxAge: 3600, token: { sub: user.id, id: user.id, email: user.email, name: user.name, role: 'user' } }),
    url: BASE_URL,
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }]);
  // Never log, attach, save storageState or assert on cookie/token values.
  const session = await context.request.get('/api/auth/session');
  expect(session.status(), 'normal NextAuth session must accept the fixture').toBe(200);
  const body = await session.json() as { user?: { id?: string; email?: string } };
  expect(body.user?.id).toBe(user.id);
  expect(body.user?.email).toBe(user.email);
  const settings = await api<StudySettingsDTO>(context, '/settings');
  expect(settings.userId, 'server must use the SAME mounted temporary DB').toBe(user.id);
}

export const test = base.extend<{ lab: Lab }, { temporaryDB: PrismaClient }>({
  temporaryDB: [async ({}, provide) => {
    const url = temporaryDatabaseURL();
    const platform = await getBinaryTargetForCurrentPlatform();
    const clientDir = dirname(require.resolve('.prisma/client/package.json'));
    const library = join(clientDir, `libquery_engine-${platform}.so.node`);
    if (platform.includes('musl') || !existsSync(library)) {
      throw new Error('Generate host-native Prisma client before E2E; never use the container musl engine on the host');
    }
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = library;
    const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
    try {
      // A clean migrated DB is mandatory; no "delete all" reset is performed.
      const counts = await Promise.all([db.user.count(), db.studyCourse.count(), db.memoryCard.count(), db.memoryReview.count()]);
      if (counts.some(count => count !== 0)) throw new Error('Refusing non-empty DB: use a fresh temporary migrated database, not an owner database');
      await provide(db);
      expect(await db.user.count(), 'all temporary users must be cleaned up').toBe(0);
      expect(await db.memoryCard.count()).toBe(0);
      expect(await db.memoryReview.count()).toBe(0);
    } finally { await db.$disconnect(); }
  }, { scope: 'worker' }],
  lab: async ({ browser, temporaryDB }, provide) => {
    const users: Identity[] = [];
    const contexts: BrowserContext[] = [];
    const pageErrors: string[] = [];
    const resource404s: string[] = [];
    try {
      for (const label of ['A', 'B']) {
        // Random plaintext exists only for this hash expression, then is
        // discarded. Only bcrypt hashes are persisted in the temporary DB.
        users.push(await temporaryDB.user.create({ data: {
          id: `memory-e2e-${randomUUID()}`,
          email: `memory-e2e-${randomUUID()}@example.invalid`,
          name: `Memory E2E ${label}`,
          password: await hash(randomBytes(48).toString('base64url'), 10),
          isActive: true,
          role: 'user',
        }, select: { id: true, email: true, name: true } }));
      }
      for (const user of users) {
        const context = await browser.newContext({
          baseURL: BASE_URL, viewport: { width: 1440, height: 1000 },
          timezoneId: 'Asia/Shanghai', locale: 'zh-CN',
          serviceWorkers: 'allow', acceptDownloads: true,
        });
        context.setDefaultTimeout(15_000);
        context.setDefaultNavigationTimeout(30_000);
        contexts.push(context);
        context.on('page', page => page.on('pageerror', error => pageErrors.push(`${new URL(page.url() || BASE_URL, BASE_URL).pathname}: ${error.message}`)));
        context.on('response', response => {
          const url = new URL(response.url());
          const kind = response.request().resourceType();
          if (url.origin === BASE_URL && response.status() === 404 && !url.pathname.startsWith('/api/')
              && ['document', 'script', 'stylesheet', 'font', 'image', 'other'].includes(kind)) {
            resource404s.push(`${kind} ${url.pathname}`);
          }
        });
        await authenticatedCookie(context, user);
      }
      const a = { user: users[0], context: contexts[0], page: await contexts[0].newPage() };
      const b = { user: users[1], context: contexts[1], page: await contexts[1].newPage() };
      await provide({ a, b, db: temporaryDB, switchUser: authenticatedCookie });
    } finally {
      await Promise.all(contexts.map(context => context.close()));
      // Only IDs created by this fixture are ever deleted. Cascade removes
      // their courses/cards/reviews; no production identifiers are read.
      for (const user of users) {
        await temporaryDB.user.deleteMany({ where: { id: user.id, email: user.email } });
        expect(await temporaryDB.memoryCard.count({ where: { userId: user.id } })).toBe(0);
        expect(await temporaryDB.memoryReview.count({ where: { userId: user.id } })).toBe(0);
      }
      expect(pageErrors, 'captured pageerrors (including reopened/offline pages)').toEqual([]);
      expect(resource404s, 'same-origin static/document resource 404s').toEqual([]);
    }
  },
});

export async function api<T>(context: BrowserContext, path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await context.request.fetch(`/api/study${path}`, { method, data });
  expect(response.ok(), `${method} /api/study${path}: ${response.status()}`).toBeTruthy();
  return await response.json() as T;
}
export async function allCards(context: BrowserContext) { return api<CardDTO[]>(context, '/cards?limit=500'); }
export async function detail(context: BrowserContext, id: string) { return api<Detail>(context, `/cards/${id}`); }
export async function openStudy(page: Page) {
  const response = await page.goto('/study');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: '记忆训练', exact: true })).toBeVisible();
  await ready(page);
  // Review is the default tab and owns the course scope selector.
  await expect(page.getByTestId('course-select')).toBeEnabled();
}
/** App loaded identity/connection, regardless of which tab is active. */
export async function ready(page: Page) {
  await expect(page.getByTestId('study-connectivity')).toContainText('在线');
  // Wait until the workspace finished loading: the tab nav is present and no
  // tab shows the loading placeholder. This is the cache/sync synchronization
  // point the old course-select readiness used to provide.
  await expect(page.getByTestId('study-tab-review')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '正在载入' })).toHaveCount(0);
}
export async function tab(page: Page, name: string) {
  await page.getByTestId(`study-tab-${name}`).click();
  await expect(page.getByTestId(`study-tab-${name}`)).toHaveAttribute('aria-current', 'true');
}
/** Card-management sub-tabs: 卡片 / 课程与章节 / 导入 / 完整备份. */
export async function cardsTab(page: Page, label: string) {
  const id = { '卡片': 'manage', '课程与章节': 'courses', '导入 / 导出': 'import', '完整备份': 'backup' }[label];
  if (!id) throw new Error(`Unknown cards sub-tab: ${label}`);
  await page.getByTestId(`cards-sub-${id}`).click();
  await expect(page.getByTestId(`cards-sub-${id}`)).toHaveAttribute('aria-current', 'true');
}
export async function noOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(metrics.document, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.body, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.viewport + 1);
}
export async function uiWrite<T>(page: Page, path: string, method: string, action: () => Promise<unknown>): Promise<T> {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/study${path}` && response.request().method() === method);
  await action();
  const response = await pending;
  expect(response.ok(), `UI ${method} ${path}: ${response.status()}`).toBeTruthy();
  return await response.json() as T;
}
export async function downloadText(page: Page, linkName: string) {
  const event = page.waitForEvent('download');
  await page.getByRole('link', { name: linkName, exact: true }).click();
  const download = await event;
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download stream unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  await download.delete();
  return text;
}
export function content(card: Record<string, unknown> | Content | CardDTO): Content {
  return Object.fromEntries(CONTENT_FIELDS.map(key => [key, card[key as keyof typeof card]])) as Content;
}
export function fullContent(title: string): Content {
  return {
    title, cardType: 'formula',
    prompt: String.raw`写出变换，解释 $\nu$，并填写 {{keyword}}。`,
    answer: '第一行，含逗号和 "双引号"\n第二行：' + String.raw`$$\nu + x$$`,
    formula: String.raw`$$\nu + \frac{1}{s+1}$$`, roc: '$$\\operatorname{Re}(s)>-1$$',
    conditions: '线性、时不变\n零初始状态', precautions: '检查 ROC 与边界',
    steps: '1. 建模\n2. 求变换\n3. 核对条件', initialConditions: '初值存在且无冲激', finalConditions: '所有极点位于左半平面',
    explanation: '解释原文\n```text\n不要改写\\nu\n```', pitfalls: '不要把 \\nu 变成换行 + u',
    comparison: '频率变量与序号不同', chinese: '我写信讨论 {{keyword}}。',
    english: 'I am writing about {{keyword}}.\nThank you for your time.',
    letterType: 'formal', paragraphPosition: 'opening', sentenceFunction: 'purpose',
    clozeText: '变量为 {{c1::\\nu}}，主题为 {{c2::signal}}。', source: 'E2E 自建夹具（非权威示例）',
    notes: '保留首尾\n以及 "引号" 和 ``` 围栏',
    sentences: ['First, define the signal.', 'Next, compute the transform.', 'Finally, check the ROC.'],
    slots: { keyword: 'signal processing', audience: 'students' }, tags: ['E2E', '信号,英语', 'quoted "tag"'],
  };
}
export async function seed(actor: Actor, count = 3, prefix = 'Task') {
  const course = await api<Course>(actor.context, '/courses', 'POST', { name: `${prefix} fixture`, examYear: 2030 });
  const chapter = await api<{ id: string }>(actor.context, `/courses/${course.id}/chapters`, 'POST', { name: `${prefix} chapter` });
  const cards: CardDTO[] = [];
  for (let i = 0; i < count; i++) cards.push(await api<CardDTO>(actor.context, '/cards', 'POST', {
    ...fullContent(`${prefix} ${i + 1}`), courseId: course.id, chapterId: chapter.id,
    suspended: false, dueAt: `2020-01-01T00:0${i}:00.000Z`,
  }));
  return { course, chapter, cards };
}
export async function previewImport(page: Page): Promise<Preview> {
  return uiWrite<Preview>(page, '/import', 'POST', () => page.getByTestId('study-import-preview').click());
}
export async function confirmImport(page: Page) {
  await expect(page.getByTestId('study-import-commit')).toBeDisabled();
  await page.getByTestId('study-import-confirm').check();
  const value = await uiWrite<{ imported: number; skipped: number }>(page, '/import', 'POST', () => page.getByTestId('study-import-commit').click());
  await ready(page);
  return value;
}
export async function localValue<T>(page: Page, key: string): Promise<T | undefined> {
  return page.evaluate(key => new Promise<T | undefined>((resolve, reject) => {
    const open = indexedDB.open('study-memory-v1', 1);
    open.onerror = () => reject(new Error('Cannot read real IndexedDB'));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('memory', 'readonly');
      const request = tx.objectStore('memory').get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(new Error('IndexedDB get failed'));
      tx.oncomplete = () => db.close();
    };
  }), key);
}
export type Outbox = { event: { cardId: string; clientEventId: string; responseText: string; rating: string; [key: string]: unknown }; conflict?: string }[];
export const localKey = (userId: string, kind: string) => `study:${encodeURIComponent(userId)}:${kind}`;
export async function dbCounts(db: PrismaClient, userId: string) {
  return {
    courses: await db.studyCourse.count({ where: { userId } }),
    chapters: await db.studyChapter.count({ where: { course: { userId } } }),
    cards: await db.memoryCard.count({ where: { userId } }),
    reviews: await db.memoryReview.count({ where: { userId } }),
  };
}
export async function rejected(response: APIResponse) { expect([403, 404]).toContain(response.status()); }

async function dialogs(page: Page, replies: string[], action: () => Promise<unknown>) {
  const remaining = [...replies];
  const handler = async (dialog: import('@playwright/test').Dialog) => {
    if (!remaining.length) { await dialog.dismiss(); throw new Error('Unexpected extra UI dialog'); }
    await dialog.accept(remaining.shift());
  };
  page.on('dialog', handler);
  try { await action(); expect(remaining, 'all expected dialogs must actually occur').toEqual([]); }
  finally { page.off('dialog', handler); }
}
async function createUICard(page: Page, fields: Content, courseId: string, chapterId: string, ordinal: number) {
  await page.getByTestId('card-new').click();
  await page.getByTestId('card-course').selectOption(courseId);
  await page.getByTestId('card-chapter').selectOption(chapterId);
  // Card type is a subject-aware <select>; pick it if offered, else rely on the
  // subject default. Content fields not shown by the subject profile are only
  // filled when present, so the helper stays valid for any course subject.
  const typeSelect = page.getByTestId('card-type');
  const options = await typeSelect.locator('option').evaluateAll(list => list.map(o => (o as HTMLOptionElement).value));
  if (options.includes(fields.cardType)) await typeSelect.selectOption(fields.cardType);
  for (const key of CONTENT_FIELDS.filter(key => !['cardType', 'tags', 'sentences', 'slots'].includes(key))) {
    const field = page.getByTestId(`card-${key}`);
    if (await field.count()) await field.fill(String(fields[key] ?? ''));
  }
  for (const key of ['tags', 'sentences', 'slots'] as const) await page.getByTestId(`card-${key}`).fill(JSON.stringify(fields[key]));
  await page.getByTestId('card-dueAt').fill(`2020-01-01T00:0${ordinal}`);
  const card = await uiWrite<CardDTO>(page, '/cards', 'POST', () => page.getByTestId('card-save').click());
  await expect(page.getByTestId('card-save')).toHaveCount(0);
  return card;
}
async function assertRated(context: BrowserContext, ids: string[], answers: string[]) {
  for (let i = 0; i < ids.length; i++) {
    await expect.poll(async () => (await detail(context, ids[i])).reviews.length).toBe(1);
    const saved = await detail(context, ids[i]);
    expect(saved.reviews[0]).toMatchObject({ rating: 'good', mode: 'recall', responseText: answers[i] });
    expect(saved.reviews[0].clientEventId).toBeTruthy();
    expect(saved.lastReviewedAt).not.toBeNull();
    expect(saved.repetitions).toBe(1);
    expect(saved.dueAt).toBe(saved.reviews[0].nextDueAt);
    expect(saved.intervalDays).toBeGreaterThan(0);
  }
}

test.describe.configure({ mode: 'serial' });

test('desktop/mobile UI CRUD, all fields, stable three-card review, refreshed history and real stats', async ({ lab }) => {
  const { a, db } = lab;
  const page = a.page;
  await openStudy(page);
  expect(await allCards(a.context), 'opening study must not insert samples').toEqual([]);
  await noOverflow(page);
  await tab(page, 'cards');
  await cardsTab(page, '课程与章节');
  await page.getByTestId('course-name').fill('UI signal course');
  await page.getByLabel('考试年份（可选）', { exact: true }).fill('2030');
  const course = await uiWrite<Course>(page, '/courses', 'POST', () => page.getByTestId('course-create').click());
  await expect(page.getByTestId('course-name')).toHaveValue('');
  await page.getByTestId(`course-tile-${course.id}`).click();
  await page.getByLabel('新章节名称', { exact: true }).fill('UI initial chapter');
  const chapter = await uiWrite<{ id: string }>(page, `/courses/${course.id}/chapters`, 'POST', () => page.getByRole('button', { name: '新建章节', exact: true }).click());
  await expect(page.getByLabel('新章节名称', { exact: true })).toHaveValue('');
  // Keep this course on the general template (blank subject) so the "all fields"
  // assertions below still exercise every field.
  await dialogs(page, ['UI signal course edited', '2031', ''], async () => {
    await uiWrite(page, `/courses/${course.id}`, 'PATCH', () => page.getByTestId('course-edit').click());
  });
  await expect(page.getByRole('heading', { name: 'UI signal course edited', exact: true })).toBeVisible();
  await dialogs(page, ['UI edited chapter'], async () => {
    await uiWrite(page, `/chapters/${chapter.id}`, 'PATCH', () => page.getByRole('button', { name: '编辑章节', exact: true }).click());
  });
  await expect(page.getByTestId(`chapter-delete-${chapter.id}`)).toBeVisible();
  const courses = await api<Course[]>(a.context, '/courses');
  expect(courses.find(c => c.id === course.id)).toMatchObject({ name: 'UI signal course edited', examYear: 2031, chapters: [{ id: chapter.id, name: 'UI edited chapter' }] });
  await cardsTab(page, '卡片');
  const cards: CardDTO[] = [];
  for (let i = 0; i < 3; i++) {
    const fields = fullContent(`UI card ${i + 1}`);
    const card = await createUICard(page, fields, course.id, chapter.id, i);
    cards.push(card);
    const saved = await detail(a.context, card.id);
    expect(content(saved)).toEqual(fields);
    expect(saved).toMatchObject({ userId: a.user.id, courseId: course.id, chapterId: chapter.id, suspended: false });
    expect(saved.formula).toBe(String.raw`$$\nu + \frac{1}{s+1}$$`);
  }
  const article = page.locator('.study-card-grid article').filter({ has: page.getByRole('heading', { name: cards[0].title, exact: true }) });
  await article.getByRole('button', { name: '编辑 / 到期', exact: true }).click();
  const editedNotes = 'UI edited notes\n' + String.raw`\nu stays exact`;
  await page.getByTestId('card-notes').fill(editedNotes);
  await uiWrite(page, `/cards/${cards[0].id}`, 'PATCH', () => page.getByTestId('card-save').click());
  await expect(page.getByTestId('card-save')).toHaveCount(0);
  cards[0] = await detail(a.context, cards[0].id);
  expect(cards[0].notes).toBe(editedNotes);
  const copy = await uiWrite<CardDTO>(page, `/cards/${cards[0].id}/copy`, 'POST', () => page.getByTestId(`card-copy-${cards[0].id}`).click());
  await expect(page.getByTestId(`card-suspend-${copy.id}`)).toBeVisible();
  await uiWrite(page, `/cards/${copy.id}`, 'PATCH', () => page.getByTestId(`card-suspend-${copy.id}`).click());
  await expect(page.getByTestId(`card-suspend-${copy.id}`)).toHaveText('恢复复习');
  expect((await detail(a.context, copy.id)).suspended).toBe(true);
  await uiWrite(page, `/cards/${copy.id}`, 'PATCH', () => page.getByTestId(`card-suspend-${copy.id}`).click());
  await expect(page.getByTestId(`card-suspend-${copy.id}`)).toHaveText('暂停');
  expect((await detail(a.context, copy.id)).suspended).toBe(false);
  const copyArticle = page.locator('.study-card-grid article').filter({ has: page.getByTestId(`card-copy-${copy.id}`) });
  await dialogs(page, [''], async () => { await uiWrite(page, `/cards/${copy.id}`, 'DELETE', () => copyArticle.getByRole('button', { name: '删除', exact: true }).click()); });
  await expect(page.getByTestId(`card-copy-${copy.id}`)).toHaveCount(0);
  expect(await db.memoryCard.count({ where: { id: copy.id } })).toBe(0);
  expect(await allCards(a.context)).toHaveLength(3);
  await noOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await tab(page, 'review');
  await page.getByTestId('study-queue-all').click();
  const queue = await api<CardDTO[]>(a.context, `/review?mode=all&courseId=${course.id}&chapterId=${chapter.id}`);
  expect(queue.map(c => c.id)).toEqual(cards.map(c => c.id));
  const answers = cards.map((_, i) => `UI independently recalled ${i + 1}\n${String.raw`\nu`}`);
  for (let i = 0; i < cards.length; i++) {
    await expect(page.locator('.study-review-card h3')).toHaveText(cards[i].title);
    await expect(page.getByTestId('study-answer-input')).toHaveValue('');
    await expect(page.getByTestId('study-review-reveal')).toBeVisible();
    await page.getByTestId('study-answer-input').fill(answers[i]);
    await page.getByTestId('study-review-reveal').click();
    await expect(page.locator('.study-answer-columns .katex').first()).toBeVisible();
    await noOverflow(page);
    await uiWrite(page, '/review', 'POST', () => page.getByTestId('study-review-submit-good').click());
    if (i < 2) await expect(page.locator('.study-review-card h3')).toHaveText(cards[i + 1].title);
  }
  await expect(page.getByRole('heading', { name: '本轮完成', exact: true })).toBeVisible();
  await assertRated(a.context, cards.map(c => c.id), answers);
  expect(await db.memoryReview.count({ where: { userId: a.user.id } })).toBe(3);
  await page.reload();
  await ready(page);
  await tab(page, 'cards');
  await cardsTab(page, '卡片');
  await page.getByTestId(`card-history-${cards[0].id}`).click();
  await expect(page.getByRole('heading', { name: `${cards[0].title} · 详情与复习历史`, exact: true })).toBeVisible();
  await expect(page.locator('table tbody tr')).toHaveCount(1);
  await expect(page.locator('table tbody tr')).toContainText(answers[0]);
  await expect(page.locator('table tbody tr')).toContainText('good');
  const stats = await api<{ total: number; reviewsToday: number; todayNewUsed: number; daily: { reviews: number }[] }>(a.context, '/stats');
  expect(stats).toMatchObject({ total: 3, reviewsToday: 3, todayNewUsed: 3 });
  expect(stats.daily.reduce((total, point) => total + point.reviews, 0)).toBe(3);
  await tab(page, 'stats');
  await expect(page.getByRole('img', { name: '每日复习量曲线', exact: true })).toBeVisible();
  await expect(page.locator('article').filter({ has: page.getByText('今日完成', { exact: true }) }).locator('strong')).toHaveText('3');
  await page.getByRole('button', { name: '按周查看', exact: true }).click();
  await expect(page.getByRole('button', { name: '按日查看', exact: true })).toBeVisible();
  await noOverflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await tab(page, 'cards');
  await cardsTab(page, '课程与章节');
  await page.getByTestId(`course-tile-${course.id}`).click();
  await dialogs(page, [''], async () => { await uiWrite(page, `/chapters/${chapter.id}`, 'DELETE', () => page.getByTestId(`chapter-delete-${chapter.id}`).click()); });
  await expect(page.getByTestId(`chapter-delete-${chapter.id}`)).toHaveCount(0);
  expect((await detail(a.context, cards[0].id)).chapterId).toBeNull();
  expect(await allCards(a.context)).toHaveLength(3);
  await dialogs(page, [''], async () => { await uiWrite(page, `/courses/${course.id}`, 'DELETE', () => page.getByRole('button', { name: '删除课程', exact: true }).click()); });
  await tab(page, 'review');
  await expect(page.getByTestId('course-select').locator(`option[value="${course.id}"]`)).toHaveCount(0);
  expect(await allCards(a.context)).toEqual([]);
  expect(await db.memoryReview.count({ where: { userId: a.user.id } })).toBe(0);
});

test('UI malformed/quoted multiline CSV mapping, confirmation, dedupe, three exact content roundtrips, cross-user backup and ownership', async ({ lab }) => {
  const { a, b, db } = lab;
  const course = await api<Course>(a.context, '/courses', 'POST', { name: 'Transfer fixture', examYear: 2030 });
  await openStudy(a.page);
  await a.page.getByTestId('course-select').selectOption(course.id);
  await tab(a.page, 'cards');
  await cardsTab(a.page, '导入 / 导出');
  const initial = await dbCounts(db, a.user.id);
  await a.page.getByTestId('study-import-format').selectOption('csv');
  await a.page.getByTestId('study-import-data').fill('title,prompt,answer\n"Unclosed,question,answer');
  const malformed = await previewImport(a.page);
  expect(malformed.errors.length).toBeGreaterThan(0);
  await expect(a.page.getByTestId('study-import-commit')).toBeDisabled();
  await expect(a.page.getByTestId('study-import-confirm')).toBeDisabled();
  const reject = await a.context.request.post('/api/study/import', { data: {
    action: 'commit', format: 'csv', data: 'title,prompt,answer\n"Unclosed,question,answer',
    courseId: course.id, skipDuplicates: true, mapping: {},
  } });
  expect(reject.status()).toBe(400);
  expect(await dbCounts(db, a.user.id)).toEqual(initial);
  const importedContent = [fullContent('Quoted "signal", one'), fullContent('Multiline two')];
  const headers = CONTENT_FIELDS.map(key => key === 'title' ? '标题原文' : key === 'prompt' ? '题面原文' : key === 'answer' ? '答案原文' : key);
  const quote = (value: unknown) => '"' + String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll('"', '""') + '"';
  const row = (fields: Content) => CONTENT_FIELDS.map(key => quote(fields[key])).join(',');
  const csv = headers.join(',') + '\r\n' + [row(importedContent[0]), row(importedContent[0]), row(importedContent[1])].join('\r\n');
  await a.page.getByTestId('study-import-data').fill(csv);
  const unmapped = await previewImport(a.page);
  expect(unmapped.errors.length).toBeGreaterThan(0);
  expect(await dbCounts(db, a.user.id)).toEqual(initial);
  for (const [key, header] of [['title', '标题原文'], ['prompt', '题面原文'], ['answer', '答案原文']]) {
    await a.page.getByTestId(`study-mapping-${key}`).selectOption(header);
  }
  await expect(a.page.getByTestId('study-import-commit')).toBeDisabled();
  const mapped = await previewImport(a.page);
  expect(mapped.errors).toEqual([]);
  expect(mapped.validCount).toBe(2);
  expect(mapped.duplicates).toBe(1);
  expect(mapped.rows.map(content)).toEqual([importedContent[0], importedContent[0], importedContent[1]]);
  expect(await dbCounts(db, a.user.id)).toEqual(initial);
  // Changing the source invalidates confirmation even when it parses the same.
  await a.page.getByTestId('study-import-confirm').check();
  await expect(a.page.getByTestId('study-import-commit')).toBeEnabled();
  await a.page.getByTestId('study-import-data').fill(csv + '\r\n');
  await expect(a.page.getByTestId('study-import-commit')).toBeDisabled();
  expect((await previewImport(a.page)).errors).toEqual([]);
  expect(await confirmImport(a.page)).toEqual({ imported: 2, skipped: 1 });
  const firstCards = await allCards(a.context);
  expect(firstCards.map(content).sort((x, y) => x.title.localeCompare(y.title))).toEqual([...importedContent].sort((x, y) => x.title.localeCompare(y.title)));
  const duplicatePreview = await previewImport(a.page);
  expect(duplicatePreview).toMatchObject({ errors: [], validCount: 0, duplicates: 3 });
  await a.page.getByTestId('study-import-confirm').check();
  await expect(a.page.getByTestId('study-import-commit')).toBeDisabled();
  const duplicates = await api<{ imported: number; skipped: number }>(a.context, '/import', 'POST', {
    action: 'commit', format: 'csv', data: csv, courseId: course.id,
    mapping: { title: '标题原文', prompt: '题面原文', answer: '答案原文' }, skipDuplicates: true,
  });
  expect(duplicates).toEqual({ imported: 0, skipped: 3 });
  expect(await allCards(a.context)).toHaveLength(2);
  // UI downloads are consumed only in memory; no backup/auth artifact is saved.
  const exported = {
    json: await downloadText(a.page, '导出 JSON'),
    csv: await downloadText(a.page, '导出 CSV'),
    markdown: await downloadText(a.page, '导出 Markdown'),
  };
  const exportedJSON = JSON.parse(exported.json) as Record<string, unknown>[];
  expect(exportedJSON.map(content).sort((x, y) => x.title.localeCompare(y.title))).toEqual([...importedContent].sort((x, y) => x.title.localeCompare(y.title)));
  for (const format of ['csv', 'markdown', 'json'] as const) {
    for (const card of await allCards(a.context)) await api(a.context, `/cards/${card.id}`, 'DELETE');
    expect(await allCards(a.context)).toEqual([]);
    await a.page.getByTestId('study-import-format').selectOption(format);
    await a.page.getByTestId('study-import-data').fill(exported[format]);
    const preview = await previewImport(a.page);
    expect(preview.errors, `${format} preview`).toEqual([]);
    expect(preview.validCount).toBe(2);
    expect(preview.rows.map(content).sort((x, y) => x.title.localeCompare(y.title))).toEqual([...importedContent].sort((x, y) => x.title.localeCompare(y.title)));
    expect(await confirmImport(a.page)).toEqual({ imported: 2, skipped: 0 });
    const restored = await allCards(a.context);
    expect(restored.map(content).sort((x, y) => x.title.localeCompare(y.title))).toEqual([...importedContent].sort((x, y) => x.title.localeCompare(y.title)));
    expect(restored.every(c => c.userId === a.user.id && c.courseId === course.id)).toBe(true);
    expect(restored.every(c => !firstCards.some(old => old.id === c.id))).toBe(true);
  }
  const cards = await allCards(a.context);
  const chapter = await api<{ id: string }>(a.context, `/courses/${course.id}/chapters`, 'POST', { name: 'Backup remap chapter' });
  await api(a.context, `/cards/${cards[0].id}`, 'PATCH', { chapterId: chapter.id });
  await api(a.context, '/settings', 'PATCH', { dailyNewLimit: 17, dailyReviewLimit: 43, theme: 'dark', examDate: '2030-12-20', timezone: 'UTC' });
  await api(a.context, '/review', 'POST', {
    cardId: cards[0].id, rating: 'good', mode: 'recall', responseText: 'Roundtrip review\n' + String.raw`\nu`, responseMs: 1234,
    clientEventId: randomUUID(), reviewedAt: new Date().toISOString(),
  });
  await tab(a.page, 'cards');
  await cardsTab(a.page, '完整备份');
  const backupText = await downloadText(a.page, '下载完整备份 JSON');
  const backup = JSON.parse(backupText) as Backup;
  expect(backup.schemaVersion).toBe(1);
  expect(backup.cards).toHaveLength(2);
  expect(backup.reviews).toHaveLength(1);
  expect(backup.settings.userId).toBe(a.user.id);
  expect(backupText).not.toMatch(/"(?:password|sessionToken|accessToken|refreshToken)"\s*:/);
  await openStudy(b.page);
  await tab(b.page, 'cards');
  await cardsTab(b.page, '完整备份');
  await b.page.getByTestId('backup-data').fill(backupText);
  await expect(b.page.getByTestId('backup-restore')).toBeDisabled();
  // Snapshot after the default course tree is initialized; preview must not change data.
  const beforeB = await dbCounts(db, b.user.id);
  const restorePreview = await uiWrite<{ errors: unknown[]; counts: { cards: number; reviews: number } }>(b.page, '/backup', 'POST', () => b.page.getByTestId('backup-preview').click());
  expect(restorePreview.errors).toEqual([]);
  expect(restorePreview.counts).toMatchObject({ cards: 2, reviews: 1 });
  expect(await dbCounts(db, b.user.id)).toEqual(beforeB);
  await b.page.getByTestId('backup-confirm').check();
  const result = await uiWrite<{ imported: number; reviews: number; skipped: number }>(b.page, '/backup', 'POST', () => b.page.getByTestId('backup-restore').click());
  expect(result).toMatchObject({ imported: 2, reviews: 1, skipped: 0 });
  await ready(b.page);
  const backupB = await api<Backup>(b.context, '/backup');
  expect(backupB.settings).toMatchObject({ userId: b.user.id, dailyNewLimit: 17, dailyReviewLimit: 43, theme: 'dark', examDate: backup.settings.examDate, timezone: 'UTC' });
  expect(backupB.cards).toHaveLength(2);
  expect(backupB.reviews).toHaveLength(1);
  for (const old of backup.cards) {
    const restored = backupB.cards.find(c => c.title === old.title)!;
    expect(content(restored)).toEqual(content(old));
    expect(restored.userId).toBe(b.user.id);
    expect(restored.id).not.toBe(old.id);
    expect(restored.courseId).not.toBe(old.courseId);
    expect(restored.course.name).toBe(old.course.name);
    if (old.chapterId) {
      expect(restored.chapterId).not.toBe(old.chapterId);
      expect(restored.chapter?.name).toBe(old.chapter?.name);
    }
    for (const key of ['dueAt', 'lastReviewedAt', 'intervalDays', 'easeFactor', 'repetitions', 'lapses', 'suspended'] as const) expect(restored[key]).toEqual(old[key]);
  }
  const reviewedB = backupB.cards.find(c => c.title === backup.cards.find(c => c.id === backup.reviews[0].cardId)!.title)!;
  expect(backupB.reviews[0]).toMatchObject({ cardId: reviewedB.id, rating: backup.reviews[0].rating, mode: backup.reviews[0].mode, responseText: backup.reviews[0].responseText, clientEventId: backup.reviews[0].clientEventId, nextDueAt: backup.reviews[0].nextDueAt });
  expect(backupB.reviews[0].id).not.toBe(backup.reviews[0].id);
  await b.page.getByTestId('backup-preview').click();
  await expect(b.page.getByTestId('backup-confirm')).toBeVisible();
  await b.page.getByTestId('backup-confirm').check();
  const repeated = await uiWrite<{ imported: number; reviews: number; skipped: number }>(b.page, '/backup', 'POST', () => b.page.getByTestId('backup-restore').click());
  expect(repeated).toMatchObject({ imported: 0, reviews: 0, skipped: 2 });
  expect((await api<Backup>(b.context, '/backup')).reviews).toHaveLength(1);
  // Exercise the real authorization boundary, not just a hidden UI button.
  const beforeA = await detail(a.context, cards[0].id);
  await rejected(await b.context.request.get(`/api/study/cards/${cards[0].id}`));
  await rejected(await b.context.request.patch(`/api/study/cards/${cards[0].id}`, { data: { notes: 'unauthorized mutation' } }));
  await rejected(await b.context.request.post('/api/study/review', { data: { cardId: cards[0].id, rating: 'again', mode: 'recall', clientEventId: randomUUID() } }));
  await rejected(await b.context.request.patch(`/api/study/courses/${course.id}`, { data: { name: 'stolen' } }));
  await rejected(await b.context.request.patch(`/api/study/chapters/${chapter.id}`, { data: { name: 'stolen' } }));
  expect(await api<CardDTO[]>(b.context, `/cards?courseId=${course.id}`)).toEqual([]);
  expect(await api<CardDTO[]>(b.context, `/review?mode=all&courseId=${course.id}`)).toEqual([]);
  expect(await detail(a.context, cards[0].id)).toEqual(beforeA);
  expect(await db.memoryReview.count({ where: { userId: b.user.id } })).toBe(1);
});

test('UI quota/theme/exam settings, all 18 real training modes, three stable ratings and explicit-only samples', async ({ lab }) => {
  const { a, db } = lab;
  const seeded = await seed(a, 3, 'Modes');
  const page = a.page;
  await openStudy(page);
  expect(await allCards(a.context)).toHaveLength(3);
  await page.getByTestId('course-select').selectOption(seeded.course.id);
  await page.getByTestId('chapter-select').selectOption(seeded.chapter.id);
  await tab(page, 'settings');
  await page.getByTestId('settings-daily-new').fill('0');
  await page.getByTestId('settings-dailyReviewLimit').fill('0');
  await uiWrite(page, '/settings', 'PATCH', () => page.getByTestId('settings-save').click());
  await expect(page.getByRole('status').filter({ hasText: '设置已保存' })).toBeVisible();
  await ready(page);
  expect(await api<CardDTO[]>(a.context, `/review?mode=due&courseId=${seeded.course.id}`)).toEqual([]);
  expect(await api<CardDTO[]>(a.context, `/review?mode=all&courseId=${seeded.course.id}`)).toHaveLength(3);
  await page.getByTestId('settings-daily-new').fill('3');
  await page.getByTestId('settings-dailyReviewLimit').fill('5');
  await page.getByTestId('settings-examDate').fill('2030-12-20');
  await page.getByTestId('settings-timezone').selectOption('UTC');
  await page.getByTestId('settings-theme').selectOption('dark');
  await uiWrite(page, '/settings', 'PATCH', () => page.getByTestId('settings-save').click());
  await ready(page);
  const settings = await api<StudySettingsDTO>(a.context, '/settings');
  expect(settings).toMatchObject({ userId: a.user.id, dailyNewLimit: 3, dailyReviewLimit: 5, theme: 'dark', timezone: 'UTC' });
  expect(settings.examDate?.slice(0, 10)).toBe('2030-12-20');
  await expect(page.locator('main')).toHaveClass(/study-theme-dark/);
  await page.reload();
  await ready(page);
  await tab(page, 'settings');
  await expect(page.getByTestId('settings-daily-new')).toHaveValue('3');
  await expect(page.getByTestId('settings-dailyReviewLimit')).toHaveValue('5');
  await expect(page.getByTestId('settings-examDate')).toHaveValue('2030-12-20');
  await expect(page.getByTestId('settings-theme')).toHaveValue('dark');
  await tab(page, 'review');
  await page.getByTestId('course-select').selectOption(seeded.course.id);
  await page.getByTestId('chapter-select').selectOption(seeded.chapter.id);
  await page.getByTestId('study-queue-all').click();
  const taskModes = ['recall', 'zh-en', 'en-zh', 'formula', 'cloze', 'formula-cloze',
    'condition-conclusion', 'conclusion-condition', 'compare', 'steps', 'paragraph',
    'sentence-order', 'sentence-compose', 'template-match', 'transform', 'inverse-transform', 'roc', 'initial-final'];
  expect(await page.getByTestId('study-task-mode').locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))).toEqual(taskModes);
  for (const mode of taskModes) {
    await page.getByTestId('study-task-mode').selectOption(mode);
    await expect(page.locator('.study-review-card h3')).toHaveText(seeded.cards[0].title);
    await expect(page.getByTestId('study-review-reveal')).toBeVisible();
    await expect(page.getByTestId('study-review-reveal')).toBeEnabled();
    if (mode === 'sentence-order') {
      await page.getByRole('button', { name: '句子 3 上移', exact: true }).click();
      await page.getByRole('button', { name: '句子 2 上移', exact: true }).click();
      await page.getByRole('button', { name: '句子 3 上移', exact: true }).click();
      await expect(page.getByTestId('study-answer-input')).toHaveValue(seeded.cards[0].sentences.join('\n'));
    } else if (mode === 'sentence-compose') {
      const choices = page.getByRole('group', { name: '按组合顺序选择句子', exact: true }).getByRole('checkbox');
      await expect(choices).toHaveCount(3);
      for (let i = 0; i < 3; i++) await choices.nth(i).check();
      await expect(page.getByTestId('study-answer-input')).toHaveValue(seeded.cards[0].sentences.join(' '));
    } else if (mode === 'template-match') {
      await page.getByRole('group', { name: '显式关键词槽位（仅替换本次任务，不修改卡片）', exact: true }).getByLabel('keyword', { exact: true }).fill('renewable energy');
      await expect(page.locator('.study-review-card')).toContainText('renewable energy');
      const expectedPairs = ['signal processing', 'students', 'formal', 'opening', 'purpose'];
      await expect(page.getByTestId('study-match-choice')).toHaveCount(expectedPairs.length);
      for (let i = 0; i < expectedPairs.length; i++) await page.getByTestId('study-match-choice').nth(i).selectOption(expectedPairs[i]);
      expect(await page.getByTestId('study-answer-input').inputValue()).toContain('keyword: signal processing');
    } else {
      await page.getByTestId('study-answer-input').fill(`Independent ${mode} response`);
    }
    await page.getByTestId('study-review-reveal').click();
    await expect(page.getByRole('heading', { name: '参考答案', exact: true })).toBeVisible();
    await expect(page.getByTestId('study-review-submit-good')).toBeEnabled();
    expect(await page.locator('.study-answer-columns section').last().innerText()).not.toBe('参考答案');
    if (mode === 'roc') {
      await expect(page.locator('.study-answer-columns section').last().locator('.katex')).toBeVisible();
      await expect(page.locator('.study-answer-columns section').last().locator('annotation')).toHaveText(String.raw`\operatorname{Re}(s)>-1`);
    }
    // Merely changing task/revealing must not write a review or mutate metadata.
    expect(await db.memoryReview.count({ where: { userId: a.user.id } })).toBe(0);
  }
  expect((await detail(a.context, seeded.cards[0].id)).slots).toEqual(seeded.cards[0].slots);
  await page.getByTestId('study-task-mode').selectOption('recall');
  const answers = seeded.cards.map((_, i) => `Mode stable rating ${i + 1}`);
  for (let i = 0; i < 3; i++) {
    await expect(page.locator('.study-review-card h3')).toHaveText(seeded.cards[i].title);
    await expect(page.getByTestId('study-answer-input')).toHaveValue('');
    await expect(page.getByTestId('study-review-reveal')).toBeVisible();
    await page.getByTestId('study-answer-input').fill(answers[i]);
    await page.getByTestId('study-review-reveal').click();
    await uiWrite(page, '/review', 'POST', () => page.getByTestId('study-review-submit-good').click());
  }
  await expect(page.getByRole('heading', { name: '本轮完成', exact: true })).toBeVisible();
  await assertRated(a.context, seeded.cards.map(c => c.id), answers);
  const minimalCourse = await api<Course>(a.context, '/courses', 'POST', { name: 'Unavailable mode' });
  await api(a.context, '/cards', 'POST', { courseId: minimalCourse.id, title: 'No invented formula', prompt: 'Real question', answer: 'Real answer' });
  // A course created out-of-band appears after a real page refresh; the queue
  // button only re-fetches the current scope.
  await page.reload();
  await ready(page);
  await page.getByTestId('course-select').selectOption(minimalCourse.id);
  // Reload resets the queue choice; the new card also exceeds today's new-card
  // quota, so select the 全部 queue explicitly.
  await page.getByTestId('study-queue-all').click();
  await expect(page.locator('.study-review-card h3')).toHaveText('No invented formula');
  await page.getByTestId('study-task-mode').selectOption('formula');
  await expect(page.getByTestId('study-review-reveal')).toBeDisabled();
  await expect(page.locator('.study-review-card')).toContainText('模式不可用：缺少formula');
  const beforeSamples = await allCards(a.context);
  const beforeSampleCount = beforeSamples.length;
  await tab(page, 'cards');
  await cardsTab(page, '导入 / 导出');
  const samplePanel = page.locator('section.study-panel').filter({ has: page.getByRole('heading', { name: '可选的小量示例', exact: true }) });
  const examples = await api<{ examples: { id: string; title: string }[] }>(a.context, '/samples');
  expect(examples.examples.length).toBeGreaterThan(0);
  await expect(samplePanel.locator('details')).toHaveCount(examples.examples.length);
  await expect(page.getByTestId('study-sample-import')).toBeDisabled();
  expect((await allCards(a.context)).map(c => c.id)).toEqual(beforeSamples.map(c => c.id));
  const first = samplePanel.locator('details').first();
  await first.locator('summary').click();
  await first.getByRole('checkbox', { name: '选择此示例', exact: true }).check();
  const imported = await uiWrite<{ imported: number; skipped: number }>(page, '/samples', 'POST', () => page.getByTestId('study-sample-import').click());
  expect(imported).toEqual({ imported: 1, skipped: 0 });
  await ready(page);
  const afterSamples = await allCards(a.context);
  expect(afterSamples).toHaveLength(beforeSampleCount + 1);
  const added = afterSamples.filter(c => !beforeSamples.some(old => old.id === c.id));
  expect(added.map(c => c.title)).toEqual([examples.examples[0].title]);
  expect(added[0].source).toBeTruthy();
  expect(await db.memoryReview.count({ where: { userId: a.user.id } })).toBe(3);
});

async function shellReady(page: Page) {
  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const cache = await caches.open('study-basic-shell-v1');
    const shell = await cache.match('/study/offline');
    if (!registration?.active || !navigator.serviceWorker.controller || !shell?.ok) return false;
    const html = await shell.text();
    const assets = new Set<string>();
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const url = new URL(match[1], location.origin);
      if (url.origin === location.origin && url.pathname.startsWith('/_next/static/')) assets.add(url.href);
    }
    if (![...assets].some(url => url.includes('.js')) || ![...assets].some(url => url.includes('.css'))) return false;
    for (const url of assets) {
      const response = await cache.match(url);
      if (!response?.ok) return false;
      if (new URL(url).pathname.endsWith('.css')) {
        for (const match of (await response.text()).matchAll(/url\(\s*["']?([^\)"']+)["']?\s*\)/g)) {
          const font = new URL(match[1], url);
          if (font.origin === location.origin && font.pathname.startsWith('/_next/static/') && !(await cache.match(font.href))?.ok) return false;
        }
      }
    }
    const requests = await cache.keys();
    return requests.every(request => {
      const path = new URL(request.url).pathname;
      return path === '/study/offline' || path.startsWith('/_next/static/');
    });
  }), { timeout: 30_000, message: 'real SW must cache its HTML, JS, CSS and referenced fonts before offline navigation' }).toBe(true);
}
async function offlinePage(context: BrowserContext, title: string) {
  const page = await context.newPage();
  const response = await page.goto('/study/offline');
  expect(response?.status(), 'new navigation must be served by the real SW').toBe(200);
  await expect(page.getByRole('heading', { name: '离线基础复习', exact: true })).toBeVisible();
  await expect(page.locator('.study-review-card h2')).toHaveText(title);
  await expect(page.getByTestId('study-connectivity')).toContainText('离线');
  await expect(page.locator('.study-review-card .katex').first()).toBeVisible();
  await noOverflow(page);
  return page;
}

test('real SW/KaTeX offline navigation, closed-page IndexedDB persistence, once-only sync, logout and two-user cache partition', async ({ lab }) => {
  const { a, b, db, switchUser } = lab;
  const { cards } = await seed(a, 3, 'Offline A');
  const { cards: cardsB } = await seed(b, 1, 'Offline B');
  const script = await a.context.request.get('/study-sw.js');
  expect(script.status()).toBe(200);
  expect(script.headers()['content-type']).toMatch(/javascript/);
  await openStudy(a.page);
  await shellReady(a.page);
  await expect.poll(async () => {
    const snapshot = await localValue<{ cards: CardDTO[]; settings: StudySettingsDTO }>(a.page, localKey(a.user.id, 'snapshot'));
    return snapshot?.cards.map(c => c.id);
  }).toEqual(cards.map(c => c.id));
  expect(await localValue<string>(a.page, localKey('_runtime', 'active-user'))).toBe(a.user.id);
  const cachedShell = await a.page.evaluate(async () => (await (await caches.open('study-basic-shell-v1')).match('/study/offline'))!.text());
  expect(cachedShell).not.toContain(cards[0].title);
  expect(cachedShell).not.toContain(a.user.id);
  // Count actual browser POSTs; never record headers/cookies/trace/storageState.
  const sent: { cardId: string; clientEventId: string }[] = [];
  a.context.on('request', request => {
    if (new URL(request.url()).pathname === '/api/study/review' && request.method() === 'POST') {
      const event = request.postDataJSON() as { cardId: string; clientEventId: string };
      sent.push({ cardId: event.cardId, clientEventId: event.clientEventId });
    }
  });
  await a.context.setOffline(true);
  await a.page.close();
  let page = await offlinePage(a.context, cards[0].title);
  await page.getByTestId('study-answer-input').fill('Offline persisted answer\n' + String.raw`\nu`);
  await page.getByTestId('study-review-reveal').click();
  await expect(page.locator('.study-answer-columns section').last().locator('.katex')).toBeVisible();
  await page.getByTestId('study-review-submit-good').click();
  await expect(page.locator('.study-review-card h2')).toHaveText(cards[1].title);
  await expect(page.getByTestId('study-connectivity')).toContainText('1 条待同步');
  const pending = await localValue<Outbox>(page, localKey(a.user.id, 'outbox'));
  expect(pending).toHaveLength(1);
  const originalEvent = pending![0].event;
  expect(originalEvent).toMatchObject({ cardId: cards[0].id, rating: 'good', responseText: 'Offline persisted answer\n' + String.raw`\nu` });
  expect(originalEvent.clientEventId).toBeTruthy();
  expect(await db.memoryReview.count({ where: { userId: a.user.id } })).toBe(0);
  expect(sent).toEqual([]);
  await page.close();
  page = await offlinePage(a.context, cards[1].title);
  expect(await localValue<Outbox>(page, localKey(a.user.id, 'outbox'))).toEqual(pending);
  await expect(page.getByTestId('study-answer-input')).toHaveValue('');
  await expect(page.getByTestId('study-review-reveal')).toBeVisible();
  await a.context.setOffline(false);
  await expect.poll(async () => (await detail(a.context, cards[0].id)).reviews.length).toBe(1);
  await expect(page.getByTestId('study-connectivity')).toHaveText('在线 · 0 条待同步');
  expect(await localValue<Outbox>(page, localKey(a.user.id, 'outbox'))).toEqual([]);
  expect(sent).toEqual([{ cardId: cards[0].id, clientEventId: originalEvent.clientEventId }]);
  const savedOnce = await detail(a.context, cards[0].id);
  expect(savedOnce.reviews[0]).toMatchObject({ clientEventId: originalEvent.clientEventId, responseText: originalEvent.responseText, rating: 'good', mode: 'recall' });
  expect(savedOnce.repetitions).toBe(1);
  await page.getByRole('button', { name: '重试同步', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试同步', exact: true })).toBeEnabled();
  expect(sent).toHaveLength(1);
  expect(await detail(a.context, cards[0].id)).toEqual(savedOnce);
  // A second unsynced event must survive account changes and actual signout.
  await a.context.setOffline(true);
  await page.getByTestId('study-answer-input').fill('A event must never be posted as B');
  await page.getByTestId('study-review-reveal').click();
  await page.getByTestId('study-review-submit-good').click();
  await expect(page.locator('.study-review-card h2')).toHaveText(cards[2].title);
  const heldA = await localValue<Outbox>(page, localKey(a.user.id, 'outbox'));
  expect(heldA).toHaveLength(1);
  // Closing avoids a stale in-memory actor resuming before B's normal identity
  // validation. APIRequestContext is intentionally online; browser stays offline.
  await page.close();
  await a.context.setOffline(false);
  await switchUser(a.context, b.user);
  page = await a.context.newPage();
  await page.goto('/study/offline');
  await expect(page.locator('p.study-error')).toContainText('账号已切换');
  await expect(page.locator('.study-review-card')).toHaveCount(0);
  expect(sent).toHaveLength(1);
  expect(await localValue<Outbox>(page, localKey(a.user.id, 'outbox'))).toEqual(heldA);
  expect(await localValue(page, localKey(a.user.id, 'snapshot'))).toBeUndefined();
  await openStudy(page);
  await shellReady(page);
  await expect.poll(async () => (await localValue<{ cards: CardDTO[] }>(page, localKey(b.user.id, 'snapshot')))?.cards.map(c => c.id)).toEqual(cardsB.map(c => c.id));
  const snapshotB = await localValue<{ cards: CardDTO[] }>(page, localKey(b.user.id, 'snapshot'));
  expect(snapshotB?.cards.map(c => c.id)).toEqual(cardsB.map(c => c.id));
  expect(snapshotB?.cards.every(c => c.userId === b.user.id)).toBe(true);
  await a.context.setOffline(true);
  await page.close();
  page = await offlinePage(a.context, cardsB[0].title);
  await expect(page.locator('body')).not.toContainText(cards[2].title);
  expect(await localValue<Outbox>(page, localKey(a.user.id, 'outbox'))).toEqual(heldA);
  // Real NextAuth signout + CSRF through browser fetch (not request context), so
  // the production service worker observes it. CSRF never leaves page memory.
  await a.context.setOffline(false);
  await expect(page.getByTestId('study-connectivity')).toContainText('在线');
  const logoutStatus = await page.evaluate(async () => {
    const csrfResponse = await fetch('/api/auth/csrf');
    if (!csrfResponse.ok) throw new Error('CSRF endpoint failed');
    const csrf = await csrfResponse.json() as { csrfToken: string };
    const response = await fetch('/api/auth/signout', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: '/login', json: 'true' }),
    });
    return response.status;
  });
  expect(logoutStatus).toBe(200);
  await expect(page.locator('p.study-error')).toContainText('已退出登录');
  await expect(page.locator('.study-review-card')).toHaveCount(0);
  expect(await localValue(page, localKey('_runtime', 'active-user'))).toBeUndefined();
  expect(await localValue(page, localKey(b.user.id, 'snapshot'))).toBeUndefined();
  expect(await localValue<Outbox>(page, localKey(a.user.id, 'outbox'))).toEqual(heldA);
  const loggedOutSession = await a.context.request.get('/api/auth/session');
  expect(loggedOutSession.status()).toBe(200);
  expect((await loggedOutSession.json() as { user?: unknown }).user).toBeUndefined();
  expect((await a.context.request.get('/api/study/settings')).status()).toBe(401);
  await a.context.setOffline(true);
  await page.close();
  page = await a.context.newPage();
  expect((await page.goto('/study/offline'))?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: '尚未初始化离线缓存', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(cardsB[0].title);
  await expect(page.locator('body')).not.toContainText(cards[2].title);
  expect(await localValue<Outbox>(page, localKey(a.user.id, 'outbox'))).toEqual(heldA);
  expect(sent).toHaveLength(1);
  expect(await db.memoryReview.count({ where: { userId: b.user.id } })).toBe(0);
  // Original account can still recover its retained event, exactly once.
  await page.close();
  await a.context.setOffline(false);
  await switchUser(a.context, a.user);
  page = await a.context.newPage();
  await openStudy(page);
  await expect.poll(async () => (await detail(a.context, cards[1].id)).reviews.length).toBe(1);
  await expect.poll(async () => await localValue<Outbox>(page, localKey(a.user.id, 'outbox'))).toEqual([]);
  expect(sent).toEqual([
    { cardId: cards[0].id, clientEventId: originalEvent.clientEventId },
    { cardId: cards[1].id, clientEventId: heldA![0].event.clientEventId },
  ]);
  expect(await db.memoryReview.count({ where: { userId: a.user.id } })).toBe(2);
  expect(await db.memoryReview.count({ where: { userId: b.user.id } })).toBe(0);
});
