from typing import Any, Iterable

class Tensor:
    def to(self, device: "device") -> "Tensor": ...
    def item(self) -> float: ...
    def backward(self) -> None: ...


def tensor(*args: Any, **kwargs: Any) -> Tensor: ...

long: int


class device:
    def __init__(self, type: str) -> None: ...


class _NoGrad:
    def __enter__(self) -> None: ...
    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None: ...


def no_grad() -> _NoGrad: ...

def manual_seed(seed: int) -> None: ...


class _CudaModule:
    def is_available(self) -> bool: ...
    def manual_seed_all(self, seed: int) -> None: ...


cuda: _CudaModule


class _Optimizer:
    def step(self) -> None: ...
    def zero_grad(self, set_to_none: bool = ...) -> None: ...


class _OptimModule:
    class AdamW(_Optimizer):
        def __init__(self, params: Iterable[Any], lr: float = ..., weight_decay: float = ...) -> None: ...


optim: _OptimModule


__all__ = [
    "Tensor",
    "cuda",
    "device",
    "long",
    "manual_seed",
    "no_grad",
    "optim",
    "tensor",
]
