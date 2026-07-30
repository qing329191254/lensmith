import { defineStore } from "pinia"
import { ref, watch } from "vue"

export type StoryboardStep = "prompt" | "transition" | "process" | "selection" | "result"

export interface MasterData {
  url: string
  prompt: string
  panelCount: number
}

interface SessionPayload {
  step: StoryboardStep
  masterData: MasterData | null
  processedPanels: string[]
  finalPanels: string[]
  linkedPanelData: Record<number, string>
  transitionPanels: string[]
  prompts: Record<number, string>
  durations: Record<number, number>
  videoUrls: Record<number, string>
  threadId: string | null
  timestamp: number
}

const SESSION_KEY = "lensmith-storyboard-session"
export const STORAGE_MODE_KEY = "storyboard-storage-mode"

export type StorageMode = "persistent" | "temporal"

export const useStoryboardStore = defineStore("storyboard", () => {
  const step = ref<StoryboardStep>("prompt")
  const storageMode = ref<StorageMode>("temporal")
  const masterData = ref<MasterData | null>(null)
  const processedPanels = ref<string[]>([])
  const finalPanels = ref<string[]>([])
  const linkedPanelData = ref<Record<number, string>>({})
  const transitionPanels = ref<string[]>([])
  const prompts = ref<Record<number, string>>({})
  const durations = ref<Record<number, number>>({})
  const videoUrls = ref<Record<number, string>>({})
  const threadId = ref<string | null>(null)
  const restored = ref(false)

  function persist() {
    const payload: SessionPayload = {
      step: step.value,
      masterData: masterData.value,
      processedPanels: processedPanels.value,
      finalPanels: finalPanels.value,
      linkedPanelData: linkedPanelData.value,
      transitionPanels: transitionPanels.value,
      prompts: prompts.value,
      durations: durations.value,
      videoUrls: videoUrls.value,
      threadId: threadId.value,
      timestamp: Date.now(),
    }
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
    } catch (e) {
      console.error("Failed to save storyboard session", e)
    }
  }

  function loadStorageMode() {
    try {
      const saved = localStorage.getItem(STORAGE_MODE_KEY) as StorageMode | null
      if (saved === "persistent" || saved === "temporal") {
        storageMode.value = saved
      }
    } catch (e) {
      console.error("Failed to load storage mode", e)
    }
  }

  function setStorageMode(mode: StorageMode) {
    storageMode.value = mode
    try {
      localStorage.setItem(STORAGE_MODE_KEY, mode)
    } catch (e) {
      console.error("Failed to save storage mode", e)
    }
  }

  function load() {
    loadStorageMode()
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return
      const session = JSON.parse(raw) as SessionPayload
      if (Date.now() - session.timestamp > 24 * 60 * 60 * 1000) {
        clear()
        return
      }
      step.value = session.step || "prompt"
      masterData.value = session.masterData || null
      processedPanels.value = session.processedPanels || []
      finalPanels.value = session.finalPanels || []
      linkedPanelData.value = session.linkedPanelData || {}
      transitionPanels.value = session.transitionPanels || []
      prompts.value = session.prompts || {}
      durations.value = session.durations || {}
      videoUrls.value = session.videoUrls || {}
      // Server checkpointer is in-memory; stale thread ids are useless after restart.
      threadId.value = null
      // Only flag "restored" when we actually resume mid-flow (not a leftover prompt screen).
      restored.value = step.value !== "prompt"
    } catch (e) {
      console.error("Failed to load storyboard session", e)
    }
  }

  function clear() {
    localStorage.removeItem(SESSION_KEY)
    step.value = "prompt"
    masterData.value = null
    processedPanels.value = []
    finalPanels.value = []
    linkedPanelData.value = {}
    transitionPanels.value = []
    prompts.value = {}
    durations.value = {}
    videoUrls.value = {}
    threadId.value = null
    restored.value = false
  }

  watch(
    [step, masterData, processedPanels, finalPanels, linkedPanelData, transitionPanels, prompts, durations, videoUrls, threadId],
    () => persist(),
    { deep: true },
  )

  return {
    step,
    storageMode,
    masterData,
    processedPanels,
    finalPanels,
    linkedPanelData,
    transitionPanels,
    prompts,
    durations,
    videoUrls,
    threadId,
    restored,
    load,
    loadStorageMode,
    setStorageMode,
    clear,
    persist,
  }
})
