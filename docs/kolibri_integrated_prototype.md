# Kolibri: интегрированная ИИ-система на основе десятичных импульсов, формульной памяти, фрактальной иерархии и распределённого обучения

© 2025 Кочуров Владислав Евгеньевич. Все права защищены.

---

## Русская версия

**Автор:** Кочуров Владислав Евгеньевич  
**Дата:** 23 сентября 2025  
**Локация:** Амстердам, Нидерланды

*Примечание: данный документ сформирован из всех доступных в текущей сессии фрагментов чатов 2025 года, относящихся к ключевым словам «Колибри», «Ковиан», «ОС/операционная система», «научная работа». Полные экспортированные логи можно дополнительно вставить при предоставлении выгрузки.*

### Аннотация

Kolibri ИИ (также известная как Kolibri Nano или NumeriFold) представляет собой новый подход к искусственному интеллекту, в котором эволюционировала концепция от фрактальной десятичной логики (последовательности 0–9) и формульной памяти до практических экспериментов с реализацией ядра на C и WebAssembly, веб-интерфейсом (Canvas/PWA) и кластерным запуском множества узлов. Методология Kolibri основывается на поиске, мутации и отборе коротких исполняемых формул вместо обучения крупных нейронных сетей с весовыми матрицами. Такой подход обеспечивает локальное обучение (на уровне отдельных узлов) и интерпретируемость знаний. Настоящая работа структурирована по канонам научной статьи и включает разделы Введение, Методология, Архитектура, Эксперименты, Результаты, а также планы развития системы.

### Введение

Kolibri ИИ – это интегрированная интеллектуальная система, в которой базовые единицы “мышления” представлены десятичными токенами (цифрами) от 0 до 9. Каждая такая «цифра» содержит 10 вложенных суб-цифр, образуя тем самым фрактальную иерархию уровней, где информация передается вверх путём агрегирования голосов с нижележащих уровней. Знания в Kolibri кодируются короткими формулами, исполняемыми как микропрограммы, а не распределением весов в нейронной сети. Основные цели развития системы на 2025 год включали: доказательство работоспособности ядра на C с возможностью компиляции в WASM, создание веб-интерфейса для взаимодействия, поддержка офлайн-режима (PWA), тестирование масштабируемости кластеров узлов, а также формирование научного описания предлагаемого подхода. В отличие от классических нейросетевых моделей, требующих огромных массивов параметров и вычислительных ресурсов, подход Kolibri нацелен на легковесную и интерпретируемую альтернативу традиционному глубокому обучению.

### Методология

Kolibri использует комбинацию идей из фрактальной математической логики и эволюционных алгоритмов. Ниже перечислены основные принципы работы системы:

1. **Десятичные токены и голосование:** входные данные транслируются в последовательность импульсов 0–9 (десятичных токенов). Эти «голоса» агрегируются на каждом уровне фрактальной иерархии, формируя коллективное решение или интерпретацию поступающего сигнала.
2. **Формульная память:** вместо распределённых весовых коэффициентов Kolibri хранит знания в виде коротких исполняемых формул (микропрограмм). Каждая формула оценивается по «фитнесу» – измеряемой полезности для текущей задачи – а также по метрике сложности, что стимулирует нахождение простых и обобщающих решений.
3. **Эволюция формул:** память системы постоянно эволюционирует. На каждом цикле работы происходит генерация новых формул, их случайная мутация и рекомбинация, после чего осуществляется отбор наиболее успешных по заданным метрикам. Так Kolibri адаптирует свой «геном формул» на основе накопленного опыта, постепенно улучшаясь.
4. **Локальность:** ядро Kolibri реализовано на низком уровне (ANSI C), что обеспечивает минималистичность и высокую эффективность. Обучение и работа алгоритмов происходят локально – на уровне отдельного процесса или устройства (включая возможность компиляции ядра в WebAssembly для запуска прямо в браузере или на edge-устройстве).
5. **Минимальные зависимости:** реализация системы стремится обходиться без внешних библиотек. При необходимости используются лишь легковесные компоненты (например, библиотека json-c для парсинга JSON). Это упрощает переносимость Kolibri на разные платформы и снижает требования к окружению.
6. **Журналирование:** все возникающие «мысли» системы (сгенерированные формулы, их метрики) подробно логируются. Накопление журнала позволяет анализировать процесс обучения, воспроизводить эксперименты и отслеживать эволюцию знаний во времени.

**Алгоритм 1: Эволюционный цикл поиска формул в Kolibri**

