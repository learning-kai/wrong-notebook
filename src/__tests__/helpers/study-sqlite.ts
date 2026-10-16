import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Real isolated SQLite schema; never uses DATABASE_URL or the application DB. */
export function createStudySqlite() {
  const directory = mkdtempSync(join(process.env.TMPDIR ?? '/home/admin/.hermes/cache/scratch', 'study-review-'));
  const path = join(directory, 'test.db');
  const sql = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: `file:${path}` } });
  execFileSync('python3', ['-c', 'import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); db.executescript(sys.stdin.read()); db.close()', path], { input: sql });
  const url = `file:${path}?connection_limit=1`;
  const db = new PrismaClient({ datasources: { db: { url } } });
  return {
    db,
    connect: () => new PrismaClient({ datasources: { db: { url } } }),
    async close() { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); },
  };
}

export async function seedStudy(db: PrismaClient) {
  await db.user.deleteMany();
  await db.user.create({ data: { id: 'user-a', email: 'a@example.test', password: 'unused-test-fixture' } });
  await db.user.create({ data: { id: 'user-b', email: 'b@example.test', password: 'unused-test-fixture' } });
  await db.studySettings.create({ data: { userId: 'user-a', defaultsInitialized: true } });
  await db.studyCourse.create({ data: { id: 'course-a', userId: 'user-a', name: 'Course', createdAt: new Date('2026-01-01T00:00:00Z') } });
  await db.memoryCard.create({ data: { id: 'card-a', userId: 'user-a', courseId: 'course-a', title: 'Title', prompt: 'Prompt', answer: 'Answer', createdAt: new Date('2026-01-01T00:00:00Z'), dueAt: new Date('2026-01-01T00:00:00Z') } });
}

export function postRequest(path: string, body: unknown) {
  return new Request(`http://test.local/api/study/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
