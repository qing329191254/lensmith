<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { ensureImageKey, generateImage, isRequestGateError } from "@/api/seq"
import FullscreenViewer from "@/components/images/FullscreenViewer.vue"
import ImageUploadSlot from "@/components/images/ImageUploadSlot.vue"
import { formatApiError } from "@/lib/provider-errors"
import { useImageHistoryStore } from "@/stores/imageHistory"

const { t } = useI18n()
const history = useImageHistoryStore()

const mode = ref<"text-to-image" | "image-editing">("text-to-image")
const prompt = ref("")
const aspectRatio = ref("square")
const busy = ref(false)
const error = ref("")
const toast = ref("")
const resultUrl = ref("")
const selectedHistoryId = ref<string | null>(null)
const showFullscreen = ref(false)

const image1File = ref<File | null>(null)
const image2File = ref<File | null>(null)
const image1Preview = ref("")
const image2Preview = ref("")

const ratios = [
  { value: "square", label: "1:1" },
  { value: "portrait", label: "9:16" },
  { value: "landscape", label: "16:9" },
  { value: "wide", label: "21:9" },
  { value: "4:3", label: "4:3" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
  { value: "3:4", label: "3:4" },
  { value: "5:4", label: "5:4" },
  { value: "4:5", label: "4:5" },
]

const progressLabel = computed(() => (busy.value ? t("images.generating") : ""))

function showToast(message: string) {
  toast.value = message
  window.setTimeout(() => {
    if (toast.value === message) toast.value = ""
  }, 2500)
}

function revokePreview(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url)
}

function setImage(which: 1 | 2, file: File | null) {
  if (which === 1) {
    revokePreview(image1Preview.value)
    image1File.value = file
    image1Preview.value = file ? URL.createObjectURL(file) : ""
  } else {
    revokePreview(image2Preview.value)
    image2File.value = file
    image2Preview.value = file ? URL.createObjectURL(file) : ""
  }
}

function clearImage(which: 1 | 2) {
  setImage(which, null)
}

async function urlToFile(url: string, name = "generated.png"): Promise<File> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new File([blob], name, { type: blob.type || "image/png" })
}

async function useAsInput() {
  if (!resultUrl.value) return
  try {
    mode.value = "image-editing"
    const file = await urlToFile(resultUrl.value)
    setImage(1, file)
    showToast(t("images.usedAsInput"))
  } catch {
    showToast(t("images.copyFailed"))
  }
}

async function copyToClipboard() {
  if (!resultUrl.value) return
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = resultUrl.value
    await img.decode()
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext("2d")!.drawImage(img, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas"))), "image/png")
    })
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
    showToast(t("images.copied"))
  } catch {
    showToast(t("images.copyFailed"))
  }
}

function downloadResult() {
  if (!resultUrl.value) return
  const link = document.createElement("a")
  link.href = resultUrl.value
  link.download = `lensmith-${Date.now()}.png`
  link.click()
}

function selectHistory(id: string, url: string) {
  selectedHistoryId.value = id
  resultUrl.value = url
}

function deleteHistory(id: string) {
  history.remove(id)
  if (selectedHistoryId.value === id) {
    selectedHistoryId.value = null
    resultUrl.value = history.items[0]?.url ?? ""
  }
}

function handlePaste(event: ClipboardEvent) {
  if (mode.value !== "image-editing") return
  const items = event.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile()
      if (!file) continue
      if (!image1File.value) setImage(1, file)
      else if (!image2File.value) setImage(2, file)
      showToast(t("images.pasted"))
      event.preventDefault()
      break
    }
  }
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault()
    if (!busy.value) void run()
  }
}

