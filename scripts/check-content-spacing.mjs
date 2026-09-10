import { chromium, expect } from '@playwright/test';

// Read-only regression probe: responses are mocked in an isolated browser context.
// Never sends an authoring request, import, publication or judge submission.
const baseUrl = process.env.SILOGIUM_QA_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch();
const page = await browser.newPage();
const measurements = [];
let job;
await page.route('**/api/v1/jobs/spacing-probe', (route) => route.fulfill({ json: job }));
await page.route('**/api/v1/problems/mine', (route) => route.fulfill({ json: { problems: [] } }));
await page.route('**/api/v1/authoring', (route) => route.abort());
await page.route('**/api/v1/executions', (route) => route.request().method() === 'GET' ? route.fulfill({ json: { executions: [], historyLimit: 100 } }) : route.abort());
await page.addInitScript(() => {
  if (location.search.includes('section=mine')) localStorage.removeItem('silogium:studio:job:local-demo');
  else localStorage.setItem('silogium:studio:job:local-demo', JSON.stringify({ id: 'spacing-probe', mode: 'create', startedAt: Date.now() }));
});

async function gap(name, first, second, minimum) {
  await page.locator(first).waitFor();
  await page.locator(second).waitFor();
  await page.evaluate(() => document.fonts.ready);
  // Read both bounds in the same frame; Fast Refresh may replace either node.
  let distance;
  await expect.poll(async () => {
    distance = await page.evaluate(({ first, second }) => {
      const before = document.querySelector(first);
      const after = document.querySelector(second);
      if (!before?.getClientRects().length || !after?.getClientRects().length) return null;
      return after.getBoundingClientRect().top - before.getBoundingClientRect().bottom;
    }, { first, second });
    return distance;
  }).not.toBeNull();
  const actual = Math.round(distance * 100) / 100;
  measurements.push({ width: page.viewportSize().width, name, minimum, actual, pass: actual >= minimum - 1 });
}

try {
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/explorar`);
    await page.getByRole('button', { name: 'Confortável', exact: true }).click();
    await gap('Resumo → tags no catálogo', '.problem-row:first-of-type .problem-summary', '.problem-row:first-of-type .problem-tags', 8);
    if (width <= 800) {
      await gap('Filtros de coleção → primeiro card', '.catalog-sidebar', '.problem-row:nth-of-type(1)', 16);
      await gap('Cards do catálogo mobile', '.problem-row:nth-of-type(1)', '.problem-row:nth-of-type(2)', 12);
    }
    job = { status: 'completed' };
    await page.goto(`${baseUrl}/studio?section=mine`);
    await gap('Cabeçalho → biblioteca vazia', '.studio-header', '.studio-library > .empty', 20);

    job = { status: 'completed', result: { kind: 'create', package: {
      problem: { id: 'spacing-probe', title: 'Uma questão para praticar', slug: 'spacing-probe', summary: 'Interprete os requisitos e resolva a questão em TypeScript.', status: 'validated', visibility: 'private', provenance: { kind: 'native', createdBy: 'local-demo', createdByHandle: 'demo', assistedByAi: true } },
      validation: { valid: true, checks: [{ name: 'Testes de referência', passed: true }] }
    } } };
    await page.goto(`${baseUrl}/studio?mode=create`);
    await gap('Verificações → ações do card', '.created-result details', '.created-result .studio-inline-actions', 16);
    await gap('Status → título da questão', '.created-result-status', '.created-result h2', 12);

    job = { status: 'completed', result: { kind: 'search', candidates: [1, 2].map((id) => ({
      id: String(id), kind: 'catalog', title: `Questão ${id}`, summary: 'Uma descrição do desafio, com contexto suficiente para escolher o que praticar.', url: '/problemas/rede-de-armarios', sourceName: 'Silogium', runtime: 'typescript', importable: false
    })) } };
    await page.goto(`${baseUrl}/studio`);
    await gap('Cards dos resultados de pesquisa', '.search-result:nth-of-type(1)', '.search-result:nth-of-type(2)', 12);
  }
  console.log(JSON.stringify({ measurements, failures: measurements.filter((item) => !item.pass) }, null, 2));
  if (measurements.some((item) => !item.pass)) process.exitCode = 1;
} finally {
  await browser.close();
}
