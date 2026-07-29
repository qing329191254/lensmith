<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { DEMO_FINAL_SEQUENCE } from "@/lib/demo-data"
import { extractPanelFromGrid } from "@/lib/panel-extraction"

interface FinalPanel {
  id: string
  type: "single" | "transition"
  imageUrl?: string
  linkedImageUrl?: string
  source?: "main" | "transition" | "custom"
  originalIndex?: number
  prompt?: string
  duration?: number
  videoUrl?: string
}

const props = defineProps<{
  panels: string[]
  masterUrl: string
  transitionPanels: string[]
  savedFinalPanels: string[]
  savedLinkedPanelData: Record<number, string>
  savedPrompts: Record<number, string>
  savedDurations: Record<number, number>
  savedVideoUrls: Record<number, string>
}>()

const emit = defineEmits<{
  confirm: [
    selectedPanels: string[],
    linkedData: Record<number, string>,
    promptsData: Record<number, string>,
    durationsData: Record<number, number>,
    videoUrlsData: Record<number, string>,
  ]
}>()

const { t } = useI18n()

const localPanels = ref<string[]>([...props.panels])
const regenerating = ref<number[]>([])
const customImages = ref<string[]>([])
const isUploading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const error = ref("")
const toast = ref("")

const finalPanels = ref<FinalPanel[]>(
  props.savedFinalPanels.length > 0
    ? props.savedFinalPanels.map((url, i) => ({
        id: crypto.randomUUID(),
        type: props.savedLinkedPanelData[i] ? ("transition" as const) : ("single" as const),
        imageUrl: url,
        linkedImageUrl: props.savedLinkedPanelData[i],
        originalIndex: i,
        videoUrl: props.savedVideoUrls[i],
      }))
    : [],
)

const selectingFor = ref<{ panelId: string; slot: "first" | "last" } | null>(null)

onMounted(() => {
  if (props.panels.length > 0) localPanels.value = [...props.panels]
})

function addSinglePanel(url: string, source: "main" | "transition" | "custom", originalIndex: number) {
  finalPanels.value = [
    ...finalPanels.value,
    {
      id: crypto.randomUUID(),
      type: "single",
      imageUrl: url,
      source,
      originalIndex,
    },
  ]
}

function addTransitionSlot() {
  const id = crypto.randomUUID()
  finalPanels.value = [...finalPanels.value, { id, type: "transition" }]
  selectingFor.value = { panelId: id, slot: "first" }
}

function setTransitionFrame(panelId: string, slot: "first" | "last", url: string) {
  finalPanels.value = finalPanels.value.map((p) => {
    if (p.id !== panelId || p.type !== "transition") return p
    if (slot === "first") return { ...p, imageUrl: url }
    return { ...p, linkedImageUrl: url }
  })
  selectingFor.value = slot === "first" ? { panelId, slot: "last" } : null
}

function removePanel(id: string) {
  finalPanels.value = finalPanels.value.filter((p) => p.id !== id)
}

function movePanel(index: number, direction: "up" | "down") {
  const newOrder = [...finalPanels.value]
  const targetIndex = direction === "up" ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= newOrder.length) return
  ;[newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]]
  finalPanels.value = newOrder
}

function swapTransitionFrames(panelId: string) {
  finalPanels.value = finalPanels.value.map((p) => {
    if (p.id === panelId && p.type === "transition" && p.imageUrl && p.linkedImageUrl) {
      return { ...p, imageUrl: p.linkedImageUrl, linkedImageUrl: p.imageUrl }
    }
    return p
  })
}

async function regeneratePanel(index: number) {
  regenerating.value = [...regenerating.value, index]
  try {
    const url = await extractPanelFromGrid(index, props.masterUrl, {
      columns: 3,
      kind: "main",
      uploadToBlob: false,
    })
    if (url) {
      const updated = [...localPanels.value]
      updated[index] = url
      localPanels.value = updated
    }
  } finally {
    regenerating.value = regenerating.value.filter((i) => i !== index)
  }
}