async function run() {
  error.value = ""
  if (!prompt.value.trim()) {
    error.value = t("images.errPrompt")
    return
  }
  if (mode.value === "image-editing" && !image1File.value) {
    error.value = t("images.errImage")
    return
  }

  // 登录 / 密钥闸门先于 loading，避免「生成中」闪一下再跳转或弹密钥提示
  try {
    await ensureImageKey()
  } catch (e) {
    if (isRequestGateError(e)) return
    error.value = formatApiError(e, t)
    return
  }

  busy.value = true
  try {
    const form = new FormData()
    form.append("mode", mode.value)
    form.append("prompt", prompt.value.trim())
    form.append("aspectRatio", aspectRatio.value)
    if (mode.value === "image-editing") {
      if (image1File.value) form.append("image1", image1File.value)
      if (image2File.value) form.append("image2", image2File.value)
    }
    const result = await generateImage(form)
    resultUrl.value = result.url
    const saved = history.add({ url: result.url, prompt: result.prompt, mode: mode.value })
    selectedHistoryId.value = saved?.id ?? history.items[0]?.id ?? null
    if (!saved && result.url?.startsWith("data:")) {
      showToast(t("images.historySkippedLarge"))
    }
  } catch (e) {
    if (isRequestGateError(e)) return
    error.value = formatApiError(e, t)
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  history.load()
  window.addEventListener("paste", handlePaste)
  window.addEventListener("keydown", handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener("paste", handlePaste)
  window.removeEventListener("keydown", handleKeydown)
  revokePreview(image1Preview.value)
  revokePreview(image2Preview.value)
})
</script>

<template>
  <section class="page-container py-8 sm:py-10">
    <div class="mb-8">
      <p class="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">{{ t("images.eyebrow") }}</p>
      <h1 class="display mt-3 text-3xl md:text-4xl">{{ t("images.title") }}</h1>
      <p class="mt-2 max-w-2xl text-[var(--muted)]">{{ t("images.subtitle") }}</p>
    </div>

    <div class="grid items-start gap-8 lg:grid-cols-[1fr_1fr]">
      <div class="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 lg:sticky lg:top-4">
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm"
            :class="mode === 'text-to-image' ? 'bg-[var(--accent)] font-semibold text-[#1a120c]' : 'border border-[var(--border)]'"
            @click="mode = 'text-to-image'"
          >
            {{ t("images.modeText") }}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm"
            :class="mode === 'image-editing' ? 'bg-[var(--accent)] font-semibold text-[#1a120c]' : 'border border-[var(--border)]'"
            @click="mode = 'image-editing'"
          >
            {{ t("images.modeEdit") }}
          </button>
        </div>

        <label class="block text-sm text-[var(--muted)]">{{ t("images.prompt") }}</label>
        <textarea
          v-model="prompt"
          rows="4"
          class="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none focus:border-[var(--focus)]"
          :placeholder="t('images.promptPlaceholder')"
        />

        <label class="block text-sm text-[var(--muted)]">{{ t("images.aspect") }}</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="r in ratios"
            :key="r.value"
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs transition"
            :class="
              aspectRatio === r.value
                ? 'bg-[var(--accent)] font-semibold text-[#1a120c]'
                : 'border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]'
            "
            @click="aspectRatio = r.value"
          >
            {{ r.label }}
          </button>
        </div>

        <div v-if="mode === 'image-editing'" class="grid gap-3 sm:grid-cols-2">
          <ImageUploadSlot
            :slot-number="1"
            :preview="image1Preview"
            :label="t('images.image1')"
            @select="setImage(1, $event)"
            @clear="clearImage(1)"
          />
          <ImageUploadSlot
            :slot-number="2"
            :preview="image2Preview"
            :label="t('images.image2')"
            @select="setImage(2, $event)"
            @clear="clearImage(2)"
          />
        </div>

        <p v-if="error" class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {{ error }}
        </p>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="generate-btn rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[#1a120c] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="busy"
            @click="run"
          >
            {{ busy ? t("images.generating") : t("images.generate") }}
          </button>
          <span class="text-xs text-[var(--muted)]">{{ t("images.shortcutHint") }}</span>
        </div>

        <div v-if="busy" class="h-1 overflow-hidden rounded-full bg-[var(--surface)]">
          <div class="h-full w-1/3 animate-pulse rounded-full bg-[var(--accent)]" />
        </div>
        <p v-if="progressLabel" class="text-xs text-[var(--muted)]">{{ progressLabel }}</p>
      </div>

      <div class="space-y-4">
        <div
          class="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]"
        >
          <img
            v-if="resultUrl"
            :src="resultUrl"
            :alt="t('images.altResult')"
            class="h-full w-full cursor-zoom-in object-contain"
            @click="showFullscreen = true"
          />
          <p v-else class="text-sm text-[var(--muted)]">{{ t("images.resultPlaceholder") }}</p>
        </div>

        <div class="flex min-h-[2rem] flex-wrap gap-2">
          <template v-if="resultUrl">
            <button
              type="button"
              class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--accent)]"
              @click="downloadResult"
            >
              {{ t("images.download") }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--accent)]"
              @click="copyToClipboard"
            >
              {{ t("images.copy") }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--accent)]"
              @click="showFullscreen = true"
            >
              {{ t("images.fullscreen") }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--accent)]"
              @click="useAsInput"
            >
              {{ t("images.useAsInput") }}
            </button>
          </template>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-sm font-medium text-[var(--muted)]">{{ t("images.history") }}</h2>
            <button
              v-if="history.items.length"
              type="button"
              class="text-xs text-[var(--muted)] hover:text-[var(--text)]"
              @click="history.clear()"
            >
              {{ t("images.clear") }}
            </button>
          </div>
          <p v-if="!history.items.length" class="text-sm text-[var(--muted)]">{{ t("images.historyEmpty") }}</p>
          <div v-else class="max-h-[min(360px,45vh)] overflow-y-auto overscroll-contain pr-1">
            <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
              <div
                v-for="item in history.items"
                :key="item.id"
                class="group relative overflow-hidden rounded-lg border"
                :class="selectedHistoryId === item.id ? 'border-[var(--accent)]' : 'border-[var(--border)]'"
              >
                <button type="button" class="block w-full" @click="selectHistory(item.id, item.url)">
                  <img
                    :src="item.url"
                    :alt="item.prompt"
                    class="aspect-square object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </button>
                <button
                  type="button"
                  class="absolute right-1 top-1 rounded bg-[rgba(12,17,24,0.85)] p-1 text-[var(--muted)] opacity-0 transition group-hover:opacity-100 hover:text-red-200"
                  :aria-label="t('images.deleteItem')"
                  @click.stop="deleteHistory(item.id)"
                >
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <FullscreenViewer v-if="showFullscreen && resultUrl" :image-url="resultUrl" @close="showFullscreen = false" />

    <div
      v-if="toast"
      class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm shadow-lg"
    >
      {{ toast }}
    </div>
  </section>
</template>

<style scoped>
.generate-btn {
  cursor: pointer;
  transition:
    transform 0.12s ease,
    filter 0.15s ease,
    box-shadow 0.15s ease;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.12) inset;
}
.generate-btn:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.16) inset,
    0 6px 16px rgba(232, 168, 124, 0.28);
}
.generate-btn:active:not(:disabled) {
  transform: translateY(1px) scale(0.97);
  filter: brightness(0.94);
  box-shadow: 0 0 0 rgba(0, 0, 0, 0);
}
</style>
