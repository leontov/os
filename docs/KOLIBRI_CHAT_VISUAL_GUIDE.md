# Kolibri Chat Visual Language

## Inspiration & principles
- **ChatGPT / Claude** — conversational focus, whitespace that breathes, discreet system chrome.
- **Perplexity** — contextual drawers and knowledge cards with subtle elevation.
- **Kolibri DNA** — emerald accent `#4ADE80`, glassmorphism surfaces, precision typography (Inter 16 px base, JetBrains Mono for code).

Guiding triad: *легкость, точность, доверие* — minimal chrome, high-contrast copy, energy cues in context.

## Token system
- Color tokens defined in `src/design/tokens.css` (`--bg`, `--bg-elev`, `--brand`, `--surface-glass`, `--focus`).
- Radius scale: `--radius-sm` 8 px, `--radius-lg` 16 px, `--radius-xl` 24 px, pill radius for command chips.
- Shadows: `--shadow-1` for cards, `--shadow-2` for hero/overlays, `--shadow-ring` for focus states.
- Spacing grid: 4 pt increments (`--space-1` to `--space-16`), layout anchored to 8 pt multiples.

## Component palette
- **Header** — sticky, glass-blurred, split into logo/identity, dialogue status, global actions.
- **Sidebar** — 280 px rail with pinned items, search, workspace folders. Targets ≥ 44 px.
- **Message timeline** — virtualised log with separators (`Today`, `Yesterday`), vertical guide line, compact author grouping.
- **Composer** — auto-grow textarea, slash command palette, energy/CO₂ estimator, offline queue badge.
- **Right drawer** — collapsible analytics/memory/parameters cards with translucent surfaces.
- **Feedback** — toasts (Radix), skeletons, empty/error states with iconography.

## Accessibility & motion
- Dark theme default; light theme toggled via `data-theme="light"`.
- Focus ring uses `box-shadow: var(--focus)`; skip-link anchors fast track to chat log.
- `prefers-reduced-motion` toggles animations to 1 ms via `[data-reduced-motion="true"]` hook.
- Keyboard coverage: Tab/Shift+Tab/Enter/Esc + arrow navigation for segmented control and command palette.

## Mobile & responsive rules
- Breakpoints: 360/768/1024/1440 px.
- Composer fixed to safe area (`env(safe-area-inset-bottom)`), bottom nav for drawer tabs < 1280 px.
- Sidebar collapses into slide-over with overlay (close on backdrop tap or Esc).
- Right drawer hidden below 1280 px; accessible via menu icon and bottom tab bar.

## Performance & polish checklist
- Route-level code-splitting (`Chat`, `Settings`, `CommandMenu`).
- Virtual list avoids DOM > 50 nodes onscreen, debounced height observer prevents React update loops.
- Fonts served via `@fontsource`, preconnected in `<head>` to reduce LCP.
- Storybook docs required for Button, Badge, Composer, MessageList (loading/empty/error states).
- Lighthouse budgets stored in `.lighthouserc.js`; `pnpm lighthouse` gate ensures Performance ≥ 0.90.

This guide is the design reference for subsequent phases (workspaces, multimodal previews, productivity modes) and must stay in sync with tokens and UX checklist.
