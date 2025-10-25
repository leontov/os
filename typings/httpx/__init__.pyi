from typing import Any, AsyncContextManager, Dict, Optional

class Response:
    status_code: int
    text: str
    def json(self, *args: Any, **kwargs: Any) -> Any: ...
    def raise_for_status(self) -> None: ...

class HTTPStatusError(Exception):
    response: Response

class AsyncClient(AsyncContextManager["AsyncClient"]):
    def __init__(self, *args: Any, **kwargs: Any) -> None: ...
    async def post(
        self,
        url: str,
        *,
        json: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Response: ...
    async def __aenter__(self) -> "AsyncClient": ...
    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None: ...

__all__ = ["AsyncClient", "HTTPStatusError", "Response"]
