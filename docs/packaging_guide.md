# Kolibri Packaging Guide / Руководство по упаковке / 发布打包指南

## Containers / Контейнеры / 容器

| Component | Dockerfile | Image Tag |
|-----------|------------|-----------|
| Backend API | `backend/Dockerfile` | `ghcr.io/kolibri/kolibri-backend:<version>` |
| Knowledge Indexer | `apps/Dockerfile.indexer` | `ghcr.io/kolibri/kolibri-indexer:<version>` |
| Frontend + wasm | `frontend/Dockerfile` | `ghcr.io/kolibri/kolibri-frontend:<version>` |

Build locally:
```bash
docker build -f backend/Dockerfile -t ghcr.io/kolibri/kolibri-backend:dev .
docker build -f apps/Dockerfile.indexer -t ghcr.io/kolibri/kolibri-indexer:dev .
docker build -f frontend/Dockerfile -t ghcr.io/kolibri/kolibri-frontend:dev .
```

## ISO Images / ISO-образы / ISO 镜像

- Supported architectures: x86 (i686), tested on QEMU and VirtualBox.
- Build with `make iso` or `./scripts/build_iso.sh`.
- CI publishes `build/kolibri.iso` alongside checksums in `deploy/release-manifests/`.
- Kernel-only artefact `build/kolibri.bin` is available when `--kernel-only` flag is used.
- GitHub Actions job `release-bundle` generates signed manifests (`kolibri-release-bundle` artifact) and updates `deploy/release-manifests/`.

## Installers / Установщики / 安装脚本

- Linux: `scripts/deploy_linux.sh` installs containers under `/opt/kolibri`; override images via `--backend-image/--frontend-image` and skip registry pulls with `--skip-pull`.
- macOS: `scripts/deploy_macos.sh` works with Docker Desktop or colima/nerdctl and принимает те же параметры образов.
- Windows: `scripts/deploy_windows.ps1` orchestrates Docker Desktop deployments; pass `-BackendImage`/`-FrontendImage` to use prebuilt local tags.

### Additional Deliverables

- Python wheel (`core/`) published to PyPI with tag `kolibri-sim`.
- npm package containing wasm bridge published as `@kolibri/wasm-bridge`.
- Homebrew tap formula template stored in `deploy/homebrew/kolibri.rb` (TBD).
- C/C++ SDK: статика `libkolibri_core.a` и `libkolibri_wasm.a`. Пример использования в CMake:
  ```cmake
  find_package(Threads REQUIRED)
  add_executable(my_node main.c)
  target_include_directories(my_node PRIVATE ${KOLIBRI_SOURCE_DIR}/backend/include)
  target_link_libraries(my_node PRIVATE kolibri_core Threads::Threads OpenSSL::Crypto SQLite::SQLite3)
  ```
  Для ручной линковки: `gcc main.c -Ibackend/include -Lbuild -lkolibri_core -lssl -lsqlite3 -lpthread`.
- На macOS укажите корень Homebrew: `cmake -DOPENSSL_ROOT_DIR=$(brew --prefix openssl@3) ...`, чтобы CMake создал цель `OpenSSL::Crypto`.

Document release-specific commands and publish updates via `CHANGELOG.md`.
