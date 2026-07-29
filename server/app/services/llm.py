"""LangChain chat model for text-only steps (may use cheaper DeepSeek key)."""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from app.request_keys import (
    normalize_model_for_base,
    resolve_text_api_key,
    resolve_text_base_url,
    resolve_text_model,
)
from app.services.gateway import GatewayError


def get_text_llm(*, model: str | None = None, temperature: float = 0.4) -> ChatOpenAI:
    """Return a LangChain chat model for text-only steps."""
    api_key = resolve_text_api_key()
    if not api_key:
        raise GatewayError(
            "Configuration error",
            status_code=500,
            details="No text API key configured. Set Text API key in Workspace (or Image/Gateway key as fallback).",
        )
    base = resolve_text_base_url()
    model_id = normalize_model_for_base(resolve_text_model(model), base)
    return ChatOpenAI(
        model=model_id,
        api_key=api_key,
        base_url=base,
        temperature=temperature,
    )
