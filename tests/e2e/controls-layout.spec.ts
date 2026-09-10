import { expect, test, type Page, type Response } from "@playwright/test";

const viewports = [320, 390, 768, 1024, 1440];
const scenarios = [
  { path: "/studio?mode=create", selectCount: 4 },
  { path: "/explorar", selectCount: 4 },
  { path: "/explorar?view=activity", selectCount: 2 },
  { path: "/problemas/rede-de-armarios", selectCount: 2 }
];

async function expectManrope(page: Page) {
  const font = await page.evaluate(async () => {
    const faces = await document.fonts.load('14px "Manrope Variable"', "Linguagem TypeScript Não listada");
    await document.fonts.ready;
    return {
      loaded: faces.length > 0 && faces.every((face) => face.status === "loaded" && face.family.replace(/["']/g, "") === "Manrope Variable"),
      available: document.fonts.check('14px "Manrope Variable"'),
      bodyFamily: getComputedStyle(document.body).fontFamily.split(",")[0]?.trim().replace(/["']/g, "")
    };
  });
  expect(font).toEqual({ loaded: true, available: true, bodyFamily: "Manrope Variable" });
}

async function expectHeaderNavigation(page: Page) {
  const navigation = page.getByRole("navigation", { name: "Navegação principal", exact: true });
  await expect(navigation.getByRole("link", { name: /Silogium/ })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Abrir perfil", exact: true })).toBeVisible();
  for (const name of ["Praticar", "Studio"]) {
    const link = navigation.getByRole("link", { name, exact: true });
    await expect(link).toBeVisible();
    await link.focus();
    await expect(link).toBeFocused();
    const label = await link.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        fontSize: parseFloat(style.fontSize),
        width: text.width,
        height: text.height,
        fits: text.left >= bounds.left - 1 && text.right <= bounds.right + 1
          && text.top >= bounds.top - 1 && text.bottom <= bounds.bottom + 1
          && text.left >= 0 && text.right <= document.documentElement.clientWidth + 1
      };
    });
    expect(label.fontSize, `${name}: tamanho visível do texto`).toBeGreaterThan(0);
    expect(label.width, `${name}: largura visível do texto`).toBeGreaterThan(0);
    expect(label.height, `${name}: altura visível do texto`).toBeGreaterThan(0);
    expect(label.fits, `${name}: texto completo dentro do link e da tela`).toBe(true);
  }
}

async function expectSelectLabelsToFit(page: Page, scenario: string, expectedCount: number) {
  const selects = page.locator("select:visible");
  await expect(selects).toHaveCount(expectedCount);
  const measurements = await selects.evaluateAll((elements) => elements.map((element) => {
    const select = element as HTMLSelectElement;
    const style = getComputedStyle(select);
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("Não foi possível medir as opções do seletor.");
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const letterSpacing = parseFloat(style.letterSpacing) || 0;
    const options = Array.from(select.options).map((option) => ({
      text: option.text,
      width: context.measureText(option.text).width + Math.max(0, option.text.length - 1) * letterSpacing
    }));
    const longest = options.reduce((previous, option) => option.width > previous.width ? option : previous, { text: "", width: 0 });
    const nativeArrow = style.appearance === "none" ? 0 : 18;
    const available = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - nativeArrow;
    const bounds = select.getBoundingClientRect();
    return {
      label: select.getAttribute("aria-label") || select.labels?.[0]?.textContent?.trim() || select.id,
      longest,
      available,
      family: style.fontFamily.split(",")[0]?.trim().replace(/["']/g, ""),
      withinViewport: bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth + 1
    };
  }));
  for (const measurement of measurements) {
    const description = `${scenario} / ${measurement.label}: "${measurement.longest.text}"`;
    expect(measurement.family, description).toBe("Manrope Variable");
    expect(measurement.withinViewport, `${description}: seletor dentro da tela`).toBe(true);
    expect(measurement.longest.width, `${description}: opção completa após reservar padding e seta`).toBeLessThanOrEqual(measurement.available + 1);
  }
}

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(dimensions.document, "largura total da página").toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, "largura do conteúdo da página").toBeLessThanOrEqual(dimensions.viewport + 1);
}

for (const width of viewports) {
  test(`controles e navegação mantêm os textos legíveis em ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const fontResponses: Response[] = [];
    page.on("response", (response) => {
      if (response.ok() && response.request().resourceType() === "font" && /\.woff2(?:\?|$)/i.test(response.url())) fontResponses.push(response);
    });

    for (const scenario of scenarios) {
      await test.step(scenario.path, async () => {
        await page.goto(scenario.path);
        await expect(page.locator("main")).toBeVisible();
        await expectManrope(page);
        await expectHeaderNavigation(page);

        if (scenario.path.startsWith("/problemas/")) {
          await expect(page.getByRole("combobox", { name: "Linguagem", exact: true })).toBeVisible();
          await expectNoPageOverflow(page);
          const codeTab = page.getByRole("navigation", { name: "Área da questão", exact: true }).getByRole("button", { name: "Código", exact: true });
          if (await codeTab.isVisible()) await codeTab.click();
          await expect(page.getByRole("combobox", { name: "Tamanho da fonte", exact: true })).toBeVisible();
        }

        await expectSelectLabelsToFit(page, scenario.path, scenario.selectCount);
        await expectNoPageOverflow(page);
      });
    }

    const fontResponse = fontResponses.find((response) => new URL(response.url()).origin === new URL(page.url()).origin);
    expect(fontResponse, "a fonte deve ser servida como WOFF2 pela própria aplicação").toBeDefined();
    const fontBytes = await fontResponse!.body();
    expect(fontBytes.subarray(0, 4).toString("ascii"), "a resposta contém um arquivo WOFF2 válido").toBe("wOF2");
  });
}
