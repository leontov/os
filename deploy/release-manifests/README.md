# Release Manifests

Release manifests provide a signed inventory of shipped artifacts for each
Kolibri version.

- Create a subdirectory per version, e.g. `v1.2.0/`.
- Inside, store `manifest.json` with fields:
  ```json
  {
    "version": "v1.2.0",
    "date": "2025-01-15T12:00:00Z",
    "artifacts": [
      {
        "name": "kolibri_node-linux-x86_64.tar.gz",
        "sha256": "<hex>",
        "signature": "kolibri_node-linux-x86_64.tar.gz.sig"
      }
    ]
  }
  ```
- Include detached signatures for each artifact using GPG or Sigstore.
- CI job `release-bundle` publishes `release-manifest.json` and signatures as an artifact (`kolibri-release-bundle`)—copy its contents into the versioned directory when preparing the release PR.
- Commit manifests as part of the release PR so customers can verify integrity.
