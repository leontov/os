# Supply chain guardrails

**Аудитория:** DevSecOps

## План
1. Пройтись по `ci.yml` и показать этап генерации SBOM.
2. Запустить `scripts/generate_sbom.py` локально.
3. Подписать wasm-ядро скриптом `scripts/sign_wasm.sh`.

## Команды и логи
```
cat .github/workflows/ci.yml
python scripts/generate_sbom.py --output build/sbom.json
scripts/sign_wasm.sh kolibri.wasm build/kolibri.wasm.sig
```