```
инициализировать начальную популяцию формул P случайным образом
while (не выполнен критерий остановки):
    вычислить фитнес каждой формулы в P на заданной задаче
    отобрать подмножество лучших формул
    сгенерировать новые формулы путем мутации и рекомбинации выбранных
    заменить худшие формулы в P новыми
return лучшая найденная формула (или формулы)
```

### Пример применения

Рассмотрим упрощённый пример использования описанного подхода. Предположим, требуется обнаружить закономерность в числовой последовательности (например, 3, 9, 27, …). Система Kolibri преобразует эти данные в поток десятичных импульсов и с помощью эволюционного алгоритма генерирует и отбирает кандидаты формул, стремясь приблизиться к заданным значениям. В результате одной из найденных гипотез может оказаться формула `f(x) = 3 * 3^x`, которая точно описывает закономерность последовательности (при `x=0` выдаёт 3; `x=1` – 9; `x=2` – 27; и т.д.). Этот пример демонстрирует, как Kolibri автоматически обнаруживает формульные зависимости в данных и предлагает человеческо-читаемое объяснение (формулу), в отличие от чёрного ящика нейросети.

### Архитектура

Архитектура Kolibri ИИ включает несколько ключевых модулей, работающих во взаимосвязи:

- **Digit Pulse Transducer** — преобразует входные сигналы в последовательность импульсов 0–9, то есть осуществляет первоначальную токенизацию данных в десятичном формате.
- **Fractal Induction** — отвечает за порождение новых формул и уточнение существующих на различных уровнях фрактальной иерархии памяти. Этот модуль реализует механизм фрактального развёртывания знаний.
- **Rule/Formula Engine** — исполняет формулы (правила) и собирает статистику об их работе, включая вычисление показателя полезности (фитнеса) каждой формулы. Этот движок реализует цикл “гипотеза → проверка → оценка”.
- **Kolibri Chain (микро-блокчейн)** — служит журналом знаний: каждая формула снабжается криптографической подписью и записывается в цепочку блоков. Это позволяет удостоверять авторство формул и обмениваться проверенными знаниями между различными узлами Kolibri в распределённой среде.
- **Canvas/PWA UI** — визуальный интерфейс пользователя, реализованный как прогрессивное веб-приложение (PWA) с использованием Canvas-графики. Обеспечивает наглядное представление фрактальной памяти, графа формул и правил, а также интерактивное взаимодействие с системой; поддерживается офлайн-режим работы.
- **WASM-хостинг** — возможность компилировать ядро Kolibri из C в WebAssembly (WASM) модуль. Это позволяет запускать мозг Kolibri непосредственно в браузере или на статиках (например, GitHub Pages) без необходимости в сервере, что упрощает распространение и тестирование.
- **Cluster/Nodes** — поддержка многопроцессной или многомашинной конфигурации, при которой несколько узлов Kolibri работают параллельно. Предусмотрены средства мониторинга состояния узлов и обмена сообщениями/формулами между ними (с использованием Kolibri Chain для синхронизации знаний).
- **Kolibri OS** — специализированная программная среда (слой исполнения), облегчающая развёртывание и управление узлами Kolibri. По сути, это операционная оболочка, предоставляющая сервисы для работы распределённого интеллекта (планирование задач, управление ресурсами, взаимодействие компонентов).
- **Интеграции** — экосистема внешних сервисов и приложений, взаимодействующих с Kolibri. В их числе: интеграция с GitHub для совместной разработки и хранения кода, Telegram-боты для диалогового взаимодействия с ИИ, платформа EstimateCraft для автоматизированной оценки и валидации результатов и др. Эти интеграции демонстрируют применимость Kolibri в различных практических сценариях.

### Реализация и структура проекта

Ядро Kolibri разработано на языке C (стандарт C11) с акцентом на эффективности и компактности. Благодаря этому, его можно собрать под различные целевые среды; в частности, тот же исходный код компилируется в WebAssembly, что позволяет запускать Kolibri в браузере или на веб-странице. Веб-интерфейс системы реализован на базе фреймворка React (JavaScript/TypeScript) и взаимодействует с ядром через вызовы WebAssembly (например, для визуализации памяти или отправки команд). В целях упрощения развёртывания, ядро старается не зависеть от внешних библиотек: из сторонних компонентов используется только лёгкая библиотека json-c (для разбора и генерации JSON-данных).

Проект организован по классической схеме «backend + frontend». Ниже приведён упрощённый пример структуры файлов проекта:

