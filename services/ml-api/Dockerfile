# Build context: repo root. docker build -f services/ml-api/Dockerfile .
# Keep it small: no torch/transformers, the target is under 512 MB RAM (Render free).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv
COPY services/ml-api/pyproject.toml ./
COPY services/ml-api/app app
RUN pip install . && useradd --system --no-create-home mlapi
USER mlapi
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://localhost:%s/health' % os.environ.get('PORT','8000'), timeout=4)"
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
