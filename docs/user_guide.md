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

