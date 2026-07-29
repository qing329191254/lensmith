"""fal.ai helpers."""

from __future__ import annotations

import os
from typing import Any

import fal_client

from app.config import get_settings


class FalError(Exception):
    def __init__(self, message: str, details: Any = None):
        super().__init__(message)
        self.message = message
        self.details = details


def ensure_fal_key(required: bool = True) -> str | None:
    from app.request_keys import resolve_fal_key

    key = resolve_fal_key()
    if not key:
        if required:
            raise FalError("FAL API key not configured. Set it in Workspace or add FAL_KEY to .env.")
        return None
    os.environ["FAL_KEY"] = key
    return key


def subscribe(model: str, input_data: dict[str, Any]) -> Any:
    ensure_fal_key(required=True)
    return fal_client.subscribe(model, arguments=input_data)


def moderation_message(error: Exception) -> str:
    message = str(getattr(error, "message", None) or error)
    lower = message.lower()
    if any(x in lower for x in ("content checker", "flagged", "could not be processed")):
        return (
            "Content flagged by moderation: Please avoid copyrighted content, "
            "movie references, or trademarked characters in your prompts and images."
        )
    return message or "Video generation failed"
