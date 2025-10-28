import { test, expect } from "@playwright/test";

test.describe("offline composer queue", () => {
  test("saves message offline and flushes after reconnect", async ({ page, context }) => {
    await page.goto("/");
    await context.setOffline(true);
    const composer = page.getByLabel("Поле ввода сообщения");
    await composer.fill("Тестовое сообщение при оффлайне");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText("Оффлайн")).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText("Сообщение отправлено")).toBeVisible();
  });
});
