import os
from dataclasses import dataclass

# 500-char message plus 6 history turns of 1000 chars fits well under this, even JSON-escaped.
DEFAULT_MAX_BODY_BYTES = 64 * 1024


@dataclass(frozen=True)
class Settings:
    internal_key: str
    max_body_bytes: int = DEFAULT_MAX_BODY_BYTES
    # Reported by /health until WP-13 loads a real intent model.
    model_version: str = "none"


def load_settings() -> Settings:
    return Settings(
        internal_key=os.environ.get("ML_API_KEY", ""),
        max_body_bytes=int(os.environ.get("ML_API_MAX_BODY_BYTES", DEFAULT_MAX_BODY_BYTES)),
    )
