import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// UI fixtures only, in a separate browser context. No real tokens or submissions.
const baseUrl = process.env.SILOGIUM_QA_URL || 'http://127.0.0.1:3000';
const directory = new URL('../test-results/profile-qa/', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
const dimensions = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.route('**/api/v1/tokens', (route) => route.request().method() === 'GET'
  ? route.fulfill({ json: { tokens: [] } }) : route.abort());
await page.route('**/api/v1/executions', (route) => route.request().method() === 'GET'
  ? route.fulfill({ json: { historyLimit: 100, executions: [
    { slug: 'rede-de-armarios', title: 'Rede de armários de encomendas', runtime: 'typescript', kind: 'submission', verdict: 'accepted', score: 600 },
    { slug: 'reservas-de-coworking', title: 'Reservas de coworking', runtime: 'python', kind: 'run', verdict: 'wrong_answer', score: 300 },
    { slug: 'rede-de-armarios', title: 'Rede de armários de encomendas', runtime: 'typescript', kind: 'run', verdict: 'accepted', score: 150 }
  ].map((item, index) => ({
    createdAt: `2026-09-0${9 - index}T15:30:00Z`,
    request: { problemId: item.slug, problemVersion: 1, kind: item.kind, runtime: item.runtime },
    problem: { id: item.slug, version: 1, title: item.title, slug: item.slug },
    result: { id: `preview-${index}`, verdict: item.verdict, score: item.score, maxScore: 600, durationMs: 14, cases: [] }
  })) } }) : route.abort());

try {
  for (const [width, height] of [[1440, 1000], [1024, 900], [768, 900], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    const response = await page.goto(`${baseUrl}/perfil`);
    if (!response?.ok()) throw new Error(`/perfil: HTTP ${response?.status()}`);
    await page.locator('.profile-stats').waitFor();
    await page.getByText('Nenhum token criado', { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    dimensions.push({ width, ...await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth })) });
    await page.screenshot({ path: fileURLToPath(new URL(`profile-${width}.png`, directory)), fullPage: true, caret: 'initial' });
  }
  console.log(JSON.stringify({ dimensions, errors }, null, 2));
  if (errors.length || dimensions.some((item) => item.content > item.viewport + 1)) process.exitCode = 1;
} finally {
  await browser.close();
}
