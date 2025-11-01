from typing import Any, AsyncContextManager, Awaitable, Callable, Dict, Mapping, Optional

class Request:
    def __init__(self, *args: Any, **kwargs: Any) -> None: ...
    method: str
    url: str


class Response:
    def __init__(
        self,
        status_code: int,
        *,
        json: Any | None = ...,
        request: Request | None = ...,
        text: str | None = ...,
    ) -> None: ...
    status_code: int
    text: str
    def json(self, *args: Any, **kwargs: Any) -> Any: ...
    def raise_for_status(self) -> None: ...
    async def aread(self) -> bytes: ...


class HTTPError(Exception): ...

class HTTPStatusError(Exception):
    response: Response

class AsyncClient(AsyncContextManager["AsyncClient"]):
    def __init__(self, *args: Any, **kwargs: Any) -> None: ...
    async def request(
        self,
        method: str,
        url: str,
        *,
        json: Any | None = ...,
        headers: Mapping[str, str] | None = ...,
    ) -> Response: ...
    async def post(
        self,
        url: str,
        *,
        json: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Response: ...
    async def __aenter__(self) -> "AsyncClient": ...
    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None: ...

class MockTransport:
    def __init__(self, handler: Callable[[Request], Awaitable[Response]]) -> None: ...


__all__ = ["AsyncClient", "HTTPError", "HTTPStatusError", "MockTransport", "Request", "Response"]
