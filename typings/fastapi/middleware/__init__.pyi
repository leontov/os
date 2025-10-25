from typing import Any, Callable, TypeVar

_T = TypeVar("_T", bound=Callable[..., Any])

def Middleware(*args: Any, **kwargs: Any) -> Callable[[_T], _T]: ...

__all__ = ["Middleware"]
