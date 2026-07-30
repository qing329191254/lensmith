/** Map provider / API error text into localized, user-facing copy. */

type Translate = (key: string) => string

function normalizeErrorText(raw: string): string {
  return raw
    .replace(/^(generate_master|analyze uploaded master|transition generate|panel\[\d+\] process|transition panel\[\d+\]) failed:\s*/i, "")
    .trim()
}

export function formatApiError(error: unknown, t: Translate): string {
  const raw = error instanceof Error ? error.message : String(error || "")
  const text = normalizeErrorText(raw)
  const lower = text.toLowerCase()

  if (
    lower.includes("does not support reference editing") ||
    lower.includes("does not support editing") ||
    lower.includes("text-to-image only")
  ) {
    return t("errors.editingUnsupported")
  }

  if (
    lower.includes("authentication") ||
    lower.includes("api key rejected") ||
    lower.includes("api key does not match") ||
    lower.includes("key must match") ||
    lower.includes("key doesn’t match") ||
    lower.includes("key doesn't match") ||
    lower.includes("authentication_error") ||
    lower.includes("unauthorized") ||
    lower.includes("ai_gateway_api_key") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key")
  ) {
    return t("errors.keyModelMismatch")
  }

  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return t("errors.rateLimited")
  }

  if (
    lower.includes("quota") ||
    lower.includes("balance exhausted") ||
    lower.includes("insufficient") ||
    text.includes("余额") ||
    text.includes("额度") ||
    text.includes("欠费")
  ) {
    return t("errors.quotaExhausted")
  }

  if (
    lower.includes("model") &&
    (lower.includes("not found") ||
      lower.includes("does not exist") ||
      lower.includes("unknown model") ||
      lower.includes("invalid model") ||
      lower.includes("not support") ||
      lower.includes("invalid for this endpoint"))
  ) {
    return t("errors.invalidModel")
  }

  if (
    lower.includes("no image generated") ||
    lower.includes("did not return any images") ||
    lower.includes("missing image")
  ) {
    return t("errors.noImage")
  }

  if (
    lower.includes("ai gateway request failed") ||
    (lower.includes("provider ") && lower.includes(" failed")) ||
    lower.includes("image request failed") ||
    lower.includes("openai image request failed")
  ) {
    return t("errors.providerFailed")
  }

  // Prefer first line; avoid dumping provider JSON into the UI
  const first = text.split("\n").map((s) => s.trim()).find(Boolean) || text.trim()
  if (!first) return t("errors.providerFailed")
  if (first.startsWith("{") || first.startsWith("[")) return t("errors.providerFailed")
  return first
}
