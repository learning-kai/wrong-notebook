import { defineConfig } from '@playwright/test';

// The caller owns migrations, the Linux image and PORT=3100. No webServer,
// build, login shortcut, saved auth state, HAR, trace or credential artifacts.
const baseURL = process.env.MEMORY_E2E_BASE_URL || 'http://127.0.0.1:3100';
const target = new URL(baseURL);
if (target.origin !== 'http://127.0.0.1:3100' || target.pathname !== '/' || target.search || target.hash) {
  throw new Error('Memory E2E is restricted to http://127.0.0.1:3100');
}

export default defineConfig({
  testDir: './e2e-memory',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: process.env.TMPDIR
    ? `${process.env.TMPDIR}/wrong-notebook-memory-playwright`
    : '/tmp/wrong-notebook-memory-playwright',
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Asia/Shanghai',
    locale: 'zh-CN',
    serviceWorkers: 'allow',
    acceptDownloads: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    storageState: undefined,
  },
});
