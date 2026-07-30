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
import { useAuthStore } from "@/stores/auth"
import { VIDEO_MODEL_OPTIONS, useModelPrefsStore } from "@/stores/modelPrefs"
import { extractTokens, useUsageStore, type UsageRoute } from "@/stores/usage"
import router from "@/router"

/** 缺少所需 BYO 密钥时抛出；UI 应打开密钥填写弹窗。 */
export class ApiKeyRequiredError extends Error {
  kind: ApiKeyKind

  constructor(kind: ApiKeyKind) {
    super("API_KEY_REQUIRED")
    this.name = "ApiKeyRequiredError"
    this.kind = kind
  }
}

/** 需要登录才能使用需密钥的能力；已触发跳转登录页。 */
export class AuthRequiredError extends Error {
  constructor() {
    super("AUTH_REQUIRED")
    this.name = "AuthRequiredError"
  }
}

export function isApiKeyRequiredError(error: unknown): error is ApiKeyRequiredError {
  return (
    error instanceof ApiKeyRequiredError ||
    (error instanceof Error && error.name === "ApiKeyRequiredError")
  )
}

export function isAuthRequiredError(error: unknown): error is AuthRequiredError {
  return (
    error instanceof AuthRequiredError ||
    (error instanceof Error && error.name === "AuthRequiredError")
  )
}

/** 登录跳转或缺密钥弹窗：调用方应静默返回，勿当普通错误展示。 */
export function isRequestGateError(error: unknown): boolean {
  return isApiKeyRequiredError(error) || isAuthRequiredError(error)
}

/** 未登录则跳到登录页（带回跳），并抛出 AuthRequiredError。 */
function requireLogin(): void {
  const auth = useAuthStore()
  if (auth.isLoggedIn) return
  const path = router.currentRoute.value.fullPath
  router.push({
    name: "login",
    query: { redirect: path.startsWith("/") ? path : "/" },
  })
  throw new AuthRequiredError()
}

/** 解析 JSON；HTTP 失败时可能弹出密钥提示并抛错。 */
export async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const errorField = (data as { error?: string }).error
    const detailsField = (data as { details?: string }).details
    const errorText = typeof errorField === "string" ? errorField : ""
    const detailsText = typeof detailsField === "string" ? detailsField : ""
    const combined = [errorText, detailsText].filter(Boolean).join("\n")
    maybePromptFromMessage(combined)
    // Prefer short error for UI; keep quota/rate hints from details when the
    // top-level message is a generic provider failure.
    let text =
      errorText ||
      (detailsText && !detailsText.trimStart().startsWith("{") ? detailsText : "") ||
      res.statusText ||
      "Request failed"
    if (
      detailsText &&
      /余额|额度|欠费|quota|insufficient|rate limit|过于频繁/i.test(detailsText) &&
      !/quota|balance|rate limit|余额|额度/i.test(errorText)
    ) {
      text = `${errorText || text}\n${detailsText.slice(0, 240)}`
    }
    throw new Error(text)
  }
  return data
}

/** 仅在本地确实未配置密钥时弹窗；勿把「密钥无效 / 模型不匹配」误当成未填写。 */
function maybePromptFromMessage(message: string) {
  const lower = message.toLowerCase()
  const looksMissing =
    lower.includes("not configured") ||
    lower.includes("no api key") ||
    lower.includes("api key required") ||
    (lower.includes("缺少") && lower.includes("密钥")) ||
    (lower.includes("未配置") && (lower.includes("密钥") || lower.includes("api")))
  if (!looksMissing) return

  const keys = useApiKeysStore()
  const kind: ApiKeyKind = lower.includes("fal") ? "fal" : "gateway"
  if (kind === "fal" && keys.hasFal) return
  if (kind === "gateway" && keys.hasGateway) return
  useApiKeyPromptStore().show(kind)
}

/** 附带 API Key、模型偏好，以及登录 JWT（若有）。 */
export function withAuth(init: RequestInit = {}): RequestInit {
  const keys = useApiKeysStore()
  const prefs = useModelPrefsStore()
  const headers = new Headers(init.headers || {})
  for (const [k, v] of Object.entries(keys.authHeaders())) headers.set(k, v)
  for (const [k, v] of Object.entries(prefs.modelHeaders())) headers.set(k, v)
  const token = localStorage.getItem("lensmith-auth-token")
  if (token) headers.set("Authorization", `Bearer ${token}`)
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
 * 未登录先跳转登录；仍缺密钥时打开弹窗并抛出 ApiKeyRequiredError。
 */
export async function ensureKey(kind: ApiKeyKind): Promise<void> {
  requireLogin()

  // Prompt enhance shares the image key — never prompt for a separate text key.
  const resolved: ApiKeyKind = kind === "text" ? "gateway" : kind

  const keys = useApiKeysStore()
  if (resolved === "gateway" && keys.hasGateway) return
  if (resolved === "fal" && keys.hasFal) return

  try {
    const status = await checkApiKey()
    if (resolved === "gateway" && status.configured) return
    if (resolved === "fal" && status.falConfigured) return
  } catch {
    // 本地无密钥且状态检查失败 → 继续弹窗
  }

  useApiKeyPromptStore().show(resolved)
  throw new ApiKeyRequiredError(resolved)
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
    (!opt &&
      /^(veo|kling|wan|minimax|seedance-2|fal-ai\/|bytedance\/)/i.test(id.trim()) &&
      !/^doubao-seedance|^jimeng-seedance/i.test(id.trim()))
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
    if (!isRequestGateError(error)) {
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

    if (route === "storyboard-run") {
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
