/** Map provider / API error text into localized, user-facing copy. */

type Translate = (key: string) => string

export function formatApiError(error: unknown, t: Translate): string {
  const raw = error instanceof Error ? error.message : String(error || "")
  const lower = raw.toLowerCase()

  if (
    lower.includes("authentication") ||
    lower.includes("api key rejected") ||
    lower.includes("key must match") ||
    lower.includes("authentication_error") ||
    lower.includes("unauthorized") ||
    lower.includes("ai_gateway_api_key")
  ) {
    return t("errors.keyModelMismatch")
  }

  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return t("errors.rateLimited")
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
  const first = raw.split("\n").map((s) => s.trim()).find(Boolean) || raw.trim()
  if (!first) return t("errors.providerFailed")
  if (first.startsWith("{") || first.startsWith("[")) return t("errors.providerFailed")
  return first
}
