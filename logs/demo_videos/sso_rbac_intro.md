# SSO & RBAC onboarding

**Аудитория:** Security, Platform

## План
1. Показать `/api/v1/sso/saml/metadata` в браузере.
2. Отправить пример `SAMLResponse` через `curl` и получить токен.
3. Вызвать `/api/v1/infer` с валидным Bearer-токеном.

## Команды и логи
```
curl -s http://localhost:8000/api/v1/sso/saml/metadata
curl -s -X POST http://localhost:8000/api/v1/sso/saml/acs -d @fixtures/sso_response.txt
curl -s -H "Authorization: Bearer <token>" -X POST http://localhost:8000/api/v1/infer -d '{"prompt":"status"}'
```
