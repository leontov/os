"""Lightweight Prometheus-style metrics helpers."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, Iterable, Iterator, List, Protocol, Sequence, Tuple

CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"


@dataclass
class _CounterChild:
    storage: Dict[Tuple[str, ...], float]
    key: Tuple[str, ...]

    def inc(self, amount: float = 1.0) -> None:
        self.storage[self.key] = self.storage.get(self.key, 0.0) + amount


@dataclass
class Counter:
    name: str
    documentation: str
    labelnames: Sequence[str]
    registry: "CollectorRegistry"
    _values: Dict[Tuple[str, ...], float] = field(default_factory=lambda: defaultdict(float))

    def labels(self, **labels: str) -> _CounterChild:
        key = self._normalise(labels)
        return _CounterChild(self._values, key)

    def collect(self) -> List[str]:
        lines = [f"# HELP {self.name} {self.documentation}", f"# TYPE {self.name} counter"]
        for key, value in sorted(self._values.items()):
            label_string = self._format_labels(key)
            lines.append(f"{self.name}{label_string} {value}")
        return lines

    def _normalise(self, labels: Dict[str, str]) -> Tuple[str, ...]:
        if len(labels) != len(self.labelnames):
            raise ValueError("Label cardinality mismatch")
        ordered = []
        for label in self.labelnames:
            if label not in labels:
                raise ValueError(f"Missing label: {label}")
            ordered.append(str(labels[label]))
        return tuple(ordered)

    def _format_labels(self, values: Tuple[str, ...]) -> str:
        if not self.labelnames:
            return ""
        label_pairs = [f'{name}="{value}"' for name, value in zip(self.labelnames, values)]
        return "{" + ",".join(label_pairs) + "}"


@dataclass
class _HistogramChild:
    counts: Dict[Tuple[str, ...], List[float]]
    totals: Dict[Tuple[str, ...], float]
    sums: Dict[Tuple[str, ...], float]
    buckets: Tuple[float, ...]
    key: Tuple[str, ...]

    def observe(self, amount: float) -> None:
        values = self.counts.setdefault(self.key, [0.0 for _ in range(len(self.buckets))])
        placed = False
        for index, bucket in enumerate(self.buckets):
            if amount <= bucket:
                values[index] += 1.0
                placed = True
                break
        if not placed:
            # overflow is accounted via totals only
            pass
        self.totals[self.key] = self.totals.get(self.key, 0.0) + 1.0
        self.sums[self.key] = self.sums.get(self.key, 0.0) + amount


@dataclass
class Histogram:
    name: str
    documentation: str
    labelnames: Sequence[str]
    buckets: Sequence[float]
    registry: "CollectorRegistry"
    _counts: Dict[Tuple[str, ...], List[float]] = field(default_factory=dict)
    _totals: Dict[Tuple[str, ...], float] = field(default_factory=dict)
    _sums: Dict[Tuple[str, ...], float] = field(default_factory=dict)

    def labels(self, **labels: str) -> _HistogramChild:
        key = self._normalise(labels)
        return _HistogramChild(self._counts, self._totals, self._sums, tuple(self.buckets), key)

    def collect(self) -> List[str]:
        lines = [f"# HELP {self.name} {self.documentation}", f"# TYPE {self.name} histogram"]
        for key, values in sorted(self._counts.items()):
            cumulative = 0.0
            for index, bucket in enumerate(self.buckets):
                cumulative += values[index]
                label_string = self._format_labels(key, f"{bucket:.6g}")
                lines.append(f"{self.name}_bucket{label_string} {cumulative}")
            total = self._totals.get(key, 0.0)
            label_inf = self._format_labels(key, "+Inf")
            lines.append(f"{self.name}_bucket{label_inf} {total}")
            labels = self._format_labels(key)
            sum_value = self._sums.get(key, 0.0)
            lines.append(f"{self.name}_sum{labels} {sum_value}")
            lines.append(f"{self.name}_count{labels} {total}")
        return lines

    def _normalise(self, labels: Dict[str, str]) -> Tuple[str, ...]:
        if len(labels) != len(self.labelnames):
            raise ValueError("Label cardinality mismatch")
        ordered = []
        for label in self.labelnames:
            if label not in labels:
                raise ValueError(f"Missing label: {label}")
            ordered.append(str(labels[label]))
        return tuple(ordered)

    def _format_labels(self, values: Tuple[str, ...], bucket: str | None = None) -> str:
        if not self.labelnames and bucket is None:
            return ""
        pairs = []
        for name, value in zip(self.labelnames, values):
            pairs.append(f'{name}="{value}"')
        if bucket is not None:
            pairs.append(f'le="{bucket}"')
        return "{" + ",".join(pairs) + "}"


class _Collectable(Protocol):
    def collect(self) -> Iterable[str]:
        ...


class CollectorRegistry:
    def __init__(self) -> None:
        self._metrics: List[_Collectable] = []

    def register(self, metric: _Collectable) -> None:
        self._metrics.append(metric)

    def collect(self) -> Iterator[str]:
        for metric in self._metrics:
            yield from metric.collect()


def register_counter(
    registry: CollectorRegistry,
    name: str,
    documentation: str,
    labelnames: Sequence[str],
) -> Counter:
    counter = Counter(name=name, documentation=documentation, labelnames=labelnames, registry=registry)
    registry.register(counter)
    return counter


def register_histogram(
    registry: CollectorRegistry,
    name: str,
    documentation: str,
    labelnames: Sequence[str],
    buckets: Sequence[float],
) -> Histogram:
    histogram = Histogram(
        name=name,
        documentation=documentation,
        labelnames=labelnames,
        buckets=tuple(sorted(buckets)),
        registry=registry,
    )
    registry.register(histogram)
    return histogram


def generate_latest(registry: CollectorRegistry) -> bytes:
    payload = "\n".join(registry.collect()) + "\n"
    return payload.encode("utf-8")
