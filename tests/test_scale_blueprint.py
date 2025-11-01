import json
from pathlib import Path

import pytest

from training import (
    ComputeCluster,
    ModelScale,
    ScaleBlueprint,
    TrainingStage,
    build_blueprint_from_mapping,
)
from scripts import scale_blueprint


@pytest.fixture()
def sample_blueprint() -> ScaleBlueprint:
    model = ModelScale(
        name="Kolibri-100B",
        parameters_billions=100.0,
        context_length=16384,
        modalities=("text", "audio", "vision"),
        target_quality=0.82,
    )
    cluster = ComputeCluster(
        name="ultra-cluster",
        gpu_type="H100",
        gpu_count=22,
        memory_gb_per_gpu=96.0,
        tflops_per_gpu=950.0,
        power_kw=3_600.0,
        efficiency=0.78,
    )
    stages = (
        TrainingStage(
            name="pretrain",
            base_petaflop_days=4_200.0,
            target_quality=0.75,
            data_tokens_trillion=12.0,
        ),
        TrainingStage(
            name="alignment",
            base_petaflop_days=650.0,
            target_quality=0.82,
            data_tokens_trillion=1.5,
        ),
    )
    blueprint = ScaleBlueprint(model=model, cluster=cluster, stages=stages)
    blueprint.validate_memory()
    return blueprint


def test_report_contains_scaled_metrics(sample_blueprint: ScaleBlueprint) -> None:
    report = sample_blueprint.generate_report(required_modalities=["text", "vision"])
    assert report["parameters"] == 100_000_000_000
    assert report["modality_coverage"] == 1.0
    assert pytest.approx(report["estimated_days"], rel=0.01) == 12.40
    assert pytest.approx(report["energy_mwh"], rel=0.01) == 1071.03


def test_build_from_mapping_matches_manual(sample_blueprint: ScaleBlueprint) -> None:
    config = {
        "model": {
            "name": "Kolibri-100B",
            "parameters_billions": 100,
            "context_length": 16384,
            "modalities": ["text", "audio", "vision"],
            "target_quality": 0.82,
        },
        "cluster": {
            "name": "ultra-cluster",
            "gpu_type": "H100",
            "gpu_count": 22,
            "memory_gb_per_gpu": 96,
            "tflops_per_gpu": 950,
            "power_kw": 3600,
            "efficiency": 0.78,
        },
        "stages": [
            {
                "name": "pretrain",
                "base_petaflop_days": 4200,
                "target_quality": 0.75,
                "data_tokens_trillion": 12,
            },
            {
                "name": "alignment",
                "base_petaflop_days": 650,
                "target_quality": 0.82,
                "data_tokens_trillion": 1.5,
            },
        ],
    }
    generated = build_blueprint_from_mapping(config)
    assert generated.generate_report() == sample_blueprint.generate_report()


def test_cli_writes_report(tmp_path: Path) -> None:
    config = {
        "model": {"name": "Kolibri-100B"},
        "cluster": {
            "name": "ultra-cluster",
            "gpu_count": 1536,
            "memory_gb_per_gpu": 80,
            "tflops_per_gpu": 900,
            "power_kw": 70000,
        },
        "stages": [
            {"name": "pretrain", "base_petaflop_days": 3500},
            {"name": "alignment", "base_petaflop_days": 500},
        ],
    }
    config_path = tmp_path / "scale.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    output_path = tmp_path / "report.json"

    exit_code = scale_blueprint.main([
        str(config_path),
        "--modalities",
        "text",
        "audio",
        "--output",
        str(output_path),
    ])

    assert exit_code == 0
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["parameters"] == 100_000_000_000
    assert 0.0 < payload["modality_coverage"] <= 1.0
