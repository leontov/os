# Kolibri Server API

Колибри предоставляет единый сервис `kolibri_server`, который открывает HTTP и gRPC
интерфейсы поверх ядра. Сервер запускается автоматически командой `./kolibri.sh up`
и по умолчанию слушает `0.0.0.0:8080`. Для изменения порта установите переменную
`KOLIBRI_SERVER_PORT` перед запуском.

## Общие сведения

* **Авторизация.** Не требуется.
* **Формат данных.** HTTP интерфейс использует `application/json`. gRPC-вызовы
  транслируются поверх HTTP/1.1 с типом `application/grpc+json`.
* **Идентификатор узла.** Все ответы содержат состояние одного ядра, которое
  разделяет память и журнал с CLI (`kolibri_node`).

## HTTP endpoints

| Метод | Путь        | Назначение                               |
|-------|-------------|-------------------------------------------|
| POST  | `/teach`    | Добавить обучающий пример и выполнить 8 поколений эволюции. |
| POST  | `/ask`      | Получить ответ текущей лучшей формулы.   |
| POST  | `/feedback` | Применить оценку к последнему ответу (`delta` > 0 поощряет). |
| POST  | `/note`     | Сохранить текстовый импульс в память.    |
| GET   | `/status`   | Сводка состояния: число примеров, наличие ответа, описание формулы. |
| GET   | `/healthz`  | Проверка живости (возвращает `ok`).       |

### Примеры запросов

#### POST /teach
```http
POST /teach HTTP/1.1
Content-Type: application/json

{"input": 7, "target": 49, "note": "квадрат"}
```
Ответ:
```json
{"status":"ok","examples":12,"generations":8}
```

#### POST /ask
```http
POST /ask HTTP/1.1
Content-Type: application/json

{"input": 5}
```
Ответ:
```json
{"status":"ok","output":25,"description":"(x*x)+0"}
```

#### POST /feedback
```http
POST /feedback HTTP/1.1
Content-Type: application/json

{"delta": 0.2, "rating": "good"}
```
Ответ: `{ "status": "ok" }`. Если нет последнего ответа, сервис вернёт `409`.

#### GET /status
```json
{
  "node_id": 1,
  "examples": 12,
  "has_last_answer": true,
  "best_formula": "(x*x)+0"
}
```

## gRPC маршруты

Сервер публикует gRPC-совместимые пути, совместимые с именованием
`kolibri.Runtime/*`. Запросы отправляются методом `POST` на один из путей ниже и
передаются в формате JSON. Заголовок `Content-Type` должен содержать
`application/grpc+json` (сервер принимает и `application/json`).

| gRPC метод                   | HTTP путь                              | Тело запроса                   |
|------------------------------|----------------------------------------|--------------------------------|
| `kolibri.Runtime/Teach`      | `/grpc/kolibri.Runtime/Teach`          | `{ "input": <int>, "target": <int>, "note": "..." }` |
| `kolibri.Runtime/Ask`        | `/grpc/kolibri.Runtime/Ask`            | `{ "input": <int> }`         |
| `kolibri.Runtime/Feedback`   | `/grpc/kolibri.Runtime/Feedback`       | `{ "delta": <float>, "rating": "..." }` |
| `kolibri.Runtime/Note`       | `/grpc/kolibri.Runtime/Note`           | `{ "text": "..." }`         |

Ответы совпадают с HTTP API, но возвращаются с типом `application/grpc+json`.

## Обработка ошибок

* `400 Bad Request` — отсутствуют обязательные поля или неверный формат JSON.
* `409 Conflict` — состояние не позволяет выполнить операцию (например, нет
  ответа для оценки или буфер примеров заполнен).
* `500 Internal Server Error` — внутренняя ошибка при вычислении формулы.
* `413 Payload Too Large` — запрос превышает 8 KiB.

## Сценарий orchestrations

Скрипт `kolibri.sh up` теперь собирает проект, запускает сервер в фоне и затем
стартует CLI. Логи сервера пишутся в `build/kolibri_server.log`. Завершение CLI
останавливает сервис автоматически.
