import { defineStore } from "pinia"
import { computed } from "vue"
import { useAssetsStore } from "@/stores/assets"

/** @deprecated Prefer useAssetsStore — kept for ImagePlayground compatibility. */
export interface ImageHistoryItem {
  id: string
  url: string
  prompt: string
  mode: string
  createdAt: number
}

export const useImageHistoryStore = defineStore("imageHistory", () => {
  const assets = useAssetsStore()

  const items = computed<ImageHistoryItem[]>(() =>
    assets.items
      .filter((a) => a.kind === "image")
      .map((a) => ({
        id: a.id,
        url: a.url,
        prompt: a.prompt || "",
        mode: a.source,
        createdAt: a.createdAt,
      })),
  )

  function load() {
    // assets store loads from localStorage on init
  }

  function add(item: Omit<ImageHistoryItem, "id" | "createdAt">) {
    assets.add({
      kind: "image",
      url: item.url,
      prompt: item.prompt,
      source: "image-playground",
    })
  }

  function remove(id: string) {
    assets.remove(id)
  }

  function clear() {
    for (const item of [...items.value]) assets.remove(item.id)
  }

  return { items, load, add, remove, clear }
})
