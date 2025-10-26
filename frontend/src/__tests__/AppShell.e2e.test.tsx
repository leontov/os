import { render } from "@testing-library/react";
import AppShell from "../components/AppShell";

describe("AppShell safe area integration", () => {
  it("applies safe-area spacing so sticky panels do not overlap the header", () => {
    const { container } = render(
      <AppShell
        navigation={<nav aria-label="Основная навигация">Навигация</nav>}
        header={<header>Заголовок</header>}
        inspector={<div>Инспектор</div>}
      >
        <div>Контент</div>
      </AppShell>,
    );

    const layout = container.querySelector(".pt-safe-area-content");
    expect(layout).not.toBeNull();

    const stickySections = Array.from(container.querySelectorAll(".sticky"));
    expect(stickySections.length).toBeGreaterThan(0);
    stickySections.forEach((section) => {
      expect(section.classList.contains("top-safe-area-sticky")).toBe(true);
    });
  });
});