```
Project/
├── CMakeLists.txt          # конфигурация сборки CMake
├── Makefile                # альтернативный Makefile для сборки
├── backend/                # серверная часть (ядро Kolibri)
│   └── src/                # исходники ядра на C
├── frontend/               # клиентская часть (веб-интерфейс)
│   └── src/                # исходники интерфейса (React, JS/TS)
├── logs/                   # журналы и лог-файлы экспериментов
├── node_10000_memory.json  # пример: файл памяти узла №10000
├── node_10000_rules.json   # пример: файл правил узла №10000
└── ...                     # прочие вспомогательные файлы/директории
```

### Эксперименты

Для проверки концепции проводились численные эксперименты в различных средах (macOS, Linux). В ходе испытаний запускались как одиночные узлы Kolibri, так и группы узлов, объединённых в кластер, с активированным журналированием всех процессов. В частности, измерялись производительность (время исполнения формул, нагрузка на CPU/память), устойчивость работы (например, корректное завершение процессов при остановке кластера), отслеживались возникающие ошибки компиляции и исполнения.

В одном из экспериментов было одновременно запущено несколько Kolibri-узлов, что позволило протестировать механизм обмена формулами через Kolibri Chain. Логи зафиксировали успешную синхронизацию знаний между узлами, а также выявили ограничения операционной системы на число параллельных процессов (в журнале наблюдались сообщения об ошибках наподобие “fork: Resource temporarily unavailable”, указывающие на исчерпание лимитов). Эти наблюдения помогли скорректировать параметры масштабирования кластера.

Кроме того, был протестирован веб-вариант Kolibri: ядро, скомпилированное в WASM, было загружено на простую HTML-страницу, предоставляющую интерфейс чата. Это подтвердило, что Kolibri может функционировать как автономное Progressive Web App, доступное прямо из браузера без серверной части. Параллельно разрабатывались компоненты визуализации (модули NodeGraph, FractalMemory, RuleEditor, BrainAnalytics на фронтенде), которые отображают состояние памяти ИИ, эволюцию формул и другие аспекты работы Kolibri в режиме реального времени, что значительно облегчило отладку и понимание процессов во время экспериментов.

### Результаты

Достигнуты следующие ключевые результаты и вехи разработки Kolibri:

1. Сформулирован и экспериментально подтверждён формульно-фрактальный подход к построению ИИ (кодовое название подхода – NumeriFold): использованы десятичные импульсы как основа представления, концепция “генома” формул для памяти и эволюционный отбор знаний вместо градиентного спуска.
2. Реализованы прототипы ядра на C и успешно интегрированы с браузерной средой через WebAssembly; параллельно разработаны основные компоненты пользовательского интерфейса для визуализации и взаимодействия с системой.
3. Налажен процесс журналирования формул и метрик: все эксперименты сохраняются, что позволило сравнивать разные конфигурации и алгоритмы. Эти данные послужат основой для дальнейшего анализа эффективности подхода.
4. Продемонстрирована совместимость Kolibri с технологиями PWA/Canvas (веб-интерфейс может работать автономно, используя кэширование) и способность системы масштабироваться на кластер из множества узлов, обменивающихся знаниями.
5. Подготовлен фундамент для дальнейшего официального оформления работы: накопленные материалы используются при написании научной статьи и для подтверждения авторских прав на изобретение.

### Ограничения и дальнейшие шаги

Несмотря на успешный прогресс, текущее состояние Kolibri имеет ряд ограничений, определяющих направления будущей работы:

- Необходимо провести полноценную валидацию на бенчмарках. Пока что подход не тестировался на стандартных наборах задач (например, задачи по математическим вычислениям, обработке естественного языка, генерации кода). Планируется сформировать набор тестовых заданий и сравнить эффективность Kolibri с традиционными методами.
- Требуется разработать формальную спецификацию Kolibri OS и четко определить интерфейсы между модулями системы. Это важно для повышения надежности и упрощения коллективной разработки, а также для последующей сертификации технологии.
- Следующий этап исследований сфокусирован на автоматизации эволюции формул. Предстоит реализовать более продвинутые операторы мутации/скрещивания, а также механизмы визуальной аналитики, которые позволят наблюдать и объяснять динамику фрактальной памяти во времени. Например, планируется интерактивный графический монитор, показывающий, как «мыслят» узлы Kolibri.

### Заключение

Kolibri демонстрирует новый взгляд на искусственный интеллект, объединяющий дискретную фрактальную логику с эволюционными принципами обучения. Предварительные эксперименты подтверждают жизнеспособность и перспективность предложенного подхода. В дальнейшем запланировано расширение функциональности системы, накопление статистики на реальных задачах и формальное описание метода для научного сообщества. Ожидается, что Kolibri послужит основой для интерпретируемых и эффективных ИИ-систем, способных обучаться без громоздких моделей и облачных ресурсов, прямо «на месте» – там, где находятся данные и пользователи.

---

## English version

