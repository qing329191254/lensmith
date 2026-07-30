import { computed, ref, watch } from "vue"
import { defineStore } from "pinia"
import { pushWorkspaceSettings } from "@/lib/push-settings"

const STORAGE_KEY = "lensmith-model-prefs"

/** Recommended defaults — product suggestion, not a lock-in. */
export const RECOMMENDED = {
  textModel: "google/gemini-2.5-flash",
  imageModel: "google/gemini-3-pro-image",
  videoModel: "veo3-fast",
} as const

/**
 * Domestic one-key path via Volcengine Ark (即梦同源 Seedream + Seedance).
 * Panel-count vision soft-fails to defaults — main storyboard flow still works.
 */
export const PRESET_JIMENG = {
  textModel: "google/gemini-2.5-flash",
  imageModel: "doubao-seedream-4-0-250828",
  videoModel: "doubao-seedance-2-0-fast",
  gatewayBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
} as const

export type WorkspacePresetId = "recommended" | "jimeng"

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
    id: "doubao-seedream-4-0-250828",
    label: "Seedream 4.0（即梦）",
    role: "image",
    vendor: "Volcengine",
    cnFriendly: true,
    needsGateway: true,
    supportsEdit: true,
    supportsVision: false,
    note: "方舟 · 文生图/图生图",
  },
  {
    id: "doubao-seedream-4-5-251128",
    label: "Seedream 4.5（即梦）",
    role: "image",
    vendor: "Volcengine",
    cnFriendly: true,
    needsGateway: true,
    supportsEdit: true,
    supportsVision: false,
    note: "方舟 · 更高画质",
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
    note: "文生图；分镜精修为近似",
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
    note: "文生图；分镜精修为近似",
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
    id: "doubao-seedance-2-0-fast",
    label: "Seedance 2.0 Fast（即梦）",
    role: "video",
    vendor: "Volcengine",
    cnFriendly: true,
    needsGateway: true,
    needsFal: false,
    supportsI2v: true,
    supportsFirstLast: true,
    note: "方舟 · 推荐分镜",
  },
  {
    id: "doubao-seedance-2-0",
    label: "Seedance 2.0（即梦）",
    role: "video",
    vendor: "Volcengine",
    cnFriendly: true,
    needsGateway: true,
    needsFal: false,
    supportsI2v: true,
    supportsFirstLast: true,
    note: "方舟 · 更高画质",
  },
  {
    id: "doubao-seedance-2-0-mini",
    label: "Seedance 2.0 Mini（即梦）",
    role: "video",
    vendor: "Volcengine",
    cnFriendly: true,
    needsGateway: true,
    needsFal: false,
    supportsI2v: true,
    supportsFirstLast: true,
    note: "方舟 · 更省",
  },
  {
    id: "seedance-2-fast",
    label: "Seedance 2.0 Fast (fal)",
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
    // Official first/last-frame API is documented for CogVideoX-3.
    supportsFirstLast: false,
    note: "智谱 · 单图",
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

export const WORKSPACE_PRESETS: Record<
  WorkspacePresetId,
  { prefs: ModelPrefsState; needsFal: boolean }
> = {
  recommended: {
    prefs: { ...RECOMMENDED, gatewayBaseUrl: "" },
    needsFal: true,
  },
  jimeng: {
    prefs: { ...PRESET_JIMENG },
    needsFal: false,
  },
}

function load(): ModelPrefsState {
  // First visit: 即梦 / 方舟 one-key path (image + video, no fal).
  const fresh = { ...PRESET_JIMENG }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fresh
    const parsed = JSON.parse(raw) as Partial<ModelPrefsState> & { textBaseUrl?: string }
    // Migrate old separate textBaseUrl into the single proxy URL if needed.
    const base =
      (typeof parsed.gatewayBaseUrl === "string" && parsed.gatewayBaseUrl.trim()) ||
      (typeof parsed.textBaseUrl === "string" && parsed.textBaseUrl.trim()) ||
      ""
    return {
      textModel: parsed.textModel?.trim() || fresh.textModel,
      imageModel: parsed.imageModel?.trim() || fresh.imageModel,
      videoModel: parsed.videoModel?.trim() || fresh.videoModel,
      gatewayBaseUrl: base,
    }
  } catch {
    return fresh
  }
}

export const useModelPrefsStore = defineStore("modelPrefs", () => {
  const initial = load()
  const textModel = ref(initial.textModel)
  const imageModel = ref(initial.imageModel)
  const videoModel = ref(initial.videoModel)
  const gatewayBaseUrl = ref(initial.gatewayBaseUrl)
  let suppressPush = false

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

  watch([textModel, imageModel, videoModel, gatewayBaseUrl], () => {
    persist()
    if (!suppressPush) pushWorkspaceSettings()
  })

  function resetToRecommended() {
    applyPreset("recommended")
  }

  function applyPreset(id: WorkspacePresetId) {
    const next = WORKSPACE_PRESETS[id].prefs
    textModel.value = next.textModel
    imageModel.value = next.imageModel
    videoModel.value = next.videoModel
    gatewayBaseUrl.value = next.gatewayBaseUrl
  }

  function matchedPreset(): WorkspacePresetId | null {
    for (const id of Object.keys(WORKSPACE_PRESETS) as WorkspacePresetId[]) {
      const p = WORKSPACE_PRESETS[id].prefs
      if (
        textModel.value === p.textModel &&
        imageModel.value === p.imageModel &&
        videoModel.value === p.videoModel &&
        (gatewayBaseUrl.value.trim() || "") === (p.gatewayBaseUrl || "")
      ) {
        return id
      }
    }
    return null
  }

  function save(next: Partial<ModelPrefsState>) {
    if (next.textModel != null) textModel.value = next.textModel.trim() || RECOMMENDED.textModel
    if (next.imageModel != null) imageModel.value = next.imageModel.trim() || RECOMMENDED.imageModel
    if (next.videoModel != null) videoModel.value = next.videoModel.trim() || RECOMMENDED.videoModel
    if (next.gatewayBaseUrl != null) gatewayBaseUrl.value = next.gatewayBaseUrl.trim()
  }

  function applyRemote(next: Partial<ModelPrefsState>) {
    suppressPush = true
    if (next.textModel) textModel.value = next.textModel.trim() || RECOMMENDED.textModel
    if (next.imageModel) imageModel.value = next.imageModel.trim() || RECOMMENDED.imageModel
    if (next.videoModel) videoModel.value = next.videoModel.trim() || RECOMMENDED.videoModel
    if (next.gatewayBaseUrl != null) gatewayBaseUrl.value = next.gatewayBaseUrl.trim()
    persist()
    suppressPush = false
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

  const usingRecommended = computed(() => matchedPreset() === "recommended")
  const activePreset = computed(() => matchedPreset())

  return {
    textModel,
    imageModel,
    videoModel,
    gatewayBaseUrl,
    usingRecommended,
    activePreset,
    save,
    applyRemote,
    resetToRecommended,
    applyPreset,
    matchedPreset,
    modelHeaders,
  }
})
