from fastapi import FastAPI

from app.core.config import Settings, load_settings
from app.core.errors import register_error_handlers
from app.core.middleware import BodyLimitMiddleware, InternalKeyMiddleware
from app.routers import health


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(
        title="2M ml-api (internal)",
        version="0.2.1",
        description="Internal ML service. Only the Node API calls it; /v1 requires `X-Internal-Key`.",
    )
    app.state.settings = settings
    register_error_handlers(app)
    # The middleware added last runs first: the key is checked before the body is read.
    app.add_middleware(BodyLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(InternalKeyMiddleware, key=settings.internal_key)
    app.include_router(health.router)
    return app


app = create_app()