**Kolibri: An Integrated AI System Based on Decimal Pulses, Formula Memory, Fractal Hierarchy, and Distributed Learning**

**Author:** Vladislav E. Kochurov  
**Date:** September 23, 2025  
**Location:** Amsterdam, Netherlands

### Abstract

This paper introduces Kolibri AI (also referred to as Kolibri Nano or NumeriFold), a novel approach to artificial intelligence that has evolved from fractal decimal logic (sequences of 0–9) and formula-based memory to practical experiments involving a C/WASM core implementation, a Canvas/PWA web interface, and clustered node deployments. The methodology of Kolibri relies on searching, mutating, and selecting short executable formulas in place of training large neural networks with weight matrices. This approach enables localized learning (at the level of individual nodes) and provides interpretable knowledge representations. The document is structured in academic format with sections including Introduction, Methodology, Architecture, Experiments, Results, and future development plans.

### Introduction

Kolibri AI is an integrated intelligent system in which the basic units of “thought” are decimal tokens (digits) from 0 to 9. Each such digit contains 10 nested sub-digits, forming a fractal hierarchy of levels. Information is propagated upward by aggregating the votes of lower-level tokens at each higher level to form a consensus interpretation. Knowledge in Kolibri is encoded as short formulas that can be executed like microprograms, rather than as distributed weights in a neural network. The development goals for the system in 2025 included demonstrating a working core implementation in C with compilation to WASM, building a web-based user interface, enabling offline use (PWA), testing the scalability of multiple Kolibri nodes in a cluster, and producing a formal scientific description of the approach. Unlike classical neural network models that require huge numbers of parameters and significant computational resources, the Kolibri approach aims to provide a lightweight and interpretable alternative to traditional deep learning.

### Methodology

Kolibri combines ideas from fractal symbolic logic and evolutionary algorithms. The key operating principles of the system are outlined below:

1. **Decimal Tokens and Voting:** The input data stream is translated into a sequence of pulses labeled 0–9 (decimal tokens). These serve as “votes” that are aggregated at each level of the fractal hierarchy, forming a collective interpretation or decision for the input.
2. **Formula-Based Memory:** Instead of storing knowledge in weight parameters, Kolibri uses short executable formulas (microprograms). Each formula is evaluated by a fitness metric – measuring its utility for the current task – and by a complexity metric, which encourages the discovery of simple, generalizable solutions.
3. **Evolutionary Learning:** The system’s memory continually evolves over time. In each cycle, new candidate formulas are generated (randomly or via recombination of existing ones) and then possibly mutated, followed by selection of the top performers according to the defined metrics. In this way, Kolibri adapts its “formula genome” based on experience, gradually improving its performance.
4. **Locality:** The Kolibri core is implemented in low-level ANSI C for efficiency and minimal footprint. Training and inference occur locally — at the level of a single process or device (including the possibility of compiling the core to WebAssembly for direct in-browser or edge device execution).
5. **Minimal Dependencies:** The implementation avoids external libraries wherever possible. Only lightweight components are used when necessary (for example, the json-c library for JSON parsing). This design choice improves Kolibri’s portability to different platforms and simplifies deployment.
6. **Logging:** All emerging “thoughts” of the system (generated formulas and their associated metrics) are extensively logged. This logging enables analysis of the learning process, helps with debugging, and ensures that experiments are reproducible for validation.

**Algorithm 1: Evolutionary formula search in Kolibri (pseudocode)**

```
initialize population P with random formulas
while (termination criterion not met):
    evaluate the fitness of each formula in P
    select the subset of top-performing formulas
    generate new formulas by mutating/recombining the selected ones
    replace the worst formulas in P with the new formulas
return the best formula(s) found
```

### Example Application

Consider a simple use-case to illustrate the above approach. Suppose we want to discover a pattern in a sequence of numbers (for example: 3, 9, 27, …). The Kolibri system would convert these data points into decimal token pulses and employ its evolutionary search mechanism to generate and test candidate formula hypotheses. As a result, one of the evolved formulas might be `f(x) = 3 × 3^x`, which perfectly fits the given sequence (yielding 3 for x=0, 9 for x=1, 27 for x=2, and so on). This example demonstrates how Kolibri can automatically discover formulaic relationships in data and provide a human-readable explanatory model (a formula), in contrast to a neural network’s “black-box” model.

### Architecture

The architecture of the Kolibri AI system comprises several key modules working in concert:

