"""Map provider HTTP error bodies to short, user-facing messages."""

from __future__ import annotations


def friendly_provider_error(
    body: str | None,
    *,
    status_code: int = 500,
    what: str = "request",
) -> str:
    """Return a clear message for the `error` field (keep raw body in `details`)."""
    text = (body or "").strip()
    lower = text.lower()

    authish = (
        status_code in (401, 403)
        or "authentication" in lower
        or "unauthorized" in lower
        or "invalid api key" in lower
        or "invalid_api_key" in lower
        or ("api key" in lower and ("invalid" in lower or "incorrect" in lower or "failed" in lower))
        or "ai_gateway_api_key" in lower
    )
    if authish:
        return (
            "API key rejected. Key must match the selected model/endpoint: "
            "Zhipu key → CogView models; Gemini/OpenAI → Vercel AI Gateway key "
            "(or set a matching proxy Base URL in Workspace)."
        )

    if status_code == 429 or "rate limit" in lower or "too many requests" in lower:
        return "Provider rate limit reached. Please wait a moment and try again."

    if (
        "model" in lower
        and (
            "not found" in lower
            or "does not exist" in lower
            or "unknown model" in lower
            or "invalid model" in lower
            or "not support" in lower
        )
    ):
        return (
            "Model is invalid for this endpoint. "
            "Open Workspace and pick a model that matches your API key."
        )

    if status_code >= 500:
        return f"Provider {what} failed (server error). Please retry shortly."

    return f"Provider {what} failed. Check Workspace model and API key settings."
