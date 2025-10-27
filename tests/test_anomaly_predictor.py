import json
from pathlib import Path

from scripts import anomaly_predictor


def test_detect_anomalies_detects_spike() -> None:
    series = anomaly_predictor.MetricSeries(
        service="api",
        metric="latency",
        timestamps=("t1", "t2", "t3", "t4"),
        values=(100, 105, 250, 110),
    )
    anomalies = anomaly_predictor.detect_anomalies(series, threshold=1.0)
    assert anomalies and anomalies[0].index == 2
    forecast = anomaly_predictor.forecast_capacity(series, upper=200, lower=50)
    assert forecast.requires_scale_up is True
    assert forecast.requires_scale_down is False


def test_cli_outputs_recommendations(tmp_path: Path) -> None:
    payload = [
        {
            "service": "api",
            "metric": "latency",
            "timestamps": ["t1", "t2", "t3"],
            "values": [150, 170, 210],
        }
    ]
    metrics_path = tmp_path / "metrics.json"
    output_path = tmp_path / "report.json"
    metrics_path.write_text(json.dumps(payload), encoding="utf-8")

    exit_code = anomaly_predictor.main([
        str(metrics_path),
        "--threshold",
        "0.5",
        "--upper",
        "180",
        "--lower",
        "80",
        "--output",
        str(output_path),
    ])

    assert exit_code == 0
    report = json.loads(output_path.read_text(encoding="utf-8"))
    assert report[0]["forecast"]["scale_up"] is True
    assert report[0]["anomalies"]
