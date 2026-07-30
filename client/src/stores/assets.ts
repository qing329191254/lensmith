import { computed, ref, watch } from "vue"
import { defineStore } from "pinia"
import { clearCloudAssets, deleteCloudAsset, pushCloudAsset } from "@/api/me"

export type AssetKind = "image" | "video"
export type AssetSource =
  | "image-playground"
  | "storyboard"
  | "ads"
  | "upscale"
  | "other"

export interface MediaAsset {
  id: string
  kind: AssetKind
  url: string
  thumbUrl?: string
  prompt?: string
  source: AssetSource
  model?: string
  createdAt: number
}

const STORAGE_KEY = "lensmith-media-assets"
const LEGACY_IMAGE_HISTORY_KEY = "lensmith-image-history"
const MAX_ASSETS = 120
/** Skip giant data-URIs — they blow localStorage quota. */
const MAX_DATA_URI_CHARS = 180_000

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isStorableUrl(url: string) {
  if (!url || typeof url !== "string") return false
  if (url.startsWith("https://") || url.startsWith("http://")) return true
  if (url.startsWith("data:image/") || url.startsWith("data:video/")) {
    return url.length <= MAX_DATA_URI_CHARS
  }
  return false
}

function loadRaw(): MediaAsset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MediaAsset[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    /* ignore */
  }
  return migrateLegacyImageHistory()
}

function migrateLegacyImageHistory(): MediaAsset[] {
  try {
    const raw = localStorage.getItem(LEGACY_IMAGE_HISTORY_KEY)
    if (!raw) return []
    const legacy = JSON.parse(raw) as Array<{
      id?: string
      url: string
      prompt?: string
      mode?: string
      createdAt?: number
    }>
    if (!Array.isArray(legacy)) return []
    return legacy
      .filter((item) => isStorableUrl(item.url))
      .map((item) => ({
        id: item.id || uid(),
        kind: "image" as const,
        url: item.url,
        prompt: item.prompt || "",
        source: "image-playground" as const,
        createdAt: item.createdAt || Date.now(),
      }))
  } catch {
    return []
  }
}

export const useAssetsStore = defineStore("assets", () => {
  const items = ref<MediaAsset[]>(loadRaw())
  let syncing = false

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value.slice(0, MAX_ASSETS)))
    } catch (e) {
      console.error("Failed to save media assets", e)
      // Drop oldest data-URI heavy items and retry once
      items.value = items.value.filter((a) => a.url.startsWith("http")).slice(0, MAX_ASSETS)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value))
      } catch {
        /* give up */
      }
    }
  }

  watch(
    items,
    () => {
      if (!syncing) persist()
    },
    { deep: true },
  )

  function add(input: {
    kind: AssetKind
    url: string
    prompt?: string
    source?: AssetSource
    model?: string
    thumbUrl?: string
  }) {
    if (!isStorableUrl(input.url)) return null
    const existing = items.value.find((a) => a.url === input.url)
    if (existing) return existing

    const asset: MediaAsset = {
      id: uid(),
      kind: input.kind,
      url: input.url,
      thumbUrl: input.thumbUrl,
      prompt: (input.prompt || "").slice(0, 500),
      source: input.source || "other",
      model: input.model,
      createdAt: Date.now(),
    }
    items.value = [asset, ...items.value].slice(0, MAX_ASSETS)
    if (localStorage.getItem("lensmith-auth-token")) {
      void pushCloudAsset({
        id: asset.id,
        kind: asset.kind,
        url: asset.url,
        thumbUrl: asset.thumbUrl,
        prompt: asset.prompt,
        source: asset.source,
        model: asset.model,
        createdAt: asset.createdAt,
      }).catch(() => {})
    }
    return asset
  }

  function remove(id: string) {
    items.value = items.value.filter((a) => a.id !== id)
    if (localStorage.getItem("lensmith-auth-token")) {
      void deleteCloudAsset(id).catch(() => {})
    }
  }

  function clear() {
    items.value = []
    localStorage.removeItem(STORAGE_KEY)
    if (localStorage.getItem("lensmith-auth-token")) {
      void clearCloudAssets().catch(() => {})
    }
  }

  function replaceAll(next: MediaAsset[]) {
    syncing = true
    items.value = next.slice(0, MAX_ASSETS)
    persist()
    syncing = false
  }

  const images = computed(() => items.value.filter((a) => a.kind === "image"))
  const videos = computed(() => items.value.filter((a) => a.kind === "video"))

  return {
    items,
    images,
    videos,
    add,
    remove,
    clear,
    replaceAll,
  }
})

/** Best-effort extract media URL from common API payloads. */
export function extractMediaUrl(data: unknown): { kind: AssetKind; url: string } | null {
  if (!data || typeof data !== "object") return null
  const obj = data as Record<string, unknown>

  if (typeof obj.url === "string" && (obj.url.startsWith("http") || obj.url.startsWith("data:image"))) {
    return { kind: "image", url: obj.url }
  }
  if (typeof obj.masterUrl === "string" && obj.masterUrl.startsWith("http")) {
    return { kind: "image", url: obj.masterUrl }
  }

  const nested = (obj.data as Record<string, unknown> | undefined) || obj
  const video = nested.video as { url?: string } | undefined
  if (video?.url) return { kind: "video", url: video.url }
  if (typeof nested.url === "string" && nested.url.includes(".mp4")) {
    return { kind: "video", url: nested.url }
  }
  if (typeof nested.video_url === "string") return { kind: "video", url: nested.video_url }
  if (typeof obj.videoUrl === "string") return { kind: "video", url: obj.videoUrl }

  return null
}

export function sourceFromRoute(route: string): AssetSource {
  if (route === "generate-image") return "image-playground"
  if (route === "upscale") return "image-playground"
  if (route === "generate-video") return "storyboard"
  if (route === "storyboard-run") return "storyboard"
  return "other"
}
