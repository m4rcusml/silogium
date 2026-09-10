import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// Read-only visual inspection of the isolated E2E server. No submissions or AI.
const base = process.env.SILOGIUM_QA_URL ?? "http://127.0.0.1:3100";
const destination = resolve("test-results/completion-qa");
await mkdir(destination, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const failures = [];
page.on("pageerror", (error) => failures.push({ javascript: error.message }));
try {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 400 ? 1000 : 844 });
    for (const [name, path] of [["biblioteca", "/explorar"], ["perfil", "/perfil"], ["resolucao", "/problemas/rede-de-armarios"]]) {
      await page.goto(`${base}${path}`);
      await page.getByRole("main").waitFor();
      if (name === "biblioteca") await page.getByText("Sua biblioteca e simulados", { exact: true }).click();
      if (name === "resolucao") await page.getByRole("button", { name: "Dicas e comunidade", exact: true }).click();
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
      if (overflow.scroll > overflow.viewport) failures.push({ name, width, ...overflow });
      await page.screenshot({ path: resolve(destination, `${name}-${width}.png`), fullPage: true });
    }
  }
  console.log(JSON.stringify({ destination, failures }));
} finally { await browser.close(); }
