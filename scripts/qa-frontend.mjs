import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Read-only layout inspection. No AI requests or judge submissions are made.
const directory = new URL('../test-results/frontend-qa/', import.meta.url);
await mkdir(directory, { recursive: true });
const baseUrl = process.env.SILOGIUM_QA_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const report = [];
for (const [width, height] of [[1440, 900], [1024, 768], [800, 600], [390, 844], [320, 568]]) {
  await page.setViewportSize({ width, height });
  for (const [name, path] of [['catalog', '/explorar'], ['activity', '/explorar?view=activity'], ['studio', '/studio?mode=create'], ['mine', '/studio?section=mine'], ['workspace', '/problemas/rede-de-armarios']]) {
    const response = await page.goto(`${baseUrl}${path}`);
    if (!response?.ok()) throw new Error(`${path}: HTTP ${response?.status()}`);
    await page.locator('main').waitFor();
    if (name === 'catalog') await page.getByText('Carregando seu progresso…', { exact: true }).waitFor({ state: 'hidden' });
    if (name === 'mine') await page.getByText('Carregando suas questões…', { exact: true }).waitFor({ state: 'hidden' });
    if (name === 'workspace') {
      await page.getByRole('button', { name: 'Nível 4, 150 pontos', exact: true }).click();
      if (width <= 800) await page.getByRole('button', { name: 'Código', exact: true }).click();
      await page.locator('.monaco-editor').first().waitFor({ timeout: 30_000 });
      await page.waitForTimeout(250); // Monaco measures again after leaving a hidden mobile tab.
    }
    report.push({ name, width, height, ...await page.evaluate(() => {
      const footer = document.querySelector('.editor-actions')?.getBoundingClientRect();
      return { scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, footerBottom: footer?.bottom, viewportHeight: innerHeight };
    }) });
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-${width}.png`, directory)), fullPage: true, caret: 'initial' });
  }
}
const fixtureResponse = await page.request.get(`${baseUrl}/api/v1/problems/rede-de-armarios`);
const { visibleCases } = await fixtureResponse.json();
await page.route('**/api/v1/executions', async (route) => {
  if (route.request().method() !== 'POST') return route.continue();
  return route.fulfill({ json: { id: 'visual-only', verdict: 'wrong_answer', score: 0, maxScore: 150, durationMs: 18, cases: [{
    id: visibleCases[0].id, name: visibleCases[0].name, stage: 1, passed: false,
    mismatch: { method: 'listarAbertos', expected: [{ id: 2, prioridade: 4 }, { id: 1, prioridade: 2 }], actual: [{ id: 1, prioridade: 2 }, { id: 2, prioridade: 4 }] }
  }] } });
});
for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/problemas/rede-de-armarios`);
  await page.getByRole('button', { name: 'Executar', exact: true }).click();
  await page.locator('.value-diff').waitFor();
  await page.screenshot({ path: fileURLToPath(new URL(`result-${width}.png`, directory)), fullPage: true, caret: 'initial' });
  await page.getByRole('button', { name: 'Usar como teste próprio', exact: true }).click();
  await page.screenshot({ path: fileURLToPath(new URL(`custom-${width}.png`, directory)), fullPage: true, caret: 'initial' });
  await page.getByRole('button', { name: 'Resolver no terminal', exact: true }).click();
  await page.screenshot({ path: fileURLToPath(new URL(`terminal-${width}.png`, directory)), fullPage: true, caret: 'initial' });
  await page.keyboard.press('Escape');
}
console.log(JSON.stringify({ report, errors }, null, 2));
await browser.close();
