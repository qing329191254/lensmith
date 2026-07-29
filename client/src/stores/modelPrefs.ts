import { computed, ref, watch } from "vue"
import { defineStore } from "pinia"

const STORAGE_KEY = "lensmith-model-prefs"

/** Recommended defaults — product suggestion, not a lock-in. */
export const RECOMMENDED = {
  textModel: "google/gemini-2.5-flash",
  imageModel: "google/gemini-3-pro-image",
  videoModel: "veo3-fast",
} as const

export type ModelRole = "text" | "image" | "video"

export interface ModelOption {
  id: string
  label: string
  role: ModelRole
  recommended?: boolean
  vendor: string
  /** Easier to reach from mainland China (中转 / 国内平台) */
  cnFriendly?: boolean
  needsGateway?: boolean
  needsFal?: boolean
  supportsEdit?: boolean
  /** Can also do board analysis / frame understanding */
  supportsVision?: boolean
  supportsI2v?: boolean
  supportsFirstLast?: boolean
  note?: string
}

export const TEXT_MODEL_OPTIONS: ModelOption[] = [
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    role: "text",
    vendor: "Google",
    recommended: true,
    needsGateway: true,
  },
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek Chat",
    role: "text",
    vendor: "DeepSeek",
    cnFriendly: true,
    needsGateway: true,
    note: "低价",
  },
  {
    id: "zai/glm-4.5-flash",
    label: "GLM-4.5 Flash",
    role: "text",
    vendor: "Z.AI",
    cnFriendly: true,
    needsGateway: true,
  },
  {
    id: "openai/gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    role: "text",
    vendor: "OpenAI",
    needsGateway: true,
  },
  {
    id: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4",
    role: "text",
    vendor: "Anthropic",
    needsGateway: true,
  },
]

export const IMAGE_MODEL_OPTIONS: ModelOption[] = [
  {
    id: "google/gemini-3-pro-image",
    label: "Gemini 3 Pro Image",
    role: "image",
    vendor: "Google",
    recommended: true,
    needsGateway: true,
    supportsEdit: true,
    supportsVision: true,
    note: "生图 + 分析",
  },
  {
    id: "google/gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    role: "image",
    vendor: "Google",
    needsGateway: true,
    supportsEdit: true,
    supportsVision: true,
  },
  {
    id: "openai/gpt-image-1",
    label: "GPT Image 1",
    role: "image",
    vendor: "OpenAI",
    needsGateway: true,
    supportsEdit: true,
    supportsVision: false,
    note: "仅生图",
  },
  {
    id: "zhipu/cogview-3-flash",
    label: "CogView 3 Flash",
    role: "image",
    vendor: "Z.AI",
    cnFriendly: true,
    needsGateway: true,
    supportsEdit: false,
    supportsVision: false,
    note: "仅文生图",
  },
  {
    id: "zhipu/cogview-4",
    label: "CogView 4",
    role: "image",
    vendor: "Z.AI",
    cnFriendly: true,
    needsGateway: true,
    supportsEdit: false,
    supportsVision: false,
    note: "仅文生图",
  },
]

export const VIDEO_MODEL_OPTIONS: ModelOption[] = [
  {
    id: "veo3-fast",
    label: "Veo 3.1 Fast",
    role: "video",
    vendor: "Google",
    recommended: true,
    needsFal: true,
    supportsI2v: true,
    supportsFirstLast: true,
    note: "fal",
  },
  {
    id: "veo3-standard",
    label: "Veo 3.1 Standard",
    role: "video",
    vendor: "Google",
    needsFal: true,
    supportsI2v: true,
    supportsFirstLast: true,
    note: "fal",
  },
  {
    id: "kling-3",
    label: "Kling 3 Pro",
    role: "video",
    vendor: "Kuaishou",
    cnFriendly: true,
    needsFal: true,
    supportsI2v: true,
    supportsFirstLast: true,
    note: "fal",
  },
  {
    id: "kling-2.5",
    label: "Kling 2.5 Turbo Pro",
    role: "video",
    vendor: "Kuaishou",
    cnFriendly: true,
    needsFal: true,
    supportsI2v: true,
    supportsFirstLast: true,
    note: "fal",
  },
  {
    id: "seedance-2-fast",
    label: "Seedance 2.0 Fast",
    role: "video",
    vendor: "ByteDance",
    cnFriendly: true,
    needsFal: true,
    supportsI2v: true,
    supportsFirstLast: true,
    note: "fal",
  },
  {
    id: "wan-2.5",
    label: "WAN 2.5",
    role: "video",
    vendor: "Alibaba",
    cnFriendly: true,
    needsFal: true,
    supportsI2v: true,
    supportsFirstLast: false,
    note: "fal",
  },
  {
    id: "wan-2.2",
    label: "WAN 2.2 Transition",
    role: "video",
    vendor: "Alibaba",
    cnFriendly: true,
    needsFal: true,
    supportsI2v: false,
    supportsFirstLast: true,
    note: "fal · 首尾帧",
  },
  {
    id: "minimax-hailuo",
    label: "MiniMax Hailuo",
    role: "video",
    vendor: "MiniMax",
    cnFriendly: true,
    needsFal: true,
    supportsI2v: true,
    supportsFirstLast: false,
    note: "fal",
  },
  {
    id: "cogvideox-3",
    label: "CogVideoX-3",
    role: "video",
    vendor: "Zhipu",
    cnFriendly: true,
    needsGateway: true,
    supportsI2v: true,
    supportsFirstLast: true,
    note: "智谱 / 中转",
  },
  {
    id: "cogvideox-2",
    label: "CogVideoX-2",
    role: "video",
    vendor: "Zhipu",
    cnFriendly: true,
    needsGateway: true,
    supportsI2v: true,
    supportsFirstLast: true,
    note: "智谱 / 中转",
  },
  {
    id: "viduq1",
    label: "Vidu Q1",
    role: "video",
    vendor: "Vidu",
    cnFriendly: true,
    needsGateway: true,
    supportsI2v: true,
    supportsFirstLast: true,
    note: "智谱接口 / 中转",
  },
  {
    id: "vidu2-image",
    label: "Vidu 2 Image",
    role: "video",
    vendor: "Vidu",
    cnFriendly: true,
    needsGateway: true,
    supportsI2v: true,
    supportsFirstLast: false,
    note: "智谱接口 / 中转",
  },
]

