import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
const failures = [];
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/studio?mode=create', '/explorar', '/explorar?view=activity', '/problemas/rede-de-armarios']) {
      await page.goto(`http://localhost:3000${path}`);
      await page.locator('main').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const clipped = await page.locator('select:visible').evaluateAll((selects) => selects.flatMap((select) => {
        const style = getComputedStyle(select);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const options = Array.from(select.options).map((option) => ({ text: option.text, width: context.measureText(option.text).width }));
        const longest = options.sort((left, right) => right.width - left.width)[0];
        const available = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - (style.appearance === 'none' ? 0 : 18);
        return longest.width > available + 1 ? [{ label: select.id || select.getAttribute('aria-label') || longest.text, text: longest.text, needs: Math.ceil(longest.width), available: Math.floor(available) }] : [];
      }));
      failures.push(...clipped.map((item) => ({ width, path, ...item })));
    }
  }
  console.log(JSON.stringify({ failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
