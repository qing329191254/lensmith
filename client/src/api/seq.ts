import { useApiKeysStore } from "@/stores/apiKeys"
import { useApiKeyPromptStore, type ApiKeyKind } from "@/stores/apiKeyPrompt"
import { extractMediaUrl, sourceFromRoute, useAssetsStore } from "@/stores/assets"
import { VIDEO_MODEL_OPTIONS, useModelPrefsStore } from "@/stores/modelPrefs"
import { extractTokens, useUsageStore, type UsageRoute } from "@/stores/usage"

export class ApiKeyRequiredError extends Error {
  kind: ApiKeyKind

  constructor(kind: ApiKeyKind) {
    super("API_KEY_REQUIRED")
    this.name = "ApiKeyRequiredError"
    this.kind = kind
  }
}

export function isApiKeyRequiredError(error: unknown): error is ApiKeyRequiredError {
  return error instanceof ApiKeyRequiredError || (error instanceof Error && error.name === "ApiKeyRequiredError")
}

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      (data as { error?: string; details?: string }).error ||
      (data as { details?: string }).details ||
      res.statusText
    const text = typeof message === "string" ? message : "Request failed"
    maybePromptFromMessage(text)
    throw new Error(text)
  }
  return data
}

function maybePromptFromMessage(message: string) {
  const lower = message.toLowerCase()
  const looksMissing =
    lower.includes("not configured") ||
    lower.includes("api key") ||
    lower.includes("api密钥") ||
    lower.includes("密钥")
  if (!looksMissing) return

  const kind: ApiKeyKind = lower.includes("fal")
    ? "fal"
    : lower.includes("text api") || lower.includes("文本")
      ? "text"
      : "gateway"
  useApiKeyPromptStore().show(kind)
}

function withAuth(init: RequestInit = {}): RequestInit {
  const keys = useApiKeysStore()
  const prefs = useModelPrefsStore()
  const headers = new Headers(init.headers || {})
  for (const [k, v] of Object.entries(keys.authHeaders())) headers.set(k, v)
  for (const [k, v] of Object.entries(prefs.modelHeaders())) headers.set(k, v)
  return { ...init, headers }
}

async function ensureKey(kind: ApiKeyKind): Promise<void> {
  const keys = useApiKeysStore()
  if (kind === "text" && keys.hasText) return
  if (kind === "gateway" && keys.hasGateway) return
  if (kind === "fal" && keys.hasFal) return

  try {
    const status = await checkApiKey()
    if (kind === "text" && (status.textConfigured || status.configured)) return
    if (kind === "gateway" && status.configured) return
    if (kind === "fal" && status.falConfigured) return
  } catch {
    // Fall through and prompt — local keys are missing and status check failed.
  }

  useApiKeyPromptStore().show(kind)
  throw new ApiKeyRequiredError(kind)
}

async function ensureImageKey(): Promise<void> {
  await ensureKey("gateway")
}

async function ensureVideoKey(model?: string): Promise<void> {
  const prefs = useModelPrefsStore()
  const id = model || prefs.videoModel
  const opt = VIDEO_MODEL_OPTIONS.find((o) => o.id === id)
  // Known catalog: follow flags. Unknown custom: fal if looks like fal/veo/kling/wan; else gateway (compatible).
  const needsFal =
    opt?.needsFal === true ||
    (!opt &&
      /^(veo|kling|wan|minimax|seedance|fal-ai\/|bytedance\/)/i.test(id.trim()))
  if (needsFal) await ensureKey("fal")
  else await ensureKey("gateway")
}

async function trackedJson(
  route: UsageRoute,
  url: string,
  init?: RequestInit,
  meta?: { model?: string },
) {
  const usage = useUsageStore()
  const started = performance.now()
  let status = 0
  try {
    const res = await fetch(url, withAuth(init))
    status = res.status
    const headerMs = Number(res.headers.get("x-response-time-ms"))
    const data = await parseJson(res)
    const tokenInfo = extractTokens(data)
    const model =
      meta?.model ||
      (typeof (data as { model?: string }).model === "string"
        ? (data as { model: string }).model
        : undefined)
    usage.record({
      route,
      durationMs: Number.isFinite(headerMs) && headerMs > 0 ? headerMs : performance.now() - started,
      ok: true,
      status,
      tokens: tokenInfo.tokens,
      promptTokens: tokenInfo.promptTokens,
      completionTokens: tokenInfo.completionTokens,
      cachedTokens: tokenInfo.cachedTokens,
      estimated: tokenInfo.estimated || tokenInfo.tokens <= 0,
      model,
    })
    maybeRecordAssets(route, data, model)
    return data
  } catch (error) {
    if (!isApiKeyRequiredError(error)) {
      usage.record({
        route,
        durationMs: performance.now() - started,
        ok: false,
        status: status || undefined,
        tokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        estimated: true,
        model: meta?.model,
      })
    }
    throw error
  }
}

