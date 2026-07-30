import { computed, ref } from "vue"
import { defineStore } from "pinia"
import { estimateCostUsd } from "@/lib/pricing"
import { clearCloudUsage, pushCloudUsage } from "@/api/me"

const STORAGE_KEY = "lensmith-usage-events"
const MAX_EVENTS = 800

export type UsageRoute =
  | "enhance-text"
  | "enhance-prompt"
  | "analyze-storyboard"
  | "generate-image"
  | "generate-video"
  | "upscale"
  | "storyboard-run"
  | "ad-run"
  | "other"

export interface UsageEvent {
  id: string
  ts: number
  route: UsageRoute
  durationMs: number
  ok: boolean
  status?: number
  tokens: number
  /** Input / prompt tokens when known. */
  promptTokens: number
  /** Output / completion tokens when known. */
  completionTokens: number
  /** Prompt tokens served from provider cache. */
  cachedTokens: number
  estimated: boolean
  /** Provider model id when known; cost uses this, else route recommended default. */
  model?: string
  sample?: boolean
}

export type UsageRange = "1d" | "7d" | "30d"

const ROUTE_TOKEN_FALLBACK: Record<UsageRoute, number> = {
  "enhance-text": 900,
  "enhance-prompt": 1400,
  "analyze-storyboard": 1600,
  "generate-image": 2800,
  "generate-video": 0,
  upscale: 0,
  "storyboard-run": 6000,
  "ad-run": 7000,
  other: 400,
}

function loadEvents(): UsageEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as UsageEvent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function startOfDay(ts: number) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

export function extractTokens(data: unknown): {
  tokens: number
  promptTokens: number
  completionTokens: number
  cachedTokens: number
  estimated: boolean
} {
  const empty = { tokens: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimated: true }
  if (!data || typeof data !== "object") return empty
  const obj = data as Record<string, unknown>

  const usage = (obj.usage ||
    (obj.state as Record<string, unknown> | undefined)?.usage ||
    (obj.data as Record<string, unknown> | undefined)?.usage) as Record<string, unknown> | undefined

  if (!usage || typeof usage !== "object") return empty

  const promptTokens = Number(
    usage.promptTokens || usage.prompt_tokens || usage.input_tokens || usage.inputTokens || 0,
  )
  const completionTokens = Number(
    usage.completionTokens || usage.completion_tokens || usage.output_tokens || usage.outputTokens || 0,
  )
  let cachedTokens = Number(usage.cachedTokens || usage.cached_tokens || usage.cache_read_input_tokens || 0)
  const details = (usage.prompt_tokens_details || usage.promptTokensDetails || {}) as Record<string, unknown>
  if (!cachedTokens && details) {
    cachedTokens = Number(details.cached_tokens || details.cachedTokens || 0)
  }
  const total =
    Number(usage.totalTokens || usage.total_tokens || 0) ||
    (promptTokens > 0 || completionTokens > 0 ? promptTokens + completionTokens : 0)

  if (total <= 0 && promptTokens <= 0 && completionTokens <= 0) return empty

  return {
    tokens: total || promptTokens + completionTokens,
    promptTokens: Math.max(0, promptTokens),
    completionTokens: Math.max(0, completionTokens),
    cachedTokens: Math.max(0, Math.min(cachedTokens, promptTokens || cachedTokens)),
    estimated: false,
  }
}

/** Cache hit rate over prompt tokens (0–1). */
export function cacheRate(promptTokens: number, cachedTokens: number) {
  if (promptTokens <= 0) return 0
  return Math.min(1, cachedTokens / promptTokens)
}

