# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Formalised public interface overview in `docs/public_interfaces.md`.
- Documented semantic versioning and changelog policy in `docs/developer_guide.md`.
- Multi-stage GitHub Actions pipeline with cosign signing, Docker packaging smoke tests, and release bundle assembly (`.github/workflows/ci.yml`).
- Deployment scripts for Linux/macOS/Windows with image override support (`scripts/deploy_*.sh`).
- Packaging, security, operations, and ops-briefing documentation (`docs/packaging_guide.md`, `docs/security_policy.md`, `docs/service_playbook.md`, `docs/ops_briefing.md`, etc.).
- Template release manifest for `v0.1.0` and guidance in `deploy/release-manifests/`.
