from fastapi import APIRouter, Request

from app.schemas.health import HealthResponse

router = APIRouter(tags=["meta"])


@router.get("/health", response_model=HealthResponse, summary="Liveness and dependency status")
def get_health(request: Request) -> HealthResponse:
    # No LLM provider is wired until WP-14.
    return HealthResponse(status="ok", model_version=request.app.state.settings.model_version, llm="down")
