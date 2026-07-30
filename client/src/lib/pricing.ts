/**
 * Model-aware cost estimates.
 * Gemini entries are recommended defaults only — users may pick other models.
 * Rates are public list-price approximations, not invoice amounts.
 */

export type ModelKind = "text" | "image" | "video" | "upscale"

export interface ModelRate {
  id: string
  label: string
  kind: ModelKind
  /** Shown as the suggested default in the product. */
  recommended?: boolean
  /** USD per 1M input tokens (text). */
  inputPerMTok?: number
  /** USD per 1M output tokens (text). */
  outputPerMTok?: number
  /** USD per successful call (image / video / upscale). */
  perCall?: number
}

/** Catalog used for estimates. Extend when more providers are selectable. */
export const MODEL_CATALOG: ModelRate[] = [
  // Text
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    kind: "text",
    recommended: true,
    inputPerMTok: 0.3,
    outputPerMTok: 2.5,
  },
  {
    id: "openai/gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    kind: "text",
    inputPerMTok: 0.4,
    outputPerMTok: 1.6,
  },
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek Chat",
    kind: "text",
    inputPerMTok: 0.14,
    outputPerMTok: 0.28,
  },
  {
    id: "zai/glm-4.5-flash",
    label: "GLM-4.5 Flash",
    kind: "text",
    inputPerMTok: 0.1,
    outputPerMTok: 0.4,
  },
  {
    id: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4",
    kind: "text",
    inputPerMTok: 3,
    outputPerMTok: 15,
  },
  // Image
  {
    id: "google/gemini-3-pro-image",
    label: "Gemini 3 Pro Image",
    kind: "image",
    recommended: true,
    perCall: 0.134,
  },
  {
    id: "openai/gpt-image-1",
    label: "GPT Image 1",
    kind: "image",
    perCall: 0.04,
  },
  {
    id: "zhipu/cogview-3-flash",
    label: "CogView 3 Flash",
    kind: "image",
    perCall: 0.02,
  },
  {
    id: "zhipu/cogview-4",
    label: "CogView 4",
    kind: "image",
    perCall: 0.06,
  },
  // Video (client ids match StoryboardResult)
  {
    id: "veo3-fast",
    label: "Veo 3.1 Fast",
    kind: "video",
    recommended: true,
    perCall: 0.35,
  },
  {
    id: "veo3-standard",
    label: "Veo 3.1 Standard",
    kind: "video",
    perCall: 0.75,
  },
  {
    id: "kling-2.5",
    label: "Kling 2.5 Turbo Pro",
    kind: "video",
    perCall: 0.35,
  },
  {
    id: "kling-3",
    label: "Kling 3 Pro",
    kind: "video",
    perCall: 0.45,
  },
  {
    id: "seedance-2-fast",
    label: "Seedance 2.0 Fast",
    kind: "video",
    perCall: 0.35,
  },
  {
    id: "wan-2.5",
    label: "WAN 2.5",
    kind: "video",
    perCall: 0.28,
  },
  {
    id: "wan-2.2",
    label: "WAN 2.2",
    kind: "video",
    perCall: 0.18,
  },
  {
    id: "minimax-hailuo",
    label: "MiniMax Hailuo",
    kind: "video",
    perCall: 0.3,
  },
  {
    id: "cogvideox-3",
    label: "CogVideoX-3",
    kind: "video",
    perCall: 0.4,
  },
  {
    id: "cogvideox-2",
    label: "CogVideoX-2",
    kind: "video",
    perCall: 0.3,
  },
  {
    id: "viduq1",
    label: "Vidu Q1",
    kind: "video",
    perCall: 0.35,
  },
  {
    id: "vidu2-image",
    label: "Vidu 2 Image",
    kind: "video",
    perCall: 0.3,
  },
  // Upscale
  {
    id: "fal-ai/ccsr",
    label: "CCSR Upscale",
    kind: "upscale",
    recommended: true,
    perCall: 0.025,
  },
]

/** Recommended model id per usage route (product default, not a lock-in). */
export const ROUTE_RECOMMENDED_MODEL: Record<string, string> = {
  "enhance-text": "google/gemini-2.5-flash",
  "enhance-prompt": "google/gemini-2.5-flash",
  "analyze-storyboard": "google/gemini-3-pro-image",
  "generate-image": "google/gemini-3-pro-image",
  "generate-video": "veo3-fast",
  upscale: "fal-ai/ccsr",
  "storyboard-run": "google/gemini-3-pro-image",
  other: "google/gemini-2.5-flash",
}