async function handleFileUpload(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return

  isUploading.value = true
  const newImages: string[] = []

  try {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        error.value = t("storyboard.selector.invalidType", { name: file.name })
        continue
      }
      if (file.size > 10 * 1024 * 1024) {
        error.value = t("storyboard.selector.tooLarge", { name: file.name })
        continue
      }

      let imageUrl: string | null = null
      try {
        const formData = new FormData()
        formData.append("file", file)
        const response = await fetch("/api/seq/upload", { method: "POST", body: formData })
        if (response.ok) {
          const data = await response.json()
          if (data.url) imageUrl = data.url
        }
      } catch {
        // fall through to data URI
      }

      if (!imageUrl) {
        imageUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      }

      newImages.push(imageUrl)
    }

    if (newImages.length > 0) {
      customImages.value = [...customImages.value, ...newImages]
      toast.value = t("storyboard.selector.imagesAdded", { count: newImages.length })
    }
  } catch {
    error.value = t("storyboard.selector.uploadFailed")
  } finally {
    isUploading.value = false
    if (fileInputRef.value) fileInputRef.value.value = ""
  }
}

function removeCustomImage(index: number) {
  customImages.value = customImages.value.filter((_, i) => i !== index)
}

function handlePanelClick(url: string, source: "main" | "transition" | "custom", index: number) {
  if (selectingFor.value) {
    setTransitionFrame(selectingFor.value.panelId, selectingFor.value.slot, url)
  } else {
    addSinglePanel(url, source, index)
  }
}

function handleConfirm() {
  error.value = ""
  const selectedPanels: string[] = []
  const linkedData: Record<number, string> = {}
  const promptsData: Record<number, string> = {}
  const durationsData: Record<number, number> = {}
  const videoUrlsData: Record<number, string> = {}

  for (let index = 0; index < finalPanels.value.length; index++) {
    const panel = finalPanels.value[index]
    if (panel.type === "transition") {
      if (!panel.imageUrl || !panel.linkedImageUrl) {
        error.value = t("storyboard.selector.incompleteTransition", { n: index + 1 })
        return
      }
      selectedPanels.push(panel.imageUrl)
      linkedData[index] = panel.linkedImageUrl
      if (panel.prompt) promptsData[index] = panel.prompt
      if (panel.duration) durationsData[index] = panel.duration
      if (panel.videoUrl) videoUrlsData[index] = panel.videoUrl
    } else if (panel.imageUrl) {
      selectedPanels.push(panel.imageUrl)
      if (panel.prompt) promptsData[index] = panel.prompt
      if (panel.duration) durationsData[index] = panel.duration
      if (panel.videoUrl) videoUrlsData[index] = panel.videoUrl
    }
  }

  if (selectedPanels.length === 0) {
    error.value = t("storyboard.errSelect")
    return
  }

  emit("confirm", selectedPanels, linkedData, promptsData, durationsData, videoUrlsData)
}