- **Digit Pulse Transducer** – converts input signals into a sequence of 0–9 pulses, effectively tokenizing the raw data into the decimal format required by the system.
- **Fractal Induction** – generates new formulas and refines existing ones at various levels of the fractal hierarchy. This module implements the mechanism of unfolding knowledge across the fractal memory structure.
- **Rule/Formula Engine** – executes the formulas (rules) and collects statistics about their execution, including computing a fitness score for each formula. This engine realizes the cycle of “hypothesis → test → evaluation” within the system.
- **Kolibri Chain (micro-blockchain)** – serves as a ledger of knowledge: each formula is recorded with a cryptographic signature in a blockchain-like chain of blocks. This allows verification of formula provenance and sharing of vetted knowledge among different Kolibri nodes in a distributed environment.
- **Canvas/PWA UI** – a visual user interface implemented as a Canvas-based Progressive Web App. It provides visualizations of the fractal memory, formula graphs, and rules, and allows interactive user engagement with the system; an offline mode is supported via PWA caching.
- **WASM Hosting** – the ability to compile the Kolibri core from C into a WebAssembly (WASM) module. This enables running the Kolibri “brain” directly in a web browser or on static sites (e.g., via GitHub Pages) without a server, which simplifies deployment and testing.
- **Cluster/Nodes** – support for multi-process or multi-machine configurations where multiple Kolibri nodes run in parallel. Mechanisms are provided for monitoring node status and exchanging messages/formulas between nodes (using the Kolibri Chain for knowledge synchronization).
- **Kolibri OS** – a specialized software environment (execution layer) designed to facilitate deployment and management of Kolibri nodes. Essentially, it acts as an operating framework providing services such as task scheduling, resource management, and component communication for the distributed intelligence.
- **Integrations** – an ecosystem of external services and applications integrated with Kolibri. These include: integration with GitHub for collaborative development and code hosting, Telegram bots for conversational interaction with the AI, the EstimateCraft platform for automated result evaluation, among others. Such integrations demonstrate Kolibri’s applicability across various practical scenarios.

### Implementation and Project Structure

The Kolibri core is implemented in C (conforming to the C11 standard) with a focus on efficiency and compactness. This low-level implementation can be compiled for various target environments; in particular, the same core codebase can be compiled to WebAssembly, allowing Kolibri to run natively in a web browser. The system’s web-based user interface is built with the React framework (JavaScript/TypeScript) and interacts with the core through WebAssembly calls (for example, to visualize memory or send commands). To simplify deployment, the core avoids external dependencies: the only notable external component is the lightweight json-c library, used for JSON parsing and generation.

The project is organized in a classic “backend + frontend” structure. Below is a simplified overview of the repository layout:

```
Project/
├── CMakeLists.txt          # build configuration for CMake
├── Makefile                # Makefile for alternative build
├── backend/                # backend core (Kolibri engine)
│   └── src/                # C source code for the core
├── frontend/               # frontend UI (web interface)
│   └── src/                # source code for UI components (React)
├── logs/                   # logs of experiments and runs
├── node_10000_memory.json  # example: memory dump of node 10000
├── node_10000_rules.json   # example: rules dump of node 10000
└── ...                     # other files and directories
```

### Experiments

A series of experiments was conducted in macOS/Linux environments to validate the Kolibri concept. During these tests, both single Kolibri nodes and groups of nodes in a cluster configuration were launched, with extensive logging enabled. Various aspects were measured, including performance (formula execution times, CPU/memory load) and stability (e.g., graceful shutdown of processes when stopping the cluster), and any compilation or runtime errors were tracked for troubleshooting.

In one experiment, multiple Kolibri nodes were run concurrently to test the knowledge-sharing mechanism via Kolibri Chain. The logs confirmed that formulas (knowledge) were successfully synchronized across nodes, and also revealed underlying OS-imposed limits on the number of parallel processes (for instance, log messages like “fork: Resource temporarily unavailable” indicated exhaustion of process limits). These observations guided adjustments to the cluster scaling parameters.

Additionally, a web-based deployment of Kolibri was tested: the core, compiled to WASM, was loaded in a simple HTML page providing a chat interface. This demonstrated that Kolibri can function as a standalone Progressive Web App accessible directly in a browser with no server component, highlighting the portability of the approach. In parallel, visualization components were developed on the front-end (NodeGraph, FractalMemory, RuleEditor, BrainAnalytics) to display the AI’s memory state, formula evolution, and other aspects in real time. These tools greatly aided in debugging and understanding the system’s internal processes during the experiments.

### Results

The following key results and milestones have been achieved in the development of Kolibri:

