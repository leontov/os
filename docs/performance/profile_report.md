# Производительность Kolibri Chat

## Lighthouse (frontend)
- **Performance**: 0.72
- **Accessibility**: 0.91
- **Best Practices**: 1.00
- **SEO**: 0.82
- **First Contentful Paint**: 2.04 s
- **Largest Contentful Paint**: 3.11 s
- **Time to Interactive**: 3.58 s
- **Total Blocking Time**: 837 ms
- **Cumulative Layout Shift**: 0

### Основные выводы
- Высокое TBT связано с загрузкой модуля CommandMenu и контекстной панели; внедрение `React.lazy` и `Suspense` уменьшает объём основного бандла и сокращает блокирующий рендер.
- LCP остаётся около 3.1 секунды из-за тяжёлой геро-секции и крупных градиентов; стоит рассмотреть отложенную загрузку второстепенных изображений и использование `prefetch` для критичных шрифтов.
- Accessibility/SEO показатели выше 0.8, явных регрессий не обнаружено.

### Как воспроизвести
1. `pnpm install`
2. `pnpm --filter frontend build`
3. `pnpm --filter frontend preview --host`
4. `CHROME_PATH=/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome pnpm --filter frontend lhci collect --url http://127.0.0.1:4173`

## K6 (backend)
- **Нагрузка**: 20 виртуальных пользователей, 30 секунд
- **Средняя задержка**: 7.89 ms
- **p(90) задержки**: 18.64 ms
- **p(95) задержки**: 29.23 ms
- **Всего запросов**: 600 (100% успешны)
- **Средняя пропускная способность**: 19.79 req/s

### Основные выводы
- API `/api/health` отвечает стабильно с p95 < 30 ms; узких мест на уровне FastAPI/uvicorn не обнаружено.
- Сетевые задержки минимальны; дальнейшая оптимизация имеет смысл только при усложнении бизнес-логики.

### Как воспроизвести
1. `uvicorn backend.service.main:app --host 127.0.0.1 --port 8000`
2. `/tmp/k6-v0.49.0-linux-amd64/k6 run /tmp/k6-health.js`

## Рекомендации по дальнейшим улучшениям
- Продолжить дробление крупных компонентов (RightDrawer, Sidebar) на лениво загружаемые участки, особенно для мобильной версии.
- Добавить `prefetch` критичных API-запросов после загрузки shell, чтобы сгладить первый ввод.
- Для backend предусмотреть нагрузочное тестирование сценариев генерации отчётов (путь `/api/reports`) перед выходом на прод.