function loadDemoSequence() {
  finalPanels.value = DEMO_FINAL_SEQUENCE.panels.map((demoPanel) => ({
    id: crypto.randomUUID(),
    type: demoPanel.linkedImageUrl ? ("transition" as const) : ("single" as const),
    imageUrl: demoPanel.imageUrl,
    linkedImageUrl: demoPanel.linkedImageUrl,
    prompt: demoPanel.prompt,
    duration: demoPanel.duration,
    videoUrl: demoPanel.videoUrl,
  }))
  toast.value = t("storyboard.selector.demoLoaded", { count: finalPanels.value.length })
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
    <div>
      <h2 class="text-lg font-semibold">{{ t("storyboard.selector.title") }}</h2>
      <p class="mt-1 text-sm text-[var(--muted)]">{{ t("storyboard.selector.subtitle") }}</p>
      <details class="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs">
        <summary class="cursor-pointer px-3 py-2 text-[var(--muted)] hover:text-[var(--text)]">
          ⚠ {{ t("storyboard.selector.guidelinesTitle") }}
        </summary>
        <div class="px-3 pb-3 text-[var(--muted)]">{{ t("storyboard.selector.guidelines") }}</div>
      </details>
    </div>

    <p v-if="error" class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">{{ error }}</p>
    <p v-if="toast" class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{{ toast }}</p>

    <div class="grid gap-8 lg:grid-cols-2">
      <div class="space-y-6">
        <h3 class="text-xl font-bold">{{ t("storyboard.selector.available") }}</h3>

        <div>
          <h4 class="mb-2 text-sm font-semibold text-[var(--muted)]">{{ t("storyboard.selector.mainBoard") }}</h4>
          <div class="grid grid-cols-3 gap-3">
            <div
              v-for="(url, i) in localPanels"
              :key="`main-${i}`"
              class="group relative aspect-video cursor-pointer overflow-hidden rounded-lg transition hover:ring-2 hover:ring-[var(--focus)]"
              @click="handlePanelClick(url, 'main', i)"
            >
              <img :src="url" :alt="t('storyboard.panelAlt', { n: i + 1 })" class="h-full w-full object-cover" />
              <div class="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 font-mono text-xs text-white">
                M{{ i + 1 }}
              </div>
              <div class="absolute bottom-2 left-2 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  class="rounded bg-[var(--surface)] px-2 py-0.5 text-xs"
                  :disabled="regenerating.includes(i)"
                  @click.stop="regeneratePanel(i)"
                >
                  {{ regenerating.includes(i) ? "…" : t("storyboard.selector.retry") }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="transitionPanels.length > 0">
          <h4 class="mb-2 text-sm font-semibold text-emerald-300/90">{{ t("storyboard.selector.transitionFrames") }}</h4>
          <div class="grid grid-cols-3 gap-3">
            <div
              v-for="(url, i) in transitionPanels"
              :key="`trans-${i}`"
              class="relative aspect-video cursor-pointer overflow-hidden rounded-lg transition hover:ring-2 hover:ring-emerald-400/60"
              @click="handlePanelClick(url, 'transition', i)"
            >
              <img :src="url" :alt="t('storyboard.transitionAlt', { n: i + 1 })" class="h-full w-full object-cover" />
              <div class="absolute bottom-2 right-2 rounded bg-emerald-600/80 px-2 py-0.5 font-mono text-xs text-white">
                T{{ i + 1 }}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between">
            <h4 class="text-sm font-semibold text-violet-300/90">{{ t("storyboard.selector.additional") }}</h4>
            <input ref="fileInputRef" type="file" accept="image/*" multiple class="hidden" @change="handleFileUpload" />
            <button
              type="button"
              class="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface)]"
              :disabled="isUploading"
              @click="fileInputRef?.click()"
            >
              {{ isUploading ? t("storyboard.selector.uploading") : t("storyboard.selector.upload") }}
            </button>
          </div>
          <div v-if="customImages.length" class="grid grid-cols-3 gap-3">
            <div
              v-for="(url, i) in customImages"
              :key="`custom-${i}`"
              class="group relative aspect-video cursor-pointer overflow-hidden rounded-lg transition hover:ring-2 hover:ring-[var(--accent)]"
              @click="handlePanelClick(url, 'custom', i)"
            >
              <img :src="url" :alt="t('storyboard.selector.customAlt', { n: i + 1 })" class="h-full w-full object-cover" />
              <button
                type="button"
                class="absolute right-1 top-1 rounded bg-red-500/80 px-1 text-xs opacity-0 transition group-hover:opacity-100"
                @click.stop="removeCustomImage(i)"
              >
                ×
              </button>
              <div class="absolute bottom-2 right-2 rounded bg-violet-600/80 px-2 py-0.5 font-mono text-xs text-white">
                C{{ i + 1 }}
              </div>
            </div>
          </div>
          <div
            v-else
            class="flex h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-violet-800/40 hover:border-violet-600/60 hover:bg-violet-950/20"
            @click="fileInputRef?.click()"
          >
            <p class="text-xs text-[var(--muted)]">{{ t("storyboard.selector.uploadDrop") }}</p>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-bold">{{ t("storyboard.selector.finalSequence", { count: finalPanels.length }) }}</h3>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded border border-violet-400/30 px-2 py-1 text-xs text-violet-300 hover:bg-violet-950/30"
              @click="loadDemoSequence"
            >
              ✦ {{ t("storyboard.loadDemo") }}
            </button>
            <button
              type="button"
              class="rounded border border-emerald-400/30 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-950/30"
              @click="addTransitionSlot"
            >
              + {{ t("storyboard.selector.addKeyframePair") }}
            </button>
          </div>
        </div>

        <div v-if="selectingFor" class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {{ t("storyboard.selector.selectingSlot", { slot: selectingFor.slot === "first" ? t("storyboard.selector.start") : t("storyboard.selector.end") }) }}
        </div>

        <div class="min-h-[400px] space-y-3">
          <div
            v-if="finalPanels.length === 0"
            class="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)]"
          >
            <p class="text-sm text-[var(--muted)]">{{ t("storyboard.selector.emptyHint") }}</p>
            <p class="text-xs text-[var(--muted)]">{{ t("storyboard.selector.emptySub") }}</p>
          </div>

          <div
            v-for="(panel, index) in finalPanels"
            :key="panel.id"
            class="flex items-center gap-3 rounded-lg border p-3"
            :class="panel.type === 'transition' ? 'border-emerald-800/30 bg-emerald-950/20' : 'border-[var(--border)] bg-[var(--surface)]'"
          >
            <div class="flex flex-col gap-1">
              <button type="button" class="text-xs disabled:opacity-30" :disabled="index === 0" @click="movePanel(index, 'up')">↑</button>
              <button
                type="button"
                class="text-xs disabled:opacity-30"
                :disabled="index === finalPanels.length - 1"
                @click="movePanel(index, 'down')"
              >
                ↓
              </button>
            </div>

            <span class="min-w-[2ch] font-mono text-sm text-[var(--muted)]">{{ index + 1 }}</span>

            <template v-if="panel.type === 'single' && panel.imageUrl">
              <div class="flex flex-1 items-center gap-2">
                <img :src="panel.imageUrl" :alt="t('storyboard.panelAlt', { n: index + 1 })" class="aspect-video w-32 rounded object-cover" />
                <span class="rounded border border-[var(--border)] px-2 py-0.5 text-xs">{{ t("storyboard.selector.single") }}</span>
              </div>
            </template>

            <template v-else-if="panel.type === 'transition'">
              <div class="flex flex-1 flex-wrap items-center gap-2">
                <div
                  class="relative aspect-video w-24 cursor-pointer overflow-hidden rounded border-2"
                  :class="panel.imageUrl ? 'border-emerald-500' : 'border-dashed border-[var(--border)]'"
                  @click="selectingFor = { panelId: panel.id, slot: 'first' }"
                >
                  <img v-if="panel.imageUrl" :src="panel.imageUrl" alt="Start" class="h-full w-full object-cover" />
                  <div v-else class="flex h-full items-center justify-center text-xs text-[var(--muted)]">{{ t("storyboard.selector.selectStart") }}</div>
                  <span v-if="panel.imageUrl" class="absolute left-1 top-1 rounded bg-emerald-500 px-1 text-[10px] text-black">{{ t("storyboard.selector.start") }}</span>
                </div>
                <span class="text-emerald-400">→</span>
                <div
                  class="relative aspect-video w-24 cursor-pointer overflow-hidden rounded border-2"
                  :class="panel.linkedImageUrl ? 'border-emerald-500' : 'border-dashed border-[var(--border)]'"
                  @click="selectingFor = { panelId: panel.id, slot: 'last' }"
                >
                  <img v-if="panel.linkedImageUrl" :src="panel.linkedImageUrl" alt="End" class="h-full w-full object-cover" />
                  <div v-else class="flex h-full items-center justify-center text-xs text-[var(--muted)]">{{ t("storyboard.selector.selectEnd") }}</div>
                  <span v-if="panel.linkedImageUrl" class="absolute left-1 top-1 rounded bg-emerald-500 px-1 text-[10px] text-black">{{ t("storyboard.selector.end") }}</span>
                </div>
                <button
                  v-if="panel.imageUrl && panel.linkedImageUrl"
                  type="button"
                  class="text-xs text-[var(--muted)] hover:text-[var(--text)]"
                  @click="swapTransitionFrames(panel.id)"
                >
                  ⇄
                </button>
                <span class="rounded border border-emerald-400/30 px-2 py-0.5 text-xs text-emerald-300">{{ t("storyboard.selector.startEnd") }}</span>
              </div>
            </template>

            <button type="button" class="text-[var(--muted)] hover:text-red-400" @click="removePanel(panel.id)">×</button>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-center border-t border-[var(--border)] pt-8">
      <button
        type="button"
        class="min-w-[200px] rounded-lg bg-[var(--accent)] px-8 py-3 font-semibold text-[#1a120c] disabled:opacity-50"
        :disabled="finalPanels.length === 0"
        @click="handleConfirm"
      >
        ▶ {{ t("storyboard.selector.continue", { count: finalPanels.length }) }}
      </button>
    </div>
  </div>
</template>
