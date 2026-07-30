import { defineStore } from "pinia"
import { ref } from "vue"

export type ToastKind = "success" | "error"

export const useToastStore = defineStore("toast", () => {
  const message = ref("")
  const kind = ref<ToastKind>("success")
  let timer: ReturnType<typeof setTimeout> | null = null

  function clear() {
    message.value = ""
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function show(text: string, nextKind: ToastKind = "success", ms = 2800) {
    message.value = text
    kind.value = nextKind
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      message.value = ""
      timer = null
    }, ms)
  }

  function success(text: string, ms?: number) {
    show(text, "success", ms)
  }

  function error(text: string, ms?: number) {
    show(text, "error", ms)
  }

  return { message, kind, show, success, error, clear }
})
