import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { pushWorkspaceSettings } from "@/lib/push-settings"

const STORAGE_KEY = "lensmith-api-keys"

export interface ApiKeysState {
  /** Cheaper text-only providers (legacy). UI no longer collects this; falls back to aiGatewayKey. */
  textApiKey: string
  /** Primary API key: image / multimodal / prompt enhance / Gateway-compatible */
  aiGatewayKey: string
  falKey: string
}

function load(): ApiKeysState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { textApiKey: "", aiGatewayKey: "", falKey: "" }
    const parsed = JSON.parse(raw) as Partial<ApiKeysState> & { zhipuKey?: string }
    const gateway =
      (typeof parsed.aiGatewayKey === "string" && parsed.aiGatewayKey) ||
      (typeof parsed.zhipuKey === "string" && parsed.zhipuKey) ||
      ""
    return {
      textApiKey: typeof parsed.textApiKey === "string" ? parsed.textApiKey : "",
      aiGatewayKey: gateway,
      falKey: typeof parsed.falKey === "string" ? parsed.falKey : "",
    }
  } catch {
    return { textApiKey: "", aiGatewayKey: "", falKey: "" }
  }
}

export const useApiKeysStore = defineStore("apiKeys", () => {
  const initial = load()
  const textApiKey = ref(initial.textApiKey)
  const aiGatewayKey = ref(initial.aiGatewayKey)
  const falKey = ref(initial.falKey)

  const hasText = computed(() => Boolean(textApiKey.value.trim() || aiGatewayKey.value.trim()))
  const hasGateway = computed(() => Boolean(aiGatewayKey.value.trim()))
  const hasFal = computed(() => Boolean(falKey.value.trim()))
  const hasAny = computed(() => hasText.value || hasGateway.value || hasFal.value)

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        textApiKey: textApiKey.value.trim(),
        aiGatewayKey: aiGatewayKey.value.trim(),
        falKey: falKey.value.trim(),
      }),
    )
  }

  function save(next: ApiKeysState) {
    textApiKey.value = next.textApiKey.trim()
    aiGatewayKey.value = next.aiGatewayKey.trim()
    falKey.value = next.falKey.trim()
    persist()
    pushWorkspaceSettings()
  }

  function applyRemote(next: ApiKeysState) {
    textApiKey.value = next.textApiKey.trim()
    aiGatewayKey.value = next.aiGatewayKey.trim()
    falKey.value = next.falKey.trim()
    persist()
  }

  function clear() {
    textApiKey.value = ""
    aiGatewayKey.value = ""
    falKey.value = ""
    localStorage.removeItem(STORAGE_KEY)
    pushWorkspaceSettings()
  }

  function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    if (textApiKey.value.trim()) headers["X-Text-Api-Key"] = textApiKey.value.trim()
    if (aiGatewayKey.value.trim()) headers["X-AI-Gateway-Api-Key"] = aiGatewayKey.value.trim()
    if (falKey.value.trim()) headers["X-Fal-Key"] = falKey.value.trim()
    return headers
  }

  return {
    textApiKey,
    aiGatewayKey,
    falKey,
    hasText,
    hasGateway,
    hasFal,
    hasAny,
    save,
    applyRemote,
    clear,
    authHeaders,
  }
})
