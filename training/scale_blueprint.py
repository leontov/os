"""План масштабирования моделей до 100 млрд параметров и выше."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping


@dataclass(frozen=True, slots=True)
class ModelScale:
    """Целевые характеристики модели."""

    name: str
    parameters_billions: float
    context_length: int
    modalities: tuple[str, ...]
    target_quality: float

    @property
    def parameters_count(self) -> int:
        """Количество параметров в абсолютном выражении."""

        return int(self.parameters_billions * 1_000_000_000)

    @property
    def memory_requirement_gb(self) -> float:
        """Оценка пикового потребления памяти (12 байт на параметр)."""

        return self.parameters_billions * 12.0


@dataclass(frozen=True, slots=True)
class ComputeCluster:
    """Описание вычислительного кластера для обучения."""

    name: str
    gpu_type: str
    gpu_count: int
    memory_gb_per_gpu: float
    tflops_per_gpu: float
    power_kw: float
    efficiency: float = 0.72

    @property
    def total_memory_gb(self) -> float:
        return self.gpu_count * self.memory_gb_per_gpu

    @property
    def total_tflops(self) -> float:
        return self.gpu_count * self.tflops_per_gpu

    @property
    def petaflop_days_per_day(self) -> float:
        """Производительность в петфлоп-днях за сутки с учётом эффективности."""

        return (self.total_tflops / 1_000.0) * 24.0 * self.efficiency

    @property
    def daily_energy_mwh(self) -> float:
        return self.power_kw * 24.0 / 1_000.0


@dataclass(frozen=True, slots=True)
class TrainingStage:
    """Этап обучения с базовыми вычислительными требованиями."""

    name: str
    base_petaflop_days: float
    target_quality: float
    data_tokens_trillion: float
    reference_parameters_billions: float = 100.0

    def required_petaflop_days(self, model: ModelScale) -> float:
        """Подбор вычислительного бюджета под масштаб модели."""

        ratio = max(1.0, model.parameters_billions / self.reference_parameters_billions)
        return self.base_petaflop_days * ratio


@dataclass(slots=True)
class ScaleBlueprint:
    """Совокупное планирование обучения крупной модели."""

    model: ModelScale
    cluster: ComputeCluster
    stages: tuple[TrainingStage, ...]

    def validate_memory(self) -> None:
        if self.cluster.total_memory_gb < self.model.memory_requirement_gb:
            raise ValueError(
                "Недостаточно памяти GPU: требуется"
                f" {self.model.memory_requirement_gb:.1f} ГБ,"
                f" доступно {self.cluster.total_memory_gb:.1f} ГБ"
            )

    def total_petaflop_days(self) -> float:
        return sum(stage.required_petaflop_days(self.model) for stage in self.stages)

    def total_training_days(self) -> float:
        return self.total_petaflop_days() / self.cluster.petaflop_days_per_day

    def total_energy_mwh(self) -> float:
        return self.total_training_days() * self.cluster.daily_energy_mwh

    def modality_coverage(self, required: Iterable[str]) -> float:
        required_set = {item.lower() for item in required}
        if not required_set:
            return 1.0
        actual = {item.lower() for item in self.model.modalities}
        return len(required_set & actual) / len(required_set)

    def generate_report(self, *, required_modalities: Iterable[str] | None = None) -> dict[str, float | int | str]:
        """Собрать агрегированный отчёт по плану."""

        self.validate_memory()
        coverage = (
            self.modality_coverage(required_modalities)
            if required_modalities is not None
            else 1.0
        )
        return {
            "model_name": self.model.name,
            "parameters": self.model.parameters_count,
            "target_quality": self.model.target_quality,
            "context_length": self.model.context_length,
            "total_petaflop_days": round(self.total_petaflop_days(), 2),
            "estimated_days": round(self.total_training_days(), 2),
            "energy_mwh": round(self.total_energy_mwh(), 2),
            "modality_coverage": round(coverage, 3),
        }


def build_blueprint_from_mapping(config: Mapping[str, object]) -> ScaleBlueprint:
    """Создать план из словаря (например, JSON)."""

    model_raw = config.get("model")
    cluster_raw = config.get("cluster")
    stages_raw = config.get("stages")
    if not isinstance(model_raw, Mapping) or not isinstance(cluster_raw, Mapping):
        raise ValueError("Ожидались секции model и cluster")
    if not isinstance(stages_raw, Iterable):
        raise ValueError("Секция stages должна быть списком")

    model = ModelScale(
        name=str(model_raw.get("name", "Unnamed")),
        parameters_billions=float(model_raw.get("parameters_billions", 100.0)),
        context_length=int(model_raw.get("context_length", 8192)),
        modalities=tuple(str(item) for item in model_raw.get("modalities", ("text",))),
        target_quality=float(model_raw.get("target_quality", 0.75)),
    )

    cluster = ComputeCluster(
        name=str(cluster_raw.get("name", "default-cluster")),
        gpu_type=str(cluster_raw.get("gpu_type", "H100")),
        gpu_count=int(cluster_raw.get("gpu_count", 1024)),
        memory_gb_per_gpu=float(cluster_raw.get("memory_gb_per_gpu", 80.0)),
        tflops_per_gpu=float(cluster_raw.get("tflops_per_gpu", 900.0)),
        power_kw=float(cluster_raw.get("power_kw", 45_000.0)),
        efficiency=float(cluster_raw.get("efficiency", 0.72)),
    )

    stages = tuple(
        TrainingStage(
            name=str(item.get("name", f"stage-{idx}")),
            base_petaflop_days=float(item.get("base_petaflop_days", 1_000.0)),
            target_quality=float(item.get("target_quality", 0.7)),
            data_tokens_trillion=float(item.get("data_tokens_trillion", 1.0)),
            reference_parameters_billions=float(
                item.get("reference_parameters_billions", model.parameters_billions)
            ),
        )
        for idx, item in enumerate(stages_raw)
        if isinstance(item, Mapping)
    )
    if not stages:
        raise ValueError("Не задано ни одного этапа обучения")

    return ScaleBlueprint(model=model, cluster=cluster, stages=stages)
