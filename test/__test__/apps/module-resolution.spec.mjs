import { join } from "node:path";

import { hostname, page, server, waitForHydration } from "playground/utils";
import { describe } from "vitest";
import { beforeAll, expect, test } from "vitest";

process.chdir(join(process.cwd(), "../examples/module-resolution"));

describe("module-resolution example", {}, () => {
  beforeAll(async () => {
    await server("./App.jsx");
  });

  test("iron-session loads", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("networkidle");

    const ironSessionSection = page.locator("#iron-session");
    await ironSessionSection.waitFor({ state: "visible" });

    const result = ironSessionSection.getByText(
      "iron-session loaded successfully"
    );
    await result.waitFor({ state: "visible" });
    expect(await result.isVisible()).toBe(true);

    const sessionType = ironSessionSection.getByText("Session type: object");
    await sessionType.waitFor({ state: "visible" });
    expect(await sessionType.isVisible()).toBe(true);
  });

  test("shiki loads", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("networkidle");

    const shikiSection = page.locator("#shiki");
    await shikiSection.waitFor({ state: "visible" });

    const result = shikiSection.getByText("shiki loaded successfully");
    await result.waitFor({ state: "visible" });
    expect(await result.isVisible()).toBe(true);

    // Verify shiki rendered the code
    const codeContent = shikiSection.getByText("Hello from Shiki!");
    await codeContent.waitFor({ state: "visible" });
    expect(await codeContent.isVisible()).toBe(true);
  });

  test("react-modal loads", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const modalSection = page.locator("#react-modal");
    await modalSection.waitFor({ state: "visible" });

    const result = modalSection.getByText("react-modal loaded successfully");
    await result.waitFor({ state: "visible" });
    expect(await result.isVisible()).toBe(true);

    // Test modal interaction
    const showButton = modalSection.getByText("Show Modal");
    await showButton.waitFor({ state: "visible" });
    await showButton.click();

    const hideButton = page.getByText("Hide Modal");
    await hideButton.waitFor({ state: "visible" });
    expect(await hideButton.isVisible()).toBe(true);

    await hideButton.click();
    await showButton.waitFor({ state: "visible" });
    expect(await showButton.isVisible()).toBe(true);
  });

  test("interweave loads", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const interweaveSection = page.locator("#interweave");
    await interweaveSection.waitFor({ state: "visible" });

    const result = interweaveSection.getByText(
      "interweave loaded successfully"
    );
    await result.waitFor({ state: "visible" });
    expect(await result.isVisible()).toBe(true);

    // Verify interweave rendered the HTML content
    const boldText = interweaveSection.locator("strong").getByText("Bold text");
    await boldText.waitFor({ state: "visible" });
    expect(await boldText.isVisible()).toBe(true);

    const italicText = interweaveSection.locator("em").getByText("italic text");
    await italicText.waitFor({ state: "visible" });
    expect(await italicText.isVisible()).toBe(true);
  });

  test("react-feather loads", async () => {
    await page.goto(hostname);
    await page.waitForLoadState("networkidle");
    await waitForHydration();

    const featherSection = page.locator("#react-feather");
    await featherSection.waitFor({ state: "visible" });

    const result = featherSection.getByText(
      "react-feather loaded successfully"
    );
    await result.waitFor({ state: "visible" });
    expect(await result.isVisible()).toBe(true);

    // Verify SVG icons are rendered (react-feather renders SVG elements)
    const svgIcons = featherSection.locator("svg");
    expect(await svgIcons.count()).toBe(6);
  });
});
