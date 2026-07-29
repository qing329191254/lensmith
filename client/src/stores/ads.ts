import { defineStore } from "pinia"
import { ref } from "vue"
import type { AdBrief } from "@/api/seq"

export type AdStep = "brief" | "copy" | "master" | "transition" | "process" | "selection" | "result"

export const useAdStore = defineStore("ads", () => {
  const step = ref<AdStep>("brief")
  const threadId = ref<string | null>(null)
  const waitingFor = ref("")
  const brief = ref<AdBrief>({
    product: "",
    sellingPoints: "",
    audience: "",
    cta: "",
    durationSec: 15,
    aspectRatio: "9:16",
    platform: "tiktok",
    template: "pain-product-cta",
    tone: "energetic",
  })
  const copy = ref({
    hook: "",
    lines: [] as string[],
    cta: "",
    visualBrief: "",
  })
  const masterUrl = ref<string | null>(null)
  const panelCount = ref(6)
  const workingPrompt = ref("")
  const transitionPanels = ref<string[]>([])
  const processedPanels = ref<string[]>([])
  const finalPanels = ref<string[]>([])
  const linkedPanelData = ref<Record<number, string>>({})
  const prompts = ref<Record<number, string>>({})
  const durations = ref<Record<number, number>>({})
  const videoUrls = ref<Record<number, string>>({})
  const subtitles = ref<Record<number, string>>({})

  function clear() {
    step.value = "brief"
    threadId.value = null
    waitingFor.value = ""
    brief.value = {
      product: "",
      sellingPoints: "",
      audience: "",
      cta: "",
      durationSec: 15,
      aspectRatio: "9:16",
      platform: "tiktok",
      template: "pain-product-cta",
      tone: "energetic",
    }
    copy.value = { hook: "", lines: [], cta: "", visualBrief: "" }
    masterUrl.value = null
    panelCount.value = 6
    workingPrompt.value = ""
    transitionPanels.value = []
    processedPanels.value = []
    finalPanels.value = []
    linkedPanelData.value = {}
    prompts.value = {}
    durations.value = {}
    videoUrls.value = {}
    subtitles.value = {}
  }

  return {
    step,
    threadId,
    waitingFor,
    brief,
    copy,
    masterUrl,
    panelCount,
    workingPrompt,
    transitionPanels,
    processedPanels,
    finalPanels,
    linkedPanelData,
    prompts,
    durations,
    videoUrls,
    subtitles,
    clear,
  }
})
