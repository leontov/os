from typing import Any, Callable, Dict, Optional, TypeVar

_T = TypeVar("_T")

class BaseModel:
    def __init__(self, **data: Any) -> None: ...
    def dict(self, *args: Any, **kwargs: Any) -> Dict[str, Any]: ...


def Field(
    default: Any = ...,
    *,
    default_factory: Optional[Callable[[], Any]] = ...,
    alias: Optional[str] = ...,
    description: Optional[str] = ...,
    ge: Optional[float] = ...,
    le: Optional[float] = ...,
    min_length: Optional[int] = ...,
    max_length: Optional[int] = ...,
) -> Any: ...


def field_validator(*fields: str, **kwargs: Any) -> Callable[[Callable[..., _T]], Callable[..., _T]]: ...

class ValidationError(Exception): ...

__all__ = ["BaseModel", "Field", "ValidationError", "field_validator"]