export interface ModelPrefsState {
  textModel: string
  imageModel: string
  videoModel: string
  /**
   * Optional OpenAI-compatible proxy / 中转 Base URL.
   * Leave empty for defaults (Vercel Gateway / DeepSeek official).
   */
  gatewayBaseUrl: string
}

function load(): ModelPrefsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...RECOMMENDED, gatewayBaseUrl: "" }
    const parsed = JSON.parse(raw) as Partial<ModelPrefsState> & { textBaseUrl?: string }
    // Migrate old separate textBaseUrl into the single proxy URL if needed.
    const base =
      (typeof parsed.gatewayBaseUrl === "string" && parsed.gatewayBaseUrl.trim()) ||
      (typeof parsed.textBaseUrl === "string" && parsed.textBaseUrl.trim()) ||
      ""
    return {
      textModel: parsed.textModel?.trim() || RECOMMENDED.textModel,
      imageModel: parsed.imageModel?.trim() || RECOMMENDED.imageModel,
      videoModel: parsed.videoModel?.trim() || RECOMMENDED.videoModel,
      gatewayBaseUrl: base,
    }
  } catch {
    return { ...RECOMMENDED, gatewayBaseUrl: "" }
  }
}

export const useModelPrefsStore = defineStore("modelPrefs", () => {
  const initial = load()
  const textModel = ref(initial.textModel)
  const imageModel = ref(initial.imageModel)
  const videoModel = ref(initial.videoModel)
  const gatewayBaseUrl = ref(initial.gatewayBaseUrl)

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        textModel: textModel.value.trim() || RECOMMENDED.textModel,
        imageModel: imageModel.value.trim() || RECOMMENDED.imageModel,
        videoModel: videoModel.value.trim() || RECOMMENDED.videoModel,
        gatewayBaseUrl: gatewayBaseUrl.value.trim(),
      }),
    )
  }

  watch([textModel, imageModel, videoModel, gatewayBaseUrl], () => persist())

  function resetToRecommended() {
    textModel.value = RECOMMENDED.textModel
    imageModel.value = RECOMMENDED.imageModel
    videoModel.value = RECOMMENDED.videoModel
    gatewayBaseUrl.value = ""
  }

  function save(next: Partial<ModelPrefsState>) {
    if (next.textModel != null) textModel.value = next.textModel.trim() || RECOMMENDED.textModel
    if (next.imageModel != null) imageModel.value = next.imageModel.trim() || RECOMMENDED.imageModel
    if (next.videoModel != null) videoModel.value = next.videoModel.trim() || RECOMMENDED.videoModel
    if (next.gatewayBaseUrl != null) gatewayBaseUrl.value = next.gatewayBaseUrl.trim()
  }

  function modelHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "X-Text-Model": textModel.value.trim() || RECOMMENDED.textModel,
      "X-Image-Model": imageModel.value.trim() || RECOMMENDED.imageModel,
      "X-Video-Model": videoModel.value.trim() || RECOMMENDED.videoModel,
    }
    if (gatewayBaseUrl.value.trim()) {
      // One proxy URL for both text fallback and image/Gateway calls.
      headers["X-AI-Gateway-Base-Url"] = gatewayBaseUrl.value.trim()
      headers["X-Text-Base-Url"] = gatewayBaseUrl.value.trim()
    }
    return headers
  }

  const usingRecommended = computed(
    () =>
      textModel.value === RECOMMENDED.textModel &&
      imageModel.value === RECOMMENDED.imageModel &&
      videoModel.value === RECOMMENDED.videoModel &&
      !gatewayBaseUrl.value.trim(),
  )

  return {
    textModel,
    imageModel,
    videoModel,
    gatewayBaseUrl,
    usingRecommended,
    save,
    resetToRecommended,
    modelHeaders,
  }
})
