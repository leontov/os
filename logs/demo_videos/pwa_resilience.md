# PWA resilience walkthrough

**Аудитория:** Frontend, Mobile

## План
1. Открыть `/demo`, показать метрики холодного старта.
2. Искусственно увеличить размер wasm и продемонстрировать деградацию.
3. Перейти в офлайн и показать работу кэша.

## Команды и логи
```
npm run build
npm run preview -- --host
python scripts/tools/bloat_wasm.py kolibri.wasm
```
