import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.config import Settings
from app.main import create_app

KEY = "test-key"


class Echo(BaseModel):
    text: str


def make_client(key: str = KEY, max_body_bytes: int = 200) -> TestClient:
    app = create_app(Settings(internal_key=key, max_body_bytes=max_body_bytes))

    # Stand-ins for the /v1 routes that arrive in WP-13 and later.
    @app.post("/v1/echo")
    def echo(body: Echo) -> Echo:
        return body

    @app.get("/v1/boom")
    def boom() -> None:
        raise RuntimeError("secret detail")

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def client() -> TestClient:
    return make_client()


def auth(key: str = KEY) -> dict[str, str]:
    return {"X-Internal-Key": key}


def test_health_needs_no_key(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "model_version": "none", "llm": "down"}


def test_docs_and_schema_are_open(client):
    assert client.get("/docs").status_code == 200
    assert "/health" in client.get("/openapi.json").json()["paths"]


@pytest.mark.parametrize("headers", [{}, {"X-Internal-Key": "wrong"}, {"X-Internal-Key": ""}])
def test_v1_rejects_missing_or_wrong_key(client, headers):
    res = client.post("/v1/echo", json={"text": "halo"}, headers=headers)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHENTICATED"


def test_v1_is_closed_when_no_key_is_configured():
    client = make_client(key="")
    res = client.post("/v1/echo", json={"text": "halo"}, headers={"X-Internal-Key": ""})
    assert res.status_code == 401


def test_v1_accepts_the_key_and_passes_the_body_through(client):
    res = client.post("/v1/echo", json={"text": "halo"}, headers=auth())
    assert res.status_code == 200
    assert res.json() == {"text": "halo"}


def test_oversized_body_is_rejected(client):
    res = client.post("/v1/echo", json={"text": "a" * 300}, headers=auth())
    assert res.status_code == 413
    assert res.json()["error"]["code"] == "AI_INPUT_TOO_LONG"


def test_oversized_chunked_body_is_rejected_without_content_length(client):
    def chunks():
        for _ in range(10):
            yield b"a" * 50

    res = client.post("/v1/echo", content=chunks(), headers=auth())
    assert res.status_code == 413


def test_validation_error_uses_the_node_envelope_and_hides_input(client):
    res = client.post("/v1/echo", json={"text": 12345}, headers=auth())
    assert res.status_code == 400
    error = res.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["details"][0]["field"] == "text"
    assert "12345" not in res.text


def test_unknown_route_and_crash_use_the_envelope(client):
    assert client.get("/nope").json()["error"]["code"] == "NOT_FOUND"
    res = client.get("/v1/boom", headers=auth())
    assert res.status_code == 500
    assert res.json()["error"]["code"] == "INTERNAL"
    assert "secret detail" not in res.text
