import { defineStore } from "pinia"
import { computed, ref } from "vue"

export type ApiKeyKind = "text" | "gateway" | "fal"

export const useApiKeyPromptStore = defineStore("apiKeyPrompt", () => {
  const visible = ref(false)
  const kind = ref<ApiKeyKind>("gateway")

  const titleKey = computed(() => {
    if (kind.value === "fal") return "apiKeyPrompt.falTitle"
    if (kind.value === "text") return "apiKeyPrompt.textTitle"
    return "apiKeyPrompt.gatewayTitle"
  })
  const bodyKey = computed(() => {
    if (kind.value === "fal") return "apiKeyPrompt.falBody"
    if (kind.value === "text") return "apiKeyPrompt.textBody"
    return "apiKeyPrompt.gatewayBody"
  })

  function show(next: ApiKeyKind = "gateway") {
    kind.value = next
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