function maybeRecordAssets(route: UsageRoute, data: unknown, model?: string) {
  if (!data || typeof data !== "object") return
  try {
    const assets = useAssetsStore()
    const source = sourceFromRoute(route)
    const obj = data as Record<string, unknown>
    const prompt =
      (typeof obj.prompt === "string" && obj.prompt) ||
      (typeof obj.workingPrompt === "string" && obj.workingPrompt) ||
      ""

    const media = extractMediaUrl(data)
    if (media) {
      assets.add({ kind: media.kind, url: media.url, prompt, source, model })
    }

    if (route === "storyboard-run" || route === "ad-run") {
      const state = obj.state as Record<string, unknown> | undefined
      if (!state) return
      const working = typeof state.workingPrompt === "string" ? state.workingPrompt : prompt
      if (typeof state.masterUrl === "string") {
        assets.add({ kind: "image", url: state.masterUrl, prompt: working, source, model })
      }
      for (const url of (state.processedPanels as string[]) || []) {
        if (typeof url === "string") assets.add({ kind: "image", url, prompt: working, source })
      }
      for (const url of (state.transitionPanels as string[]) || []) {
        if (typeof url === "string") assets.add({ kind: "image", url, prompt: working, source })
      }
      for (const panel of (state.panels as Array<Record<string, unknown>>) || []) {
        if (typeof panel?.imageUrl === "string") {
          assets.add({ kind: "image", url: panel.imageUrl, prompt: String(panel.prompt || working), source })
        }
        if (typeof panel?.videoUrl === "string") {
          assets.add({
            kind: "video",
            url: panel.videoUrl,
            thumbUrl: typeof panel.imageUrl === "string" ? panel.imageUrl : undefined,
            prompt: String(panel.prompt || working),
            source,
            model,
          })
        }
      }
    }
  } catch (e) {
    console.warn("Failed to record media asset", e)
  }
}

export async function checkApiKey(): Promise<{
  configured: boolean
  textConfigured?: boolean
  falConfigured?: boolean
  sources?: { aiGateway: string; text?: string; fal: string }
}> {
  const res = await fetch("/api/seq/check-api-key", withAuth())
  return parseJson(res)
}

export async function enhanceText(prompt: string): Promise<{ enhancedPrompt: string }> {
  await ensureKey("text")
  return trackedJson("enhance-text", "/api/seq/enhance-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  })
}

export async function enhancePrompt(payload: {
  imageUrl: string
  masterDescription?: string
  panelPrompt?: string
}): Promise<{ enhancedPrompt: string }> {
  await ensureKey("gateway")
  return trackedJson("enhance-prompt", "/api/seq/enhance-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export async function analyzeStoryboard(imageUrl: string): Promise<{ panelCount: number; description?: string }> {
  await ensureKey("gateway")
  return trackedJson("analyze-storyboard", "/api/seq/analyze-storyboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl }),
  })
}

export async function generateImage(form: FormData): Promise<{ url: string; prompt: string; description?: string }> {
  await ensureImageKey()
  return trackedJson("generate-image", "/api/seq/generate-image", { method: "POST", body: form })
}

export async function generateVideo(payload: {
  prompt: string
  imageUrl?: string
  linkedImageUrl?: string
  duration?: number
  aspectRatio?: string
  useFastModel?: boolean
  model?: string
}): Promise<Record<string, unknown>> {
  await ensureVideoKey(payload.model)
  return trackedJson(
    "generate-video",
    "/api/seq/generate-video",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { model: payload.model },
  )
}

export async function upscale(image_url: string, prompt?: string): Promise<Record<string, unknown>> {
  await ensureKey("fal")
  return trackedJson("upscale", "/api/seq/upscale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url, prompt }),
  })
}

