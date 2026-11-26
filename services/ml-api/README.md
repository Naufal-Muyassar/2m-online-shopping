# ml-api

Layanan ML internal 2M (FastAPI). Hanya API Node yang boleh memanggilnya. Kontrak: `contracts/ml-api.openapi.json`.

Dijalankan dari folder `services/ml-api`:

```powershell
uv venv --python 3.12
```

```powershell
uv pip install -e ".[dev]"
```

```powershell
.venv\Scripts\python -m pytest
```

```powershell
$env:ML_API_KEY = "dev-key"; .venv\Scripts\python -m uvicorn app.main:app --port 8000
```

Swagger: http://localhost:8000/docs

| Env | Arti |
|---|---|
| `ML_API_KEY` | Nilai header `X-Internal-Key` untuk `/v1`. Kosong berarti semua `/v1` ditolak. |
| `ML_API_MAX_BODY_BYTES` | Batas ukuran body request (default 65536). |

Docker (dijalankan dari root repo): `docker build -f services/ml-api/Dockerfile -t 2m-ml-api .`
