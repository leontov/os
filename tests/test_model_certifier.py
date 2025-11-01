import json
from pathlib import Path

from scripts import model_certifier


def test_certify_flags_energy_excess() -> None:
    input_data = model_certifier.CertificationInput(
        name="kolibri-model",
        accuracy=0.82,
        fairness=0.78,
        energy_j=7.5,
        latency_ms=120,
    )
    report = model_certifier.certify(input_data, thresholds={"energy_j": 6.5})
    assert report.approved is False
    assert "энергоэффективности" in report.reasons[0]


def test_cli_outputs_json(tmp_path: Path) -> None:
    payload = {"name": "model", "accuracy": 0.9, "fairness": 0.85, "energy_j": 5.0, "latency_ms": 100}
    report_path = tmp_path / "report.json"
    output_path = tmp_path / "summary.json"
    report_path.write_text(json.dumps(payload), encoding="utf-8")

    exit_code = model_certifier.main([str(report_path), "--output", str(output_path)])
    assert exit_code == 0
    data = json.loads(output_path.read_text(encoding="utf-8"))
    assert data["approved"] is True
    assert data["reasons"]