1. The formula-fractal approach to AI (code-named NumeriFold) has been formulated and experimentally validated. This approach uses decimal pulses as the basis of representation, a “formula genome” concept for memory, and evolutionary selection of knowledge in place of gradient-based training.
2. Prototypes of the Kolibri core have been implemented in C and successfully integrated into a browser environment via WebAssembly; concurrently, the main components of the user interface have been developed for visualization and interaction with the system.
3. A logging process for formulas and metrics has been established: all experiments are recorded, enabling comparison of different configurations and algorithms. These logs form the basis for further analysis of the approach’s effectiveness.
4. The system’s compatibility with PWA/Canvas technologies has been demonstrated (the web interface can operate offline via caching), and Kolibri’s capability to scale out to a cluster of multiple nodes exchanging knowledge has been shown.
5. A foundation has been laid for the formal write-up and protection of this work: the accumulated materials are being used in the preparation of a scientific article and for asserting intellectual property rights on the invention.

### Limitations and Future Work

Despite the progress to date, the current state of Kolibri has several limitations that point to directions for future work:

- **Benchmark Validation:** The approach has yet to be tested on standard benchmark tasks (e.g., mathematical problem solving, natural language understanding, code generation). As a next step, we plan to establish a set of reproducible test tasks to evaluate Kolibri’s performance against traditional methods.
- **Formal Specification:** It is necessary to develop a formal specification for Kolibri OS and clearly define the interfaces between the system’s modules. This will enhance reliability, facilitate collaborative development, and help in the eventual certification of the technology.
- **Automation and Analytics:** Future research will focus on further automating the evolution of formulas. This includes implementing more advanced mutation/crossover operators and developing enhanced visualization analytics to observe and explain the dynamics of the fractal memory over time. For example, an interactive graphical monitor is envisioned to show how Kolibri nodes “think” and evolve their knowledge in real-time.

### Conclusion

Kolibri demonstrates a novel perspective on artificial intelligence, combining discrete fractal logic with evolutionary learning principles. Preliminary experiments confirm the feasibility and promise of the proposed approach. Ongoing efforts will expand the system’s functionality, gather performance data on real-world tasks, and provide a formal description of the method for the scientific community. It is anticipated that Kolibri could serve as the foundation for interpretable and efficient AI systems capable of learning in situ (on local devices where data resides) without the need for large-scale models or cloud-based resources.

---

## 中文版本

**Kolibri：基于十进制脉冲、公式记忆、分形层次结构和分布式学习的集成AI系统**

**作者：** 科丘罗夫·弗拉季斯拉夫·叶夫根涅维奇（Kochurov Vladislav Evgenievich）  
**日期：** 2025年9月23日  
**地点：** 荷兰阿姆斯特丹

### 摘要

本文介绍了 Kolibri 人工智能（亦称 Kolibri Nano 或 NumeriFold）的概念及其演进：该方法从分形的十进制逻辑（0–9 序列）和公式记忆出发，发展到采用 C 语言和 WebAssembly 实现核心、Canvas/PWA Web 界面，以及节点集群部署等实证实验。Kolibri 的方法论以搜索、变异和选择短小的可执行公式取代训练大型含权重矩阵的神经网络模型，从而实现本地化学习（在各独立节点上）并提供可解释的知识表示。本文按照学术论文格式进行组织，包括引言、方法学、体系结构、实验、结果和未来发展计划等部分。

### 引言

Kolibri AI 是一种集成的智能系统，其基本“思维”单元用十进制标记（0 到 9 的数字）来表示。每个数字包含10个嵌套的子数字，形成一个分形层次结构。在该层次的各级，上一级通过聚合下一级数字标记的“投票”来形成对输入的共识性解释。Kolibri 用简短的公式（可执行微程序）而非神经网络的分布式权重来编码知识。2025年的系统开发目标包括：实现基于 C 的核心并编译为 WASM 以验证其可行性，构建基于 Web 的用户界面并支持离线模式（PWA），测试多个 Kolibri 节点组成集群时的可扩展性，以及对该方法进行科学形式的描述和验证。与依赖庞大参数和高算力的经典神经网络模型不同，Kolibri 方法旨在提供一种轻量且可解释的深度学习替代方案。

### 方法学

Kolibri 综合运用了分形符号逻辑和进化算法的思想。以下列出了系统的主要工作原理：

