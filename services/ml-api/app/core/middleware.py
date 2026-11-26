"""Guards that run before routing, so a new /v1 route cannot forget them."""

import hmac

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import error_response

PROTECTED_PREFIX = "/v1"
KEY_HEADER = b"x-internal-key"


class InternalKeyMiddleware:
    """Require X-Internal-Key on /v1. With no key configured every /v1 request is rejected."""

    def __init__(self, app: ASGIApp, key: str) -> None:
        self.app = app
        self.key = key.encode()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and self._protected(scope):
            given = dict(scope["headers"]).get(KEY_HEADER, b"")
            if not self.key or not hmac.compare_digest(given, self.key):
                response = error_response(401, "UNAUTHENTICATED", "Missing or wrong X-Internal-Key")
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)

    @staticmethod
    def _protected(scope: Scope) -> bool:
        path = scope["path"].removeprefix(scope.get("root_path", ""))
        return path == PROTECTED_PREFIX or path.startswith(PROTECTED_PREFIX + "/")


class BodyLimitMiddleware:
    """Reject bodies over max_bytes, counting what arrives rather than trusting Content-Length."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        chunks: list[bytes] = []
        size = 0
        more = True
        while more:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > self.max_bytes:
                response = error_response(413, "AI_INPUT_TOO_LONG", "Request body too large")
                await response(scope, receive, send)
                return
            chunks.append(chunk)
            more = message.get("more_body", False)

        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": b"".join(chunks), "more_body": False}

        await self.app(scope, replay, send)
