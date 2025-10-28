# Accessibility Checklist — Kolibri Chat

- [x] Семантическая структура: `<header>`, `<nav>`, `<main>`, `<aside>`, skip-link.
- [x] Все интерактивные элементы имеют `aria-label`/`aria-live`, командная палитра оформлена как `role="dialog"` + `role="menu"`.
- [x] Полная клавиатурная навигация: Tab/Shift+Tab/Enter/Esc, видимые focus-ring (var(--focus)).
- [x] Контраст текста и иконок ≥ 4.5:1 (проверено axe + manual spot check).
- [x] Паттерны Radix UI гарантируют доступность модулей (Tabs, Toasts, ToggleGroup), клавиатурная палитра открывается по Ctrl/Cmd+K.
- [x] Поддержка `prefers-reduced-motion`: ThemeProvider выставляет `data-reduced-motion`.
- [x] Размеры таргетов ≥ 44×44 px; отступы ≥ 8 px.
- [x] Чат объявлен `role="log"` с `aria-live="polite"`.
- [x] Разделители дней и плавающая кнопка «К последнему» имеют текстовые подписи и aria-label.
- [x] Composer озвучивает лимит символов, retry- и attach-кнопки доступны клавиатурой и имеют aria-label.
- [x] Локализация ru/en с паритетом ключей и i18n-провайдером.
- [x] Playwright e2e сценарий проверяет оффлайн UX и восстановление доступности.
- [x] Storybook включает a11y-addon для регрессионной проверки.
