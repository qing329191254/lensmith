/**
 * Lensmith 业务接口，路径前缀 `/api/seq/*`。
 *
 * 共用请求逻辑在 `./http`（鉴权头、密钥检查、用量统计）。
 * 页面继续从 `@/api/seq` 导入即可；公共符号在下方再导出。
 */

import {
  checkApiKey,
  ensureImageKey,
  ensureKey,
  ensureVideoKey,
  trackedJson,
} from "@/api/http"
import { useApiKeysStore } from "@/stores/apiKeys"

export {
  ApiKeyRequiredError,
  AuthRequiredError,
  checkApiKey,
  ensureImageKey,
  ensureKey,
  ensureVideoKey,
  isApiKeyRequiredError,
  isAuthRequiredError,
  isRequestGateError,
} from "@/api/http"

// --- 文本 / 视觉 -----------------------------------------------------------

/** 用文本模型改写故事提示词（与生图共用绘图密钥）。 */
export async function enhanceText(prompt: string): Promise<{ enhancedPrompt: string }> {
  await ensureImageKey()
  return trackedJson("enhance-text", "/api/seq/enhance-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  })
}

/** 结合参考图优化分镜/镜头提示词（gateway / vision）。 */
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

/**
 * 从主分镜图分析格数与描述。
 * `soft: true`：无密钥时不弹窗，直接回退默认格数（上传预览用）。
 */
export async function analyzeStoryboard(
  imageUrl: string,
  options?: { soft?: boolean },
): Promise<{ panelCount: number; description?: string }> {
  if (options?.soft) {
    const keys = useApiKeysStore()
    if (!keys.hasGateway) {
      try {
        const status = await checkApiKey()
        if (!status.configured) return { panelCount: 6 }
      } catch {
        return { panelCount: 6 }
      }
    }
  } else {
    await ensureKey("gateway")
  }
  return trackedJson("analyze-storyboard", "/api/seq/analyze-storyboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl }),
  })
}

// --- 图片 / 视频 -----------------------------------------------------------

/** 生成或编辑图片（FormData：prompt、文件、模型字段等）。 */
export async function generateImage(
  form: FormData,
): Promise<{ url: string; prompt: string; description?: string }> {
  await ensureImageKey()
  return trackedJson("generate-image", "/api/seq/generate-image", { method: "POST", body: form })
}

/** 图生视频 / 文生视频；所需密钥随所选模型（fal 或 gateway）而定。 */
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

/** 通过 fal 放大图片。 */
export async function upscale(image_url: string, prompt?: string): Promise<Record<string, unknown>> {
  await ensureKey("fal")
  return trackedJson("upscale", "/api/seq/upscale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url, prompt }),
  })
}

// --- 分镜（一次性流水线 + 可中断会话）---------------------------------------

/** 一次性跑完 LangGraph 分镜流水线（无交互）。 */
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
  panels: Array<{
    index?: number
    imageUrl?: string
    prompt?: string
    videoUrl?: string
    error?: string
  }>
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

/** 开启可中断的分镜向导会话（人机协同）。 */
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

/** 用户确认某步后，恢复分镜会话。 */
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

/** 查询 / 刷新分镜会话状态。 */
export async function getStoryboardSession(threadId: string): Promise<StoryboardSessionResponse> {
  await ensureKey("gateway")
  return trackedJson("storyboard-run", `/api/seq/storyboard/session/${threadId}`, {
    method: "GET",
  })
}

/** 从 fal / 各厂商返回结构中取出可播放的视频 URL。 */
export function extractVideoUrl(result: Record<string, unknown>): string | null {
  const data = (result.data as Record<string, unknown> | undefined) || result
  const video = data.video as { url?: string } | undefined
  if (video?.url) return video.url
  if (typeof data.url === "string") return data.url
  if (typeof result.video_url === "string") return result.video_url as string
  return null
}
