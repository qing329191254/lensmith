import { defineStore } from "pinia"
import { computed, ref } from "vue"

export type ApiKeyKind = "text" | "gateway" | "fal"

export const useApiKeyPromptStore = defineStore("apiKeyPrompt", () => {
  const visible = ref(false)
  const kind = ref<ApiKeyKind>("gateway")

  const titleKey = computed(() =>
    kind.value === "fal" ? "apiKeyPrompt.falTitle" : "apiKeyPrompt.gatewayTitle",
  )
  const bodyKey = computed(() =>
    kind.value === "fal" ? "apiKeyPrompt.falBody" : "apiKeyPrompt.gatewayBody",
  )

  function show(next: ApiKeyKind = "gateway") {
    // Separate text key is retired in UI — treat as image key.
    kind.value = next === "text" ? "gateway" : next
    visible.value = true
  }

  function dismiss() {
    visible.value = false
  }

  return {
    visible,
    kind,
    titleKey,
    bodyKey,
    show,
    dismiss,
  }
})
