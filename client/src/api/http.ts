/**
 * 共用 API 请求层（不用 axios）。
 *
 * 没有绝对 baseURL：调用方使用同源相对路径，如 `/api/seq/...`。
 * 本地由 Vite 把 `/api` 代理到 `:8000`；线上 Docker 里由 nginx 把 `/api/` 转到 api 容器。
 *
 * 请求 / 响应“拦截”由下列封装完成：
 * - withAuth / ensureKey*  — 出站（鉴权头、密钥检查）
 * - parseJson / trackedJson — 入站（解析、用量统计、素材入库）
 */

import { useApiKeysStore } from "@/stores/apiKeys"
import { useApiKeyPromptStore, type ApiKeyKind } from "@/stores/apiKeyPrompt"
import { extractMediaUrl, sourceFromRoute, useAssetsStore } from "@/stores/assets"
import { VIDEO_MODEL_OPTIONS, useModelPrefsStore } from "@/stores/modelPrefs"
import { extractTokens, useUsageStore, type UsageRoute } from "@/stores/usage"

/** 缺少所需 BYO 密钥时抛出；UI 应打开密钥填写弹窗。 */
export class ApiKeyRequiredError extends Error {
  kind: ApiKeyKind

  constructor(kind: ApiKeyKind) {
    super("API_KEY_REQUIRED")
    this.name = "ApiKeyRequiredError"
    this.kind = kind
  }
}

export function isApiKeyRequiredError(error: unknown): error is ApiKeyRequiredError {
  return (
    error instanceof ApiKeyRequiredError ||
    (error instanceof Error && error.name === "ApiKeyRequiredError")
  )
}

/** 解析 JSON；HTTP 失败时可能弹出密钥提示并抛错。 */
export async function parseJson(res: Response) {
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

/** 根据服务端错误文案判断是否像缺密钥，是则打开对应密钥弹窗。 */
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

/** 附带 API Key 与模型偏好请求头，供 FastAPI 中间件读取。 */
export function withAuth(init: RequestInit = {}): RequestInit {
  const keys = useApiKeysStore()
  const prefs = useModelPrefsStore()
  const headers = new Headers(init.headers || {})
  for (const [k, v] of Object.entries(keys.authHeaders())) headers.set(k, v)
  for (const [k, v] of Object.entries(prefs.modelHeaders())) headers.set(k, v)
  return { ...init, headers }
}

export type ApiKeyStatus = {
  configured: boolean
  textConfigured?: boolean
  falConfigured?: boolean
  sources?: { aiGateway: string; text?: string; fal: string }
}

/** 探测浏览器 / 服务端是否已配置 text、gateway、fal 密钥。 */
export async function checkApiKey(): Promise<ApiKeyStatus> {
  const res = await fetch("/api/seq/check-api-key", withAuth())
  return (await parseJson(res)) as ApiKeyStatus
}

/**
 * 确保某类密钥可用（本地或服务端兜底）。
 * 仍缺失时打开密钥弹窗并抛出 ApiKeyRequiredError。
 */
export async function ensureKey(kind: ApiKeyKind): Promise<void> {
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
    // 本地无密钥且状态检查失败 → 继续弹窗
  }

  useApiKeyPromptStore().show(kind)
  throw new ApiKeyRequiredError(kind)
}

/** 图片 / 视觉相关接口使用 gateway（图像）密钥。 */
export async function ensureImageKey(): Promise<void> {
  await ensureKey("gateway")
}

/**
 * 视频密钥：目录里标记 needsFal 的走 fal；智谱兼容 / 中转类走 gateway。
 * 未知自定义模型：名称像 fal/veo/kling/… → fal，否则 gateway。
 */
export async function ensureVideoKey(model?: string): Promise<void> {
  const prefs = useModelPrefsStore()
  const id = model || prefs.videoModel
  const opt = VIDEO_MODEL_OPTIONS.find((o) => o.id === id)
  const needsFal =
    opt?.needsFal === true ||
    (!opt && /^(veo|kling|wan|minimax|seedance|fal-ai\/|bytedance\/)/i.test(id.trim()))
  if (needsFal) await ensureKey("fal")
  else await ensureKey("gateway")
}

/**
 * 带鉴权的 JSON 请求 + 用量统计 + 可选素材入库。
 * 作为 seq 业务路由的共用响应处理管线。
 */
export async function trackedJson(
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

/** 尽力从接口返回里提取图片/视频 URL，写入素材库。 */
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
          assets.add({
            kind: "image",
            url: panel.imageUrl,
            prompt: String(panel.prompt || working),
            source,
          })
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
