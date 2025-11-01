import { test, expect } from "@playwright/test";

test.describe("adaptive mode strategy", () => {
  test("toggles adaptive strategy state", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Адаптивная стратегия" });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  test("applies precise strategy when adaptive mode is enabled", async ({ page }) => {
    await page.goto("/");
    const composer = page.getByLabel("Поле ввода сообщения");
    await composer.fill("Нужен точный отчёт по метрикам и рискам запуска.");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(
      page.getByText("Сверяйте результат с метриками и ожидаемым эффектом.")
    ).toBeVisible();

    const toggle = page.getByRole("button", { name: "Адаптивная стратегия" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await composer.fill("Повтори анализ метрик и рисков для запуска.");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(
      page.getByText("Балансируйте скорость с качеством и вовлекайте ключевых стейкхолдеров.").last()
    ).toBeVisible();
  });
});
