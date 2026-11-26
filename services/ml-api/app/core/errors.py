"""Error envelope shared with the Node API: {"error": {"code", "message", "details?"}}."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

logger = logging.getLogger("ml-api")


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def error_response(status: int, code: str, message: str, details: Any = None) -> JSONResponse:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return JSONResponse(status_code=status, content={"error": error})


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def on_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def on_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        # Only field and issue: the rejected input must not be echoed back (it may contain PII).
        details = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "issue": e["msg"]}
            for e in exc.errors()
        ]
        return error_response(400, "VALIDATION_ERROR", "Invalid request body", details)

    @app.exception_handler(HTTPException)
    async def on_http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        if exc.status_code == 404:
            code = "NOT_FOUND"
        elif exc.status_code >= 500:
            code = "INTERNAL"
        else:
            code = "VALIDATION_ERROR"
        return error_response(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def on_unhandled(_request: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled error", exc_info=exc)
        return error_response(500, "INTERNAL", "Internal server error")
