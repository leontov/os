# Kolibri User Guide / Руководство пользователя Kolibri

## 1. Introduction / Введение

Kolibri is a distributed knowledge engine that executes KolibriScript programs
and serves responses via a web UI. This guide helps end users install the stack,
send their first requests, and update the system safely.

Колибри — распределённый движок знаний, исполняющий сценарии KolibriScript и
предоставляющий ответы через веб-интерфейс. Руководство объясняет, как установить
стек, выполнить первые запросы и безопасно обновлять систему.

## 2. Requirements / Требования

- 64-bit Linux, macOS 12+, or Windows 11 with Docker support.
- 4 CPU cores, 8 GB RAM, 10 GB free disk space.
- Internet access to pull container images from `ghcr.io/kolibri`.

## 3. Installation / Установка

### Linux
```bash
git clone https://github.com/kolibri/os.git
./scripts/deploy_linux.sh --version v1.0.0
```

### macOS
```bash
./scripts/deploy_macos.sh --version v1.0.0 --runtime docker
```

### Windows
```powershell
.\scripts\deploy_windows.ps1 -Version v1.0.0
```

After deployment, open `http://localhost:8080` in your browser.

## 4. Getting Started / Первые шаги

1. Use the web UI to enter a question. Kolibri loads known answers and generates
   a response using KolibriScript evolution.
2. Monitor server status via the “System” tab (CPU usage, formula evolution
   progress, last update timestamp).
3. Use `kolibri_node --help` for advanced CLI usage (batch execution, custom
   bootstrap scripts).

## 5. Updating / Обновление

1. Check the latest version in the [changelog](../CHANGELOG.md).
2. Redeploy the containers with the new version tag:
   ```bash
   ./scripts/deploy_linux.sh --version v1.1.0
   ```
3. Verify the health check in the UI shows “Stable” and review release notes in
   the admin panel.

## 6. Feedback & Support / Обратная связь

- Email: `support@kolibri.example`
- Slack: `#kolibri-users`
- GitHub Issues: use the “Support” template for bug reports or feature requests.

## 7. CI/CD Pipeline / Пайплайн CI/CD

The repository provides a dedicated **Beta CI/CD** workflow that mirrors the
production release chain while remaining safe for internal experimentation. The
pipeline runs automatically for every push to the `beta` branch and can also be
triggered on demand from the GitHub Actions tab.

Репозиторий включает выделенный пайплайн **Beta CI/CD**, повторяющий продакшен-
цепочку, но предназначенный для внутренних экспериментов. Он стартует при каждом
коммите в ветку `beta`, а также доступен для ручного запуска на вкладке GitHub
Actions.

### Stages / Этапы

1. **Lint** – launches `ruff`, `pyright`, and `npm run lint` to validate Python
   and frontend style before any builds start.
2. **Tests** – runs `pytest`, configures CMake with Ninja, executes `ctest`, and
   finishes with `npm run test -- --runInBand` so that both server and UI
   regressions are caught early.
3. **Build** – produces ISO/wasm artifacts, builds the Vite frontend, and bakes
   Docker images `kolibri-backend:<tag>` and `kolibri-frontend:<tag>` with
   reproducible SHA256 manifests.
4. **Deploy** – restores the Docker images, executes
   `scripts/deploy_linux.sh --version <tag> --skip-pull`, and captures deployment
   diagnostics for the beta staging environment.

### Observability / Наблюдаемость

- Downloadable artifacts include ISO, wasm, frontend `dist`, and Docker image
  archives for fast rollbacks.
- Deployment steps upload `docker ps` snapshots and container inspection logs to
  help SREs audit beta rollouts.
- Use GitHub Actions → **Beta CI/CD** to monitor each stage, re-run selective
  jobs, or promote a beta tag into the production release pipeline.

### Providing feedback / Передача обратной связи

- Document beta findings in [`docs/beta_feedback.md`](beta_feedback.md) to share
  test coverage, incidents, and UX quotes with the core team.
- Mention the workflow run ID when opening an issue so engineers can retrieve
  associated artifacts.
- Extend the new “Beta feedback triage” support scenario (см. `support/program.py`)
  for structured follow-up and SLA tracking.

