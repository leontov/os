# Kolibri Troubleshooting Guide / Руководство по устранению неполадок

## Backend Fails to Start / Backend не стартует
- **Symptom:** Container exits with code 1.  
  **Action:** Check `docker logs kolibri-backend`. Ensure `genome.dat` exists and
  matches checksum; rerun with `--verify-genome`.

- **Symptom:** `Ошибка сокета` in logs.  
  **Action:** Port 4050 in use. Free the port or change `--listen` flag.

## Frontend Unavailable / Frontend недоступен
- **Symptom:** Browser shows 502/Bad Gateway.  
  **Action:** Confirm backend container is healthy, restart frontend `docker restart kolibri-frontend`.

- **Symptom:** wasm download fails (`kolibri.wasm 404`).  
  **Action:** Ensure `./scripts/build_wasm.sh` ran during release; redeploy frontend image.

## Knowledge Search Issues / Проблемы с поиском знаний
- **Symptom:** No results for fresh documents.  
  **Action:** Rebuild index `kolibri_indexer build --output /var/lib/kolibri/knowledge docs data`.

- **Symptom:** High latency >5s.  
  **Action:** Verify index fits in memory; consider sharding knowledge service.

## Performance Degradation / Снижение производительности
- Collect traces: set `KOLIBRI_TRACE=1`, reproduce, analyse JSONL output.
- Check CPU/memory via `docker stats`; scale horizontally if utilisation >80%.
- Run soak test `kolibri_sim soak --minutes 5` to validate stability.

## ISO Boot Issues / Проблемы с загрузкой ISO
- **Symptom:** Black screen in VM.  
  **Action:** Use BIOS mode (legacy); UEFI not supported yet.

- **Symptom:** Kernel panic referencing missing genome.  
  **Action:** Ensure `build/kolibri.bin` packaged with latest genome snapshot.

## Support Escalation / Эскалация
- Gather logs, manifests, and steps to reproduce.
- Open ticket via `support@kolibri.example` with severity classification.