1. **十进制标记与投票：** 将输入数据流转换为 0–9 范围的脉冲（十进制标记）。在分形层次结构的每个层级，这些“投票”都会被聚合，形成对输入的集体解释或决策。
2. **公式记忆：** 不使用权重参数存储知识，而采用简短的可执行公式（微程序）。每个公式根据其适应度（对当前任务的有用程度）和复杂度进行评估，从而鼓励找到简洁且具泛化能力的解。
3. **进化学习：** 系统的记忆库不断随时间进化。在每个循环中，会生成新的候选公式（随机产生或由现有公式重组）并对其进行变异，然后根据设定的指标对公式进行选择，保留表现最佳的一批。通过这种方式，Kolibri 根据经验调整其“公式基因组”，性能逐步提升。
4. **本地化：** Kolibri 核心使用低级 ANSI C 实现，具有效率高、占用小的特点。训练和推理均在本地进行——即在单个进程或设备上完成（也可以将核心编译为 WebAssembly 模块，直接在浏览器或边缘设备上运行）。
5. **最小依赖：** 实现过程中尽量避免使用外部库。仅在必要时采用轻量级组件（例如用于 JSON 解析的 json-c 库）。这种设计提升了 Kolibri 在不同平台上的可移植性，并简化了部署流程。
6. **日志记录：** 系统对产生的每个“想法”（候选公式及其指标）都进行详细的日志记录。详尽的日志便于分析学习过程，有助于调试，并确保实验具有可重现性以供验证。

**算法1：Kolibri 中的公式进化搜索过程（伪代码）**

```
初始化一组随机公式作为种群 P
while （未达到终止条件）:
    计算 P 中每个公式的适应度
    选择适应度最高的部分公式
    对选中的公式进行变异和重组以生成新公式
    用新公式替换 P 中适应度最低的公式
return 找到的最优公式（或公式集）
```

### 应用实例

下面用一个简单的例子来说明上述方法。假设需要发现一个数字序列（例如 3，9，27，……）中的规律。Kolibri 系统会将这些数据点转换为十进制脉冲标记，并运用其进化搜索机制来生成和测试候选公式假设。最终，演化产生的某个公式可能是 `f(x) = 3 × 3^x`，该公式与给定序列完全吻合（当 `x=0` 时输出 3，`x=1` 时输出 9，`x=2` 时输出 27，以此类推）。这个实例展示了 Kolibri 如何自动地从数据中发现公式关系，并给出人类可读的解释模型（公式），这有别于神经网络“黑箱”式的模型。

### 体系结构

Kolibri AI 系统的体系结构由多个关键模块组成，它们协同工作：

- **Digit Pulse Transducer（数字脉冲转换器）：** 将输入信号转换为 0–9 的脉冲序列，即将原始数据十进制标记化，供系统后续处理。
- **Fractal Induction（分形归纳模块）：** 在分形存储层级上生成新公式并优化现有公式。该模块实现了跨分形记忆结构展开和充实知识的机制。
- **Rule/Formula Engine（规则/公式引擎）：** 执行公式（规则），收集其执行统计信息，并计算每个公式的适应度分值。该引擎在系统内部实现了“假设 → 测试 → 评估”的循环。
- **Kolibri Chain（微型区块链）：** 用作知识分类账：每条公式都带有加密签名记录在链式区块结构中。这种设计使得不同 Kolibri 节点间可以验证公式来源，并在分布式环境中共享经过验证的知识。
- **Canvas/PWA UI（Canvas PWA 用户界面）：** 基于 Canvas 的渐进式 Web 应用界面，用于可视化分形记忆、公式图谱和规则，并允许用户与系统进行交互；通过 PWA 缓存支持离线模式。
- **WASM 托管：** 将 Kolibri 核心从 C 编译为 WebAssembly 模块的能力。借此可以在 Web 浏览器或静态站点（如 GitHub Pages）上直接运行 Kolibri“大脑”，无需服务器，从而简化了部署和测试。
- **集群/节点：** 支持多进程或多机部署，在该配置下，多个位 Kolibri 节点并行运行。系统提供了监控各节点状态和在节点间交换消息/公式的机制（利用 Kolibri Chain 进行知识同步）。
- **Kolibri OS（Kolibri 操作系统）：** 专用的软件环境（执行层），用于便捷部署和管理 Kolibri 节点。本质上，它相当于一个操作框架，为分布式智能体提供任务调度、资源管理、组件通信等服务。
- **集成：** Kolibri 的外部服务和应用生态集成。例如：通过 GitHub 进行协同开发和代码托管，借助 Telegram 机器人实现与 AI 的对话交互，利用 EstimateCraft 平台对结果进行自动评估等。这些集成展示了 Kolibri 在各种实际场景下的适用性。

### 实现与项目结构

Kolibri 核心采用 C 语言实现（符合 C11 标准），注重效率和精简。这种低级实现可以针对不同环境进行编译；特别地，相同的核心代码库可以编译为 WebAssembly 模块，使 Kolibri 能够直接在 Web 浏览器中运行。系统的 Web 前端界面基于 React 框架（JavaScript/TypeScript），通过 WebAssembly 接口与核心交互（例如，用于内存可视化或发送指令）。为简化部署，核心尽可能避免外部依赖：唯一显著的依赖是轻量级的 json-c 库（用于 JSON 数据的解析和生成）。

