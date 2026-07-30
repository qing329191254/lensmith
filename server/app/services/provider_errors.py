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
            "API key does not match the selected model. "
            "Open Workspace and pick a matching image model, or update the key."
        )

    if status_code == 429 or "rate limit" in lower or "too many requests" in lower:
        return "Provider rate limit reached. Please wait a moment and try again."

    if (
        "insufficient" in lower
        or "quota" in lower
        or "balance" in lower
        or "余额" in text
        or "额度" in text
        or "欠费" in text
        or "充值" in text
        or "account_overdue" in lower
        or "1113" in text  # common Zhipu balance code
    ):
        return "Provider quota or balance exhausted. Top up or switch keys, then retry."

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
