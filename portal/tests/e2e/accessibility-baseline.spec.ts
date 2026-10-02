import { expect, test, type Page } from "@playwright/test";

const ready = Boolean(process.env.E2E_BASE_URL);
const clientEmail = process.env.E2E_CLIENT_EMAIL ?? "client@example.test";
const clientPassword = process.env.E2E_CLIENT_PASSWORD ?? "SbsDevClient!2026";

async function expectNoUnlabelledControls(page: Page) {
  const unlabeled = await page.locator("input:not([type=hidden]), select, textarea").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const ariaLabel = control.getAttribute("aria-label");
        const ariaLabelledBy = control.getAttribute("aria-labelledby");
        return !(control.labels?.length || ariaLabel || ariaLabelledBy);
      })
      .map((element) => (element as HTMLElement).outerHTML.slice(0, 180)),
  );

  expect(unlabeled).toEqual([]);
}

test.describe("accessibility baseline", () => {
  test.skip(!ready, "Set E2E_BASE_URL and seeded E2E credentials.");

  test("login controls have programmatic labels", async ({ page }) => {
    await page.goto("/login");
    await expectNoUnlabelledControls(page);
  });

  test("portal has keyboard skip navigation and labelled settings controls", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByLabel("Password").fill(clientPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();

    await skipLink.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    await page.goto("/app/settings");
    await expectNoUnlabelledControls(page);
  });
});