export const useUsageStore = defineStore("usage", () => {
  const events = ref<UsageEvent[]>(loadEvents())

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.value.slice(0, MAX_EVENTS)))
  }

  function record(input: {
    route: UsageRoute
    durationMs: number
    ok: boolean
    status?: number
    tokens?: number
    promptTokens?: number
    completionTokens?: number
    cachedTokens?: number
    estimated?: boolean
    model?: string
  }) {
    const estimated = input.estimated ?? (input.tokens == null || input.tokens <= 0)
    const tokens =
      input.tokens && input.tokens > 0 ? input.tokens : estimated ? ROUTE_TOKEN_FALLBACK[input.route] : 0
    const promptTokens = input.promptTokens && input.promptTokens > 0 ? input.promptTokens : estimated ? Math.round(tokens * 0.55) : 0
    const completionTokens =
      input.completionTokens && input.completionTokens > 0
        ? input.completionTokens
        : estimated
          ? Math.max(0, tokens - promptTokens)
          : 0
    const cachedTokens = Math.max(0, input.cachedTokens || 0)

    events.value = [
      {
        id: uid(),
        ts: Date.now(),
        route: input.route,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        ok: input.ok,
        status: input.status,
        tokens,
        promptTokens,
        completionTokens,
        cachedTokens,
        estimated,
        model: input.model || undefined,
      },
      ...events.value,
    ].slice(0, MAX_EVENTS)
    persist()
    const newest = events.value[0]
    if (newest && localStorage.getItem("lensmith-auth-token")) {
      void pushCloudUsage([
        {
          id: newest.id,
          ts: newest.ts,
          route: newest.route,
          durationMs: newest.durationMs,
          ok: newest.ok,
          status: newest.status,
          tokens: newest.tokens,
          promptTokens: newest.promptTokens,
          completionTokens: newest.completionTokens,
          cachedTokens: newest.cachedTokens,
          estimated: newest.estimated,
          model: newest.model,
          sample: newest.sample,
        },
      ]).catch(() => {})
    }
  }

  function replaceAll(next: UsageEvent[]) {
    events.value = next.slice(0, MAX_EVENTS)
    persist()
  }

  function clear() {
    events.value = []
    localStorage.removeItem(STORAGE_KEY)
    if (localStorage.getItem("lensmith-auth-token")) {
      void clearCloudUsage().catch(() => {})
    }
  }

  function seedSample() {
    const now = Date.now()
    const routes: UsageRoute[] = [
      "generate-image",
      "enhance-prompt",
      "analyze-storyboard",
      "generate-video",
      "enhance-text",
      "upscale",
    ]
    const models: Partial<Record<UsageRoute, string[]>> = {
      "enhance-text": ["google/gemini-2.5-flash", "openai/gpt-4.1-mini"],
      "enhance-prompt": ["google/gemini-2.5-flash", "anthropic/claude-sonnet-4"],
      "analyze-storyboard": ["google/gemini-3-pro-image"],
      "generate-image": ["google/gemini-3-pro-image", "openai/gpt-image-1"],
      "generate-video": [
        "veo3-fast",
        "veo3-standard",
        "kling-3",
        "kling-2.5",
        "seedance-2-fast",
        "wan-2.5",
        "cogvideox-3",
        "viduq1",
      ],
      upscale: ["fal-ai/ccsr"],
    }
    const sample: UsageEvent[] = []
    for (let day = 6; day >= 0; day--) {
      const base = startOfDay(now - day * 86400000)
      const count = 4 + ((day * 3) % 5)
      for (let i = 0; i < count; i++) {
        const route = routes[(day + i) % routes.length]
        const ok = (day + i) % 9 !== 0
        const choices = models[route] || []
        const model = choices[(day + i) % Math.max(choices.length, 1)]
        const tokens = ROUTE_TOKEN_FALLBACK[route] + ((day * 100 + i * 40) % 500)
        const promptTokens = Math.round(tokens * (0.5 + ((day + i) % 3) * 0.1))
        const cachedTokens =
          route === "generate-video" || route === "upscale"
            ? 0
            : Math.round(promptTokens * (0.15 + ((day + i) % 5) * 0.12))
        sample.push({
          id: uid(),
          ts: base + 9 * 3600000 + i * 50 * 60000 + (i % 3) * 120000,
          route,
          durationMs: 800 + ((day + i) * 370) % 4200 + (route === "generate-video" ? 5000 : 0),
          ok,
          status: ok ? 200 : 500,
          tokens,
          promptTokens,
          completionTokens: Math.max(0, tokens - promptTokens),
          cachedTokens,
          estimated: true,
          model,
          sample: true,
        })
      }
    }
    events.value = sample.sort((a, b) => b.ts - a.ts)
    persist()
    if (localStorage.getItem("lensmith-auth-token")) {
      void pushCloudUsage(
        sample.map((e) => ({
          id: e.id,
          ts: e.ts,
          route: e.route,
          durationMs: e.durationMs,
          ok: e.ok,
          status: e.status,
          tokens: e.tokens,
          promptTokens: e.promptTokens,
          completionTokens: e.completionTokens,
          cachedTokens: e.cachedTokens,
          estimated: e.estimated,
          model: e.model,
          sample: e.sample,
        })),
      ).catch(() => {})
    }
  }

  function inRange(range: UsageRange) {
    const days = range === "1d" ? 1 : range === "7d" ? 7 : 30
    const from = Date.now() - days * 86400000
    return events.value.filter((e) => e.ts >= from)
  }

  function summarize(range: UsageRange) {
    const list = inRange(range).map((e) => ({
      ...e,
      promptTokens: e.promptTokens ?? 0,
      completionTokens: e.completionTokens ?? 0,
      cachedTokens: e.cachedTokens ?? 0,
    }))
    const durations = list.map((e) => e.durationMs).sort((a, b) => a - b)
    const okCount = list.filter((e) => e.ok).length
    const tokens = list.reduce((sum, e) => sum + e.tokens, 0)
    const promptTokens = list.reduce((sum, e) => sum + e.promptTokens, 0)
    const cachedTokens = list.reduce((sum, e) => sum + e.cachedTokens, 0)
    const costUsd = list.reduce(
      (sum, e) =>
        sum +
        estimateCostUsd(e.route, e.tokens, e.model, {
          promptTokens: e.promptTokens,
          completionTokens: e.completionTokens,
          cachedTokens: e.cachedTokens,
        }).costUsd,
      0,
    )
    const byRouteMap = new Map<
      UsageRoute,
      {
        route: UsageRoute
        count: number
        tokens: number
        promptTokens: number
        cachedTokens: number
        costUsd: number
        totalMs: number
        ok: number
      }
    >()

    for (const e of list) {
      const row = byRouteMap.get(e.route) || {
        route: e.route,
        count: 0,
        tokens: 0,
        promptTokens: 0,
        cachedTokens: 0,
        costUsd: 0,
        totalMs: 0,
        ok: 0,
      }
      row.count += 1
      row.tokens += e.tokens
      row.promptTokens += e.promptTokens
      row.cachedTokens += e.cachedTokens
      row.costUsd += estimateCostUsd(e.route, e.tokens, e.model, {
        promptTokens: e.promptTokens,
        completionTokens: e.completionTokens,
        cachedTokens: e.cachedTokens,
      }).costUsd
      row.totalMs += e.durationMs
      if (e.ok) row.ok += 1
      byRouteMap.set(e.route, row)
    }

    const byRoute = [...byRouteMap.values()]
      .map((r) => ({
        ...r,
        avgMs: r.count ? Math.round(r.totalMs / r.count) : 0,
        successRate: r.count ? r.ok / r.count : 0,
        cacheRate: cacheRate(r.promptTokens, r.cachedTokens),
      }))
      .sort((a, b) => b.costUsd - a.costUsd || b.count - a.count)

    const dayCount = range === "1d" ? 1 : range === "7d" ? 7 : 14
    const days: {
      key: string
      label: string
      count: number
      tokens: number
      costUsd: number
      cacheRate: number
      avgMs: number
    }[] = []
    for (let i = dayCount - 1; i >= 0; i--) {
      const dayStart = startOfDay(Date.now() - i * 86400000)
      const dayEnd = dayStart + 86400000
      const bucket = list.filter((e) => e.ts >= dayStart && e.ts < dayEnd)
      const d = new Date(dayStart)
      const dayPrompt = bucket.reduce((s, e) => s + e.promptTokens, 0)
      const dayCached = bucket.reduce((s, e) => s + e.cachedTokens, 0)
      days.push({
        key: `${d.getMonth() + 1}/${d.getDate()}`,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        count: bucket.length,
        tokens: bucket.reduce((s, e) => s + e.tokens, 0),
        costUsd: bucket.reduce(
          (s, e) =>
            s +
            estimateCostUsd(e.route, e.tokens, e.model, {
              promptTokens: e.promptTokens,
              completionTokens: e.completionTokens,
              cachedTokens: e.cachedTokens,
            }).costUsd,
          0,
        ),
        cacheRate: cacheRate(dayPrompt, dayCached),
        avgMs: bucket.length ? Math.round(bucket.reduce((s, e) => s + e.durationMs, 0) / bucket.length) : 0,
      })
    }

    return {
      total: list.length,
      tokens,
      promptTokens,
      cachedTokens,
      cacheRate: cacheRate(promptTokens, cachedTokens),
      costUsd,
      avgMs: list.length ? Math.round(list.reduce((s, e) => s + e.durationMs, 0) / list.length) : 0,
      p95Ms: Math.round(percentile(durations, 95)),
      successRate: list.length ? okCount / list.length : 0,
      byRoute,
      days,
      recent: list.slice(0, 12).map((e) => {
        const priced = estimateCostUsd(e.route, e.tokens, e.model, {
          promptTokens: e.promptTokens,
          completionTokens: e.completionTokens,
          cachedTokens: e.cachedTokens,
        })
        return {
          ...e,
          costUsd: priced.costUsd,
          modelId: priced.modelId,
          costFallback: priced.usedFallback,
          cacheRate: cacheRate(e.promptTokens, e.cachedTokens),
        }
      }),
      hasSample: list.some((e) => e.sample),
      isEmpty: list.length === 0,
    }
  }

  const liveCount = computed(() => events.value.filter((e) => !e.sample).length)

  return {
    events,
    liveCount,
    record,
    replaceAll,
    clear,
    seedSample,
    summarize,
    inRange,
  }
})
