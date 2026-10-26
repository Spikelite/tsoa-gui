"""The headers sent with every response, limiting what a page from this server may do."""
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

# The page loads its scripts, styles, images and connections from its own
# origin only. The Sci-Fi FOF skin works out its animations' keyframes from
# its geometry as it draws, in <style> elements, so styles may also be
# inline; scripts may not. There is deliberately no frame-ancestors: a
# dashboard or another console may show the page in a frame.
CONTENT_SECURITY_POLICY = "; ".join([
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
])

HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
}


class SecurityHeaders:
    """Adds HEADERS to every HTTP response the wrapped app sends.

    Plain ASGI rather than Starlette's BaseHTTPMiddleware, which would wrap
    the event streams' bodies and get in the way of their ending.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.raw = [(name.lower().encode("latin-1"), value.encode("latin-1")) for name, value in HEADERS.items()]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", ()), *self.raw]
            await send(message)

        await self.app(scope, receive, send_with_headers)