export async function runStoryboardPipeline(payload: {
  prompt: string
  options?: {
    enhanceText?: boolean
    extractPanels?: boolean
    enhanceVideoPrompts?: boolean
    generateVideos?: boolean
    useFastVideo?: boolean
    aspectRatio?: string
    maxPanels?: number
  }
}): Promise<{
  engine: string
  phase: string
  prompt?: string
  workingPrompt?: string
  masterUrl?: string | null
  panelCount: number
  analysis?: string
  panels: Array<{ index?: number; imageUrl?: string; prompt?: string; videoUrl?: string; error?: string }>
  errors: string[]
}> {
  await ensureKey("gateway")
  if (payload.options?.generateVideos) await ensureVideoKey()
  return trackedJson("storyboard-run", "/api/seq/storyboard/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export type StoryboardSessionResponse = {
  engine: string
  threadId: string
  status: "interrupted" | "completed" | "failed" | "not_found"
  waitingFor: string
  interrupt: Record<string, unknown> | null
  state: {
    prompt?: string
    workingPrompt?: string
    masterUrl?: string | null
    panelCount: number
    analysis?: string
    transitionUrl?: string | null
    transitionPanels: string[]
    processedPanels: string[]
    panels: Array<{
      index?: number
      imageUrl?: string
      linkedImageUrl?: string
      prompt?: string
      videoUrl?: string
      duration?: number
      error?: string
    }>
    step?: string
    phase?: string
    waitingFor?: string
    errors: string[]
  }
}

export async function startStoryboardSession(payload: {
  prompt?: string
  masterUrl?: string
  options?: {
    enhanceText?: boolean
    aspectRatio?: string
    maxPanels?: number
    useFastVideo?: boolean
  }
}): Promise<StoryboardSessionResponse> {
  await ensureKey("gateway")
  return trackedJson("storyboard-run", "/api/seq/storyboard/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export async function resumeStoryboardSession(
  threadId: string,
  payload: {
    action: string
    transitionPrompt?: string
    prompt?: string
    panelCount?: number
    panels?: Array<string | Record<string, unknown>>
    enhanceVideoPrompts?: boolean
    generateVideos?: boolean
    useFastVideo?: boolean
  },
): Promise<StoryboardSessionResponse> {
  await ensureKey("gateway")
  if (payload.generateVideos) await ensureVideoKey()
  return trackedJson("storyboard-run", `/api/seq/storyboard/session/${threadId}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export async function getStoryboardSession(threadId: string): Promise<StoryboardSessionResponse> {
  await ensureKey("gateway")
  return trackedJson("storyboard-run", `/api/seq/storyboard/session/${threadId}`, {
    method: "GET",
  })
}

export type AdBrief = {
  product: string
  sellingPoints?: string
  audience?: string
  cta?: string
  durationSec?: number
  aspectRatio?: string
  platform?: string
  template?: string
  tone?: string
}

export type AdSessionResponse = {
  engine: string
  mode?: string
  threadId: string
  status: "interrupted" | "completed" | "failed" | "not_found"
  waitingFor: string
  interrupt: Record<string, unknown> | null
  state: {
    brief?: AdBrief
    workingPrompt?: string
    copy: {
      hook: string
      lines: string[]
      cta: string
      visualBrief: string
    }
    masterUrl?: string | null
    panelCount: number
    analysis?: string
    transitionPanels: string[]
    processedPanels: string[]
    panels: Array<{
      index?: number
      imageUrl?: string
      linkedImageUrl?: string
      prompt?: string
      videoUrl?: string
      duration?: number
      subtitle?: string
      error?: string
    }>
    step?: string
    phase?: string
    waitingFor?: string
    errors: string[]
  }
}

export async function startAdSession(payload: {
  brief: AdBrief
  options?: { maxPanels?: number; useFastVideo?: boolean }
}): Promise<AdSessionResponse> {
  await ensureKey("gateway")
  return trackedJson("ad-run", "/api/seq/ads/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export async function resumeAdSession(
  threadId: string,
  payload: {
    action: string
    hook?: string
    lines?: string[]
    cta?: string
    visualBrief?: string
    notes?: string
    transitionPrompt?: string
    panelCount?: number
    panels?: Array<string | Record<string, unknown>>
    enhanceVideoPrompts?: boolean
    generateVideos?: boolean
    useFastVideo?: boolean
  },
): Promise<AdSessionResponse> {
  await ensureKey("gateway")
  if (payload.generateVideos) await ensureVideoKey()
  return trackedJson("ad-run", `/api/seq/ads/session/${threadId}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export function extractVideoUrl(result: Record<string, unknown>): string | null {
  const data = (result.data as Record<string, unknown> | undefined) || result
  const video = data.video as { url?: string } | undefined
  if (video?.url) return video.url
  if (typeof data.url === "string") return data.url
  if (typeof result.video_url === "string") return result.video_url as string
  return null
}
