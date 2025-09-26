# Web Interface & WASM Bridge / Веб-интерфейс и WASM-мост / Web 界面与 WASM 桥接

**Copyright (c) 2025 Кочуров Владислав Евгеньевич**

---

## 1. Goals / Цели / 目标

- Предоставить визуализацию фрактальной памяти и формул.
- Поддержать офлайн-режим (PWA) и запуск ядра в браузере.
- Обеспечить обмен данными между React-компонентами и WebAssembly.

---

## 2. Project Layout / Структура проекта / 项目结构

```
frontend/
  ├─ src/
  │   ├─ App.tsx
  │   ├─ components/
  │   │    ├─ Chat.tsx
  │   │    ├─ NodeGraph.tsx
  │   │    ├─ FractalMemory.tsx
  │   │    ├─ GenomeExplorer.tsx
  │   │    ├─ RuleEditor.tsx
  │   │    └─ BrainAnalytics.tsx
  │   └─ wasm/
  │        └─ kolibri.ts
  └─ vite.config.ts
```

---

## 3. WASM Compilation / Компиляция WASM / WASM 编译

1. Установите Emscripten (`emsdk`).
2. Выполните: `emcmake cmake -S . -B build-wasm`.
3. `emmake cmake --build build-wasm --target kolibri_core`.
4. Результат: `build-wasm/kolibri.wasm` + glue JS.

---

## 4. JS Bridge / JavaScript-мост / JavaScript 桥接

```ts
import ModuleFactory from "./kolibri.wasm";

export async function createKolibriCore() {
  const module = await ModuleFactory();
  return {
    encode: (text: string) => module._kolibri_kodirovat_text(text),
    tick: (inputPtr: number, len: number) => module._kf_pool_tick(inputPtr, len),
    getBest: () => module._kf_pool_best(),
  };
}
```

- Все указатели управляются через `Module._malloc`/`_free`.
- Объект core передаётся в React context.

---

## 5. PWA Features / Возможности PWA / PWA 特性

- Service Worker кэширует `index.html`, `kolibri.wasm`, статические ассеты.
- Manifest описывает иконки, режим standalone, цветовую схему.
- При отсутствии сети UI переключается в offline-маршрут с локальной визуализацией генома.

---

## 6. Visualization Components / Компоненты визуализации / 可视化组件

| Component | Назначение |
|-----------|-----------|
| `Chat` | Диалог с ядром и команды REPL. |
| `NodeGraph` | Топология роя и задержки между узлами. |
| `FractalMemory` | Дерево десятичных уровней с подсветкой активных путей. |
| `GenomeExplorer` | Просмотр цепочки ReasonBlock. |
| `RuleEditor` | Ручная настройка формул, загрузка/выгрузка в пул. |
| `BrainAnalytics` | Графики fitness, мутаций и эффективности сети. |

---

## 7. Deployment / Развёртывание / 部署

- `npm install` → `npm run build` (создаёт `dist/`).
- Разместите `dist/` на статическом хостинге (GitHub Pages, Netlify).
- Для локальной отладки используйте `npm run dev` с проксированием к локальному Kolibri Node.

---

## 8. Security Considerations / Безопасность / 安全注意事项

- WebAssembly модуль не должен иметь сетевых побочных эффектов без явного разрешения пользователя.
- Логи генома сохраняются в IndexedDB с шифрованием (планируется).
- Все команды пользователя отображаются в журнале с отметкой времени.

---

## 9. Technology Rationale / Обоснование выбора технологий / 技术选型依据

### Summary / Кратко / 摘要

- **WebAssembly** остаётся единственной практической технологией для запуска ядра Kolibri на C11 внутри браузера с производительностью, близкой к нативной, и строгой песочницей безопасности.
- **WebGPU** рассматривается как дополнительный ускоритель для массово-параллельных операций (например, визуализации роя и ускоренного агрегирования голосов), но не заменяет WASM для основного цикла формул.
- **Современный JavaScript** остаётся оболочкой UI (React/Vite), однако не удовлетворяет требованиям по детерминизму и контролю памяти для цифрового ядра.

### Detailed Comparison / Подробно / 详细说明

| Технология / Technology | Роль в Kolibri | Причины выбора / Key Reasons |
|-------------------------|----------------|-------------------------------|
| **WebAssembly** | Исполнение ядра KolibriScript и цифрового движка | - Компиляция существующего C-кода без переписывания.<br>- Производительность, близкая к нативной, и минимализм по зависимостям.<br>- Изоляция и безопасность: модуль работает в песочнице, не нарушая Закон Чистоты. |
| **WebGPU** | Будущие оптимизации визуализации и параллельных вычислений | - Предоставляет доступ к GPU для фрактальных визуализаций и ускоренного голосования.<br>- Используется как дополнение: WASM готовит данные, WebGPU визуализирует.<br>- Сложность WGSL требует отдельного слоя-адаптера, поэтому внедрение планируется после стабилизации ядра. |
| **JavaScript (ES2022+)** | React-интерфейс и мост WASM↔UI | - Богатая экосистема UI и прямой доступ к DOM.<br>- Обеспечивает PWA-функции и управление состоянием.<br>- Не используется для цифрового ядра из-за недетерминированного JIT и ограниченного контроля памяти. |

### Conclusion / Вывод / 结论

В рамках Закона Множественности и Автономности мы сохраняем WebAssembly как «мозг» браузерной версии Kolibri. WebGPU добавляется как «ускоренное сердце» визуализаций там, где требуется массовый параллелизм, а JavaScript остаётся «лицом» и мостом к пользователю. Такая связка обеспечивает минимализм, прозрачность и воспроизводимость, соответствующие фундаментальным законам экосистемы.


---

## 10. Neural Telescope Layer / Слой «Нейронного телескопа» / “神经望远镜”层

- **EN:** WebGPU replaces mock simulations with a live feed. KVP delta streams arrive over WebSockets, patch GPU buffers, and keep ≥1M swarm particles in sync at 60 FPS. Filtering, zoom, and timeline scrubbing operate on the live dataset without pausing ingestion.
- **RU:** WebGPU полностью исключает псевдо-симуляции: поток дельт KVP приходит по WebSocket, патчит GPU-буферы и синхронизирует ≥1 млн частиц роя при 60 FPS. Фильтрация, зум и прокрутка временной шкалы работают поверх живых данных без остановки приёма.
- **ZH:** WebGPU 用实时数据取代任何模拟：KVP 增量通过 WebSocket 到达，更新 GPU 缓冲区，使 ≥100 万粒子在 60 FPS 下保持同步。过滤、缩放与时间轴拖动都在实时数据上执行，无需暂停数据流。

- **EN:** Compute pipelines such as `vote_aggregator.wgsl` expose GPU acceleration to the WASM core via the `uskorit_golosovanie_cherez_gpu` export. Critical digit-fold reductions move off the CPU, cutting response latency for swarm consensus.
- **RU:** Вычислительные конвейеры, например `vote_aggregator.wgsl`, открывают ускорение GPU для WASM-ядра через экспорт `uskorit_golosovanie_cherez_gpu`. Ключевые десятичные свёртки уходят с CPU, снижая задержку консенсуса роя.
- **ZH:** 计算管线（如 `vote_aggregator.wgsl`）通过 `uskorit_golosovanie_cherez_gpu` 导出向 WASM 内核提供 GPU 加速。关键的十进制归并从 CPU 转移到 GPU，显著降低群体一致性的延迟。

