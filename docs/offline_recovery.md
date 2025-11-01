# Kolibri Offline Recovery Notes

## Functional coverage
- The frontend registers `kolibri-sw.js` as a service worker and precaches the shell (`index.html`), manifest, and icon to allow the UI to boot without network connectivity.
- A lightweight FAQ engine is embedded into the chat module. It indexes `docs/faq.md` during build time and serves as an offline fallback for the most common questions in Russian and English.
- When the heuristic response builder raises an exception, the composer now surfaces the FAQ fallback instead of a generic error banner.

## Reconnect regression test
- ✅ `npm test` – runs the Vitest suite, including the new FAQ engine unit coverage.
- ⚠️ `npm run test:e2e -- tests/e2e/offline.spec.ts` – Playwright requires the Chromium/WebKit bundles and GUI libraries; downloading browsers succeeded, but installing system packages (`npx playwright install-deps`) is blocked by the sandbox proxy, so the reconnect flow cannot be automated in-container.

## Known limitations
- Only the curated questions from `docs/faq.md` are answered offline; out-of-scope prompts fall back to the heuristic generator once connectivity is restored.
- The offline queue persists in `localStorage`, so browsers with restricted storage policies (e.g., private Safari sessions) may evict pending messages.
- Service worker updates require a full reload; users on outdated tabs may not receive the refreshed FAQ dataset until the worker activates.