const TEXT_INPUT_SHARE = 0.45

const ALIASES: Record<string, string> = {
  "gemini-2.5-flash": "google/gemini-2.5-flash",
  "gemini-3-pro-image": "google/gemini-3-pro-image",
  "google/gemini-2.5-flash": "google/gemini-2.5-flash",
  "google/gemini-3-pro-image": "google/gemini-3-pro-image",
  "fal-ai/veo3.1/fast/image-to-video": "veo3-fast",
  "fal-ai/veo3.1/image-to-video": "veo3-standard",
  "fal-ai/wan/v2.5/image-to-video": "wan-2.5",
  "fal-ai/wan/v2.2/image-to-video": "wan-2.2",
}

export function normalizeModelId(model?: string | null): string | null {
  if (!model) return null
  const trimmed = model.trim()
  if (!trimmed) return null
  return ALIASES[trimmed] || ALIASES[trimmed.toLowerCase()] || trimmed
}

export function getModelRate(model?: string | null): ModelRate | undefined {
  const id = normalizeModelId(model)
  if (!id) return undefined
  return MODEL_CATALOG.find((m) => m.id === id)
}

export function recommendedModelForRoute(route: string): string {
  return ROUTE_RECOMMENDED_MODEL[route] || ROUTE_RECOMMENDED_MODEL.other
}

function textCostUsd(rate: ModelRate, tokens: number): number {
  if (tokens <= 0) return 0
  const input = rate.inputPerMTok ?? 0
  const output = rate.outputPerMTok ?? 0
  const perM = TEXT_INPUT_SHARE * input + (1 - TEXT_INPUT_SHARE) * output
  return (tokens / 1_000_000) * perM
}

export function estimateCostUsd(
  route: string,
  tokens: number,
  model?: string | null,
  breakdown?: {
    promptTokens?: number
    completionTokens?: number
    cachedTokens?: number
  },
): { costUsd: number; modelId: string; usedFallback: boolean } {
  const explicit = normalizeModelId(model)
  const fallbackId = recommendedModelForRoute(route)
  const modelId = explicit || fallbackId
  const usedFallback = !explicit
  const rate = getModelRate(modelId) || getModelRate(fallbackId)

  if (!rate) {
    return { costUsd: 0, modelId, usedFallback: true }
  }

  if (rate.kind === "text") {
    const prompt = breakdown?.promptTokens
    const completion = breakdown?.completionTokens
    const cached = breakdown?.cachedTokens || 0
    if (prompt != null && prompt > 0 && completion != null) {
      const billablePrompt = Math.max(0, prompt - cached)
      const cachedCost = (cached / 1_000_000) * (rate.inputPerMTok ?? 0) * 0.1
      const promptCost = (billablePrompt / 1_000_000) * (rate.inputPerMTok ?? 0)
      const completionCost = (completion / 1_000_000) * (rate.outputPerMTok ?? 0)
      return { costUsd: cachedCost + promptCost + completionCost, modelId: rate.id, usedFallback }
    }
    return { costUsd: textCostUsd(rate, tokens), modelId: rate.id, usedFallback }
  }

  if (rate.kind === "image" || rate.kind === "video" || rate.kind === "upscale") {
    if (route === "storyboard-run") {
      const textRate = getModelRate(recommendedModelForRoute("enhance-text"))
      const textPart = textRate
        ? estimateCostUsd("enhance-text", tokens, textRate.id, breakdown).costUsd
        : 0
      return {
        costUsd: textPart + (rate.perCall ?? 0),
        modelId: rate.id,
        usedFallback,
      }
    }
    return { costUsd: rate.perCall ?? 0, modelId: rate.id, usedFallback }
  }

  return { costUsd: textCostUsd(rate, tokens), modelId: rate.id, usedFallback }
}

export function formatUsd(amount: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(amount) || amount <= 0) return "$0.00"
  if (opts?.compact && amount >= 100) return `$${amount.toFixed(0)}`
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  if (amount < 1) return `$${amount.toFixed(3)}`
  return `$${amount.toFixed(2)}`
}

export function modelLabel(model?: string | null): string {
  const rate = getModelRate(model)
  if (rate) return rate.recommended ? `${rate.label} ★` : rate.label
  const id = normalizeModelId(model)
  return id || "—"
}
