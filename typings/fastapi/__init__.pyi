from typing import Any, Callable, Optional, TypeVar

_T = TypeVar("_T", bound=Callable[..., Any])

class Response:
    def __init__(self, content: Any = ..., media_type: str | None = ...) -> None: ...

class HTTPException(Exception):
    status_code: int
    detail: Any
    def __init__(self, status_code: int, detail: Any = ...) -> None: ...

class FastAPI:
    def __init__(self, *args: Any, **kwargs: Any) -> None: ...
    def get(self, path: str, **kwargs: Any) -> Callable[[_T], _T]: ...
    def post(self, path: str, **kwargs: Any) -> Callable[[_T], _T]: ...
    def delete(self, path: str, **kwargs: Any) -> Callable[[_T], _T]: ...
    def put(self, path: str, **kwargs: Any) -> Callable[[_T], _T]: ...
    def add_api_route(self, path: str, endpoint: Callable[..., Any], **kwargs: Any) -> None: ...
    def add_middleware(self, middleware: type[Any], *args: Any, **kwargs: Any) -> None: ...
    def add_event_handler(self, event_type: str, func: Callable[..., Any]) -> None: ...


def Depends(dependency: Optional[Callable[..., Any]] = ...) -> Any: ...
def Form(default: Any = ..., *, alias: str | None = ...) -> Any: ...
def Header(default: Any = ..., *, convert_underscores: bool = True) -> Any: ...


class _StatusCodes:
    HTTP_200_OK: int
    HTTP_201_CREATED: int
    HTTP_400_BAD_REQUEST: int
    HTTP_401_UNAUTHORIZED: int
    HTTP_403_FORBIDDEN: int
    HTTP_404_NOT_FOUND: int
    HTTP_500_INTERNAL_SERVER_ERROR: int
    HTTP_502_BAD_GATEWAY: int
    HTTP_503_SERVICE_UNAVAILABLE: int


status: _StatusCodes


__all__ = [
    "Depends",
    "FastAPI",
    "Form",
    "HTTPException",
    "Header",
    "Response",
    "status",
]
