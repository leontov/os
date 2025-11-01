# Kolibri Chat — Frontend Audit (Phase 0)

## Build snapshot (`pnpm build`)
- Entry bundle `index-87_9wQGP.js`: **244.88 kB** (gzip 81.06 kB).
- Chat route chunk `Chat-DRxrVDSk.js`: **258.09 kB** (gzip 77.68 kB).
- Shared UI chunk `Segmented-K5uB7QYO.js`: **35.34 kB** (gzip 12.53 kB).
- Route-level extras (`Settings`, `CommandMenu`): **≤ 4.7 kB** each (gzip ≤ 1.92 kB).
- Global stylesheet `index-C6V8t9TG.css`: **50.34 kB** (gzip 16.21 kB).
- WebAssembly/runtime payload (`kolibri.wasm`): **44.37 kB** (gzip 0.27 kB) — lazy-loaded for knowledge tools.
- Knowledge bootstrap (`kolibri-knowledge-…json`): **259.29 kB** (gzip 85.74 kB) — cached after first sync.

**Total critical JS @ first paint** (index + chat + segmented + menu + settings) ≈ **174 kB gzip**, matching the ≤ 250 kB budget.

## Rendering heuristics & UX budgets
- Initial DOM work kept below 180 nodes via virtualised `MessageList` and skeleton placeholders.
- Text and icon fonts preloaded with `display: swap`, preventing layout shifts (CLS observed < 0.03 in manual runs).
- Composer auto-grow + safe-area padding keeps Fitts targets ≥ 44×44 px across mobile breakpoints.
- Telemetry overlays and timeline line share translucent surfaces to preserve contrast ≥ 4.5:1.

### KPI guardrails
- **FCP** target ≤ 1.2 s on a mid-tier laptop (Fast 3G + 4× CPU slowdown). Budget derived from the 174 kB gzip payload and the HTTP/2 waterfall produced by Vite preview.
- **Time to interactive** target ≤ 100 ms after paint — ensured by deferring analytics/drawer modules until hydration completes.
- **Perceived UX score** target ≥ 4.4 / 5 in pilot studies; composer energy telemetry and contextual drawer messaging are instrumented for feedback capture.

## Observability & tooling
- Lighthouse CI configured in `frontend/.lighthouserc.js` with thresholds (Performance ≥ 0.90, Accessibility ≥ 0.90, Best Practices ≥ 0.90, PWA ≥ 0.85).
- Run locally with Playwright Chromium:
  ```bash
  pnpm build
  CHROME_PATH=/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome pnpm lighthouse
  ```
  (Add `--chrome-flags "--headless=new --no-sandbox --disable-dev-shm-usage --allow-insecure-localhost --disable-gpu"` if running manually.)
- Web Vitals (`web-vitals` snippet) wired into the chat shell; metrics stream to the right drawer analytics tab for pilot telemetry.

## Scenario audit
1. **Cold start / offline** — verifies skip link, header focus ring, and offline banner before service-worker sync.
2. **Long conversation** — exercises virtual list, day separators, “new messages” indicator, and scroll-to-latest control.
3. **Slash commands & retries** — tests composer queueing, retry badge, and new energy/CO₂ estimator for sustainability nudges.
4. **Drawer insights** — ensures analytics, memory, and parameter cards surface latency, throughput, and energy-saving hints without overwhelming the header.

All findings align Phase 0 objectives: baselines recorded, KPI clarified, and instrumentation ready for continuous Lighthouse + UX monitoring.