整个项目按经典的“后端 + 前端”结构组织。以下是项目目录结构的简要示例：

```
Project/
├── CMakeLists.txt          # CMake 构建配置
├── Makefile                # Makefile 构建脚本
├── backend/                # 后端核心（Kolibri 引擎）
│   └── src/                # 核心的 C 源码
├── frontend/               # 前端界面
│   └── src/                # 界面组件源代码 (React)
├── logs/                   # 实验日志文件
├── node_10000_memory.json  # 示例：节点10000的内存转储
├── node_10000_rules.json   # 示例：节点10000的规则转储
└── ...                     # 其他文件和目录
```

### 实验

我们在 macOS/Linux 环境下进行了系列实验，以验证 Kolibri 概念。在这些测试中，同时启动了单个 Kolibri 节点和由多个节点组成的集群，并开启了详尽的日志记录。实验测量了多方面性能，例如性能指标（公式执行时间、CPU/内存占用）和稳定性（如停止集群时进程的正确终止），并跟踪了任何编译或运行时错误用于故障排查。

在其中一次实验中，运行了多个 Kolibri 节点以测试通过 Kolibri Chain 进行知识共享的机制。日志确认，各节点间成功同步了公式（知识）；同时也暴露了操作系统对并发进程数的限制（例如，日志中出现 “fork: Resource temporarily unavailable” 之类的错误提示，表明进程资源耗尽）。这些观察促使我们调整了集群扩展的参数。

此外，我们测试了 Kolibri 的Web 部署：将核心编译为 WASM 后载入一个简易的聊天网页界面。结果表明 Kolibri 可以作为独立的渐进式 Web 应用（PWA）运行在浏览器中，无需服务器组件，进一步体现了该方法的可移植性。并行地，我们在前端开发了可视化组件（如 NodeGraph、FractalMemory、RuleEditor、BrainAnalytics），用于实时展示 AI 的记忆状态、公式进化等内部过程。这些工具极大地方便了实验期间对系统内部过程的调试和理解。

### 结果

Kolibri 的开发取得了以下关键成果和里程碑：

1. 已经形成并初步验证了公式-分形方法论（代号 NumeriFold）：该方法以十进制脉冲作为表示基础，引入“公式基因组”概念来构建记忆，并以进化选择知识取代梯度下降训练。
2. 完成了 Kolibri 核心的 C 语言原型实现，并通过 WebAssembly 成功集成至浏览器环境；同时开发了主要的用户界面组件，以实现对系统的可视化和交互。
3. 建立了日志记录机制来记录公式和指标：所有实验过程均被详实记录，这使得不同配置和算法的对比成为可能。这些日志数据为进一步分析该方法的有效性提供了基础。
4. 演示了系统与 PWA/Canvas 技术的兼容性（Web 界面可通过缓存离线运行），并展示了 Kolibri 在由多个节点组成的集群中扩展运行、共享知识的能力。
5. 为正式撰写科学论文和保护本发明的知识产权奠定了基础：累积的实验材料已用于撰写学术文章，并可作为证明本方法原创性的依据。

### 局限性与未来工作

尽管取得了上述进展，Kolibri 当前的开发状态仍存在一些局限，指出了未来工作的方向：

- **基准测试：** 尚需在标准基准任务上对该方法进行验证（例如数学问题求解、自然语言理解、代码生成等）。下一步计划构建一套可重现的测试任务，以评估 Kolibri 相对于传统方法的性能表现。
- **形式化规范：** 有必要为 Kolibri OS 及各模块接口制定正式的规范，以巩固系统架构。这将提高系统可靠性，便于协作开发，并有助于未来对该技术进行认证。
- **自动化与分析：** 后续研究将着重于公式进化过程的自动化。这包括实现更先进的变异/交叉操作符，以及开发更强大的可视化分析工具，以观察并解释分形记忆随时间的动态演化。例如，我们设想构建一个交互式图形监控器，用于实时显示 Kolibri 节点如何“思考”和演化其知识。

### 结论

综上所述，Kolibri 展示了一种融合分形符号推理和进化学习的新型人工智能方法。初步实验结果证明了该概念的可行性和潜力。我们将继续拓展系统功能，在真实任务上收集性能数据，并为该方法提供正式的学术描述。展望未来，Kolibri 有望成为构建可解释且高效的 AI 系统的基础，这类系统能够在本地（数据和用户所在之处）学习，无需大型模型或云端资源。

---

*Последнее обновление: 23 сентября 2025 года.*
