# KolibriScript Интерпретатор / KolibriScript Interpreter / KolibriScript 解释器

## Русский

KolibriScript — это легкий сценарный язык для управления ядром Kolibri на русском языке. Интерпретатор
расположен в `backend/src/script.c` и предоставляет API `ks_execute_text`, позволяющий запускать сценарии
из строк. Базовые возможности версии v0.1:

- Ключевые слова `начало` и `конец` ограничивают жизненный цикл сценария.
- Объявление переменных: `переменная имя = выражение` сохраняет числовое значение (тип `double`).
- Присваивание: `установить имя = выражение` изменяет значение существующей переменной.
- Вывод: `показать "строка"` печатает строку, а `показать выражение` выводит вычисленный результат.
- Условия: `если <выражение> тогда ... иначе ... конецесли` поддерживает вложенные блоки и операции `>`, `<`, `>=`, `<=`, `==`, `!=`.
- Все выражения поддерживают арифметику `+`, `-`, `*`, `/`, круглые скобки и ссылки на переменные.

Команда `:script путь` в `kolibri_node` считывает сценарий из файла, передает его в интерпретатор и пишет
stdout-вывод в консоль узла. Успешное выполнение фиксируется событием `SCRIPT` в цифровом геноме узла.

Пример сценария:

```
начало
переменная x = 2
переменная y = x * 4
если y >= 8 тогда
    показать "kolibri"
иначе
    показать "ошибка"
конецесли
показать y
конец
```

## English

KolibriScript is a lightweight scripting language that drives the Kolibri core in Russian. The interpreter
(`backend/src/script.c`) exposes `ks_execute_text`, which executes scripts supplied as UTF-8 strings. The v0.1
feature set includes:

- `начало` and `конец` keywords delimit the script lifecycle.
- Variable declaration: `переменная name = expression` stores floating point values (`double`).
- Assignment: `установить name = expression` updates an existing symbol.
- Output: `показать "text"` prints a literal string, while `показать expression` prints the evaluated result.
- Conditionals: `если <expression> тогда ... иначе ... конецесли` with nested blocks and comparison operators
  `>`, `<`, `>=`, `<=`, `==`, `!=`.
- Expressions support arithmetic `+`, `-`, `*`, `/`, parentheses, and variable references.

The `:script <path>` command inside `kolibri_node` loads a KolibriScript file, executes it with the interpreter,
and streams stdout back to the console. Successful runs append a `SCRIPT` event to the node’s digital genome.

Example script:

```
начало
переменная x = 2
переменная y = x * 4
если y >= 8 тогда
    показать "kolibri"
иначе
    показать "ошибка"
конецесли
показать y
конец
```

## 中文

KolibriScript 是 Kolibri 内核的轻量级脚本语言，所有关键字使用俄语。解释器位于
`backend/src/script.c`，通过 `ks_execute_text` 函数执行 UTF-8 字符串脚本。v0.1 版本提供：

- `начало` 与 `конец` 关键词标记脚本的开始与结束。
- 变量声明：`переменная 名称 = 表达式` 存储 `double` 类型的数值。
- 赋值：`установить 名称 = 表达式` 更新已存在的变量。
- 输出：`показать "字符串"` 输出文本，`показать 表达式` 输出计算结果。
- 条件：`если <表达式> тогда ... иначе ... конецесли` 支持嵌套和比较运算符 `>`, `<`, `>=`, `<=`, `==`, `!=`。
- 表达式支持 `+`, `-`, `*`, `/` 算术、圆括号以及变量引用。

`kolibri_node` 内的 `:script <路径>` 指令会读取脚本文件并调用解释器执行，标准输出直接返回到控制台，成功执行后会在数字基因组中追加 `SCRIPT` 事件。

示例脚本：

```
начало
переменная x = 2
переменная y = x * 4
если y >= 8 тогда
    показать "kolibri"
иначе
    показать "ошибка"
конецесли
показать y
конец
```
