<script setup lang="ts">
import { ref } from "vue"
import { useI18n } from "vue-i18n"
import { analyzeStoryboard, generateImage, isRequestGateError } from "@/api/seq"
import { DEMO_TRANSITION_STORYBOARD } from "@/lib/demo-data"
import { extractPanelFromGrid } from "@/lib/panel-extraction"
import type { StorageMode } from "@/stores/storyboard"

const props = withDefaults(
  defineProps<{
    masterUrl: string
    masterPrompt: string
    storageMode: StorageMode
    /** Server graph runs transition + panel process after human skip/run. */
    orchestrated?: boolean
    busy?: boolean
  }>(),
  { orchestrated: false, busy: false },
)

const emit = defineEmits<{
  generate: [panels: string[], panelCount: number]
  skip: []
  run: [transitionPrompt: string]
}>()

const { t } = useI18n()

const transitionPrompt = ref("")
const isGenerating = ref(false)
const isAnalyzing = ref(false)
const generatedUrl = ref<string | null>(null)
const analyzedCount = ref<number | null>(null)
const isEditingCount = ref(false)
const status = ref<"ready" | "processing" | "complete">("ready")
const panels = ref<string[]>([])
const progress = ref(0)
const regenerating = ref<number[]>([])
const processing = ref(false)
const toast = ref("")

const TRANSITION_SYSTEM_PROMPT =
  "You are creating a secondary storyboard with ONLY transition frames. " +
  "The user will provide context from their main storyboard and describe which transition frames they need. " +
  "Generate a grid showing ONLY the requested panels: clean first and last frames for each transition. " +
  "CRITICAL: NO TEXT, NO NUMBERING, NO BORDERS. " +
  "These frames must be visually consistent with the provided main storyboard style and lighting. " +
  "Each transition should have TWO panels: (1) FIRST FRAME (starting state), (2) LAST FRAME (ending state). " +
  "The frames should be clearly distinct keyframes that the AI model can interpolate between."

async function analyzeImage(url: string) {
  isAnalyzing.value = true
  isEditingCount.value = false
  try {
    const data = await analyzeStoryboard(url)
    if (data.panelCount) analyzedCount.value = data.panelCount
  } catch {
    analyzedCount.value = 4
  } finally {
    isAnalyzing.value = false
  }
}

async function handleGenerate() {
  if (!transitionPrompt.value.trim()) return

  if (props.orchestrated) {
    emit("run", transitionPrompt.value.trim())
    return
  }

  isGenerating.value = true
  generatedUrl.value = null
  try {
    const formData = new FormData()
    formData.append("mode", "text-to-image")
    const fullPrompt = `${TRANSITION_SYSTEM_PROMPT}\n\nMAIN STORYBOARD CONTEXT: ${props.masterPrompt}\n\nTRANSITION REQUEST: ${transitionPrompt.value}`
    formData.append("prompt", fullPrompt)
    formData.append("aspectRatio", "16:9")
    const data = await generateImage(formData)
    generatedUrl.value = data.url
    await analyzeImage(data.url)
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error("Error:", e)
  } finally {
    isGenerating.value = false
  }
}

async function processPanels() {
  if (processing.value || !analyzedCount.value || !generatedUrl.value) return
  processing.value = true
  status.value = "processing"
  panels.value = []
  progress.value = 0

  try {
    const extracted: string[] = []

    for (let i = 0; i < analyzedCount.value; i++) {
      const url = await extractPanelFromGrid(i, generatedUrl.value, {
        columns: 2,
        kind: "transition",
        uploadToBlob: props.storageMode === "persistent",
      })
      if (url) {
        extracted.push(url)
        panels.value = [...extracted]
      }
      progress.value = ((i + 1) / analyzedCount.value) * 100
    }

    status.value = "complete"
    toast.value =
      props.storageMode === "temporal"
        ? t("storyboard.transition.toastTemporal", { count: extracted.length })
        : t("storyboard.transition.toastSaved", { count: extracted.length })
    emit("generate", extracted, analyzedCount.value)
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error("Processing error:", e)
    status.value = "ready"
  } finally {
    processing.value = false
  }
}

async function regeneratePanel(index: number) {
  if (!generatedUrl.value) return
  regenerating.value = [...regenerating.value, index]
  try {
    const url = await extractPanelFromGrid(index, generatedUrl.value, {
      columns: 2,
      kind: "transition",
      uploadToBlob: props.storageMode === "persistent",
    })
    if (url) {
      const updated = [...panels.value]
      updated[index] = url
      panels.value = updated
    }
  } finally {
    regenerating.value = regenerating.value.filter((i) => i !== index)
  }
}

function loadDemoTransitions() {
  transitionPrompt.value = DEMO_TRANSITION_STORYBOARD.description
  generatedUrl.value = DEMO_TRANSITION_STORYBOARD.transitionImageUrl
  analyzedCount.value = DEMO_TRANSITION_STORYBOARD.panelCount
}

function loadDemoExtractedPanels() {
  const demoPanelUrls = DEMO_TRANSITION_STORYBOARD.panels.map((p) => p.imageUrl)
  panels.value = demoPanelUrls
  progress.value = 100
  status.value = "complete"
  toast.value = t("storyboard.transition.demoLoaded", { count: demoPanelUrls.length })
  emit("generate", demoPanelUrls, demoPanelUrls.length)
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <div class="mb-8 space-y-3 text-center">
      <h2 class="display text-2xl">{{ t("storyboard.transition.title") }}</h2>
      <p class="mx-auto max-w-2xl text-sm text-[var(--muted)]">{{ t("storyboard.transition.subtitle") }}</p>
    </div>

    <p v-if="toast" class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
      {{ toast }}
    </p>

    <p
      v-if="orchestrated && busy"
      class="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center text-sm text-[var(--muted)]"
    >
      {{ t("storyboard.hitl.transitionWorking") }}
    </p>

    <div v-if="!generatedUrl" class="mb-8 grid gap-6 md:grid-cols-2">
      <div class="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <p class="mb-2 text-sm text-[var(--muted)]">{{ t("storyboard.transition.mainRef") }}</p>
        <div class="aspect-[3/2] overflow-hidden rounded-lg border border-[var(--border)]">
          <img :src="masterUrl" :alt="t('storyboard.masterAlt')" class="h-full w-full object-cover" />
        </div>
        <p class="mt-2 line-clamp-2 text-xs text-[var(--muted)]">{{ masterPrompt }}</p>
      </div>

      <div class="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
        <label class="block text-sm text-[var(--muted)]">{{ t("storyboard.transition.describe") }}</label>
        <textarea
          v-model="transitionPrompt"
          rows="6"
          class="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none focus:border-[var(--focus)]"
          :placeholder="t('storyboard.transition.placeholder')"
          :disabled="busy"
        />
        <div class="flex gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-lg bg-[var(--accent)] font-medium text-[#1a120c] disabled:opacity-50"
            :disabled="!transitionPrompt.trim() || isGenerating || busy"
            @click="handleGenerate"
          >
            {{ isGenerating || busy ? t("storyboard.working") : t("storyboard.transition.generate") }}
          </button>
          <button
            v-if="!orchestrated"
            type="button"
            class="rounded-lg border border-[var(--border)] px-4 text-sm hover:bg-[var(--surface)]"
            :disabled="isGenerating"
            @click="loadDemoTransitions"
          >
            {{ t("storyboard.loadDemo") }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="generatedUrl && !orchestrated" class="grid items-start gap-8 md:grid-cols-2">
      <div class="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div class="relative aspect-[3/2] overflow-hidden rounded-lg border border-[var(--border)]">
          <img :src="generatedUrl" :alt="t('storyboard.transitionAlt', { n: 1 })" class="h-full w-full object-cover" />
          <div
            class="absolute right-2 top-2 flex items-center gap-2 rounded bg-black/70 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
          >
            <template v-if="isAnalyzing">
              <span class="animate-pulse">…</span> {{ t("storyboard.master.analyzing") }}
            </template>
            <template v-else>
              <span class="text-emerald-400">✓</span>
              <template v-if="isEditingCount">
                <input
                  type="number"
                  min="1"
                  max="12"
                  class="h-6 w-16 rounded border border-[var(--border)] bg-[var(--surface)] px-1 text-xs"
                  :value="analyzedCount || 4"
                  @input="analyzedCount = Number(($event.target as HTMLInputElement).value) || 4"
                />
                <button type="button" @click="isEditingCount = false">✓</button>
              </template>
              <button v-else type="button" class="flex items-center gap-1" @click="isEditingCount = true">
                {{ analyzedCount ? t("storyboard.transition.panelCount", { count: analyzedCount }) : t("storyboard.master.previewReady") }}
                <span class="opacity-50">✎</span>
              </button>
            </template>
          </div>
        </div>
      </div>

      <div class="space-y-6">
        <div v-if="status === 'ready'" class="flex justify-center gap-3">
          <button
            type="button"
            class="rounded-lg bg-[var(--accent)] px-6 py-3 font-medium text-[#1a120c] disabled:opacity-50"
            :disabled="!analyzedCount"
            @click="processPanels"
          >
            ▶ {{ t("storyboard.transition.startExtraction") }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-[var(--border)] px-6 py-3 hover:bg-[var(--surface)]"
            @click="loadDemoExtractedPanels"
          >
            ✦ {{ t("storyboard.useDemo") }}
          </button>
        </div>

        <div v-if="status === 'processing'" class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-[var(--muted)]">{{ t("storyboard.status") }}</span>
            <span class="font-medium">
              {{ t("storyboard.transition.extracting", { current: panels.length + 1, total: analyzedCount }) }}
            </span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-[var(--surface)]">
            <div class="h-full bg-[var(--accent)] transition-all duration-500" :style="{ width: `${progress}%` }" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div
            v-for="(_, i) in analyzedCount || 4"
            :key="i"
            class="group relative aspect-video overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)]"
          >
            <img
              v-if="panels[i]"
              :src="panels[i]"
              :alt="t('storyboard.transitionAlt', { n: i + 1 })"
              class="h-full w-full object-cover"
            />
            <div v-else class="flex h-full items-center justify-center text-xs text-[var(--muted)]">
              {{ t("storyboard.panelLabel", { n: i + 1 }) }}
            </div>
            <div v-if="panels[i]" class="absolute right-1 top-1 text-xs text-emerald-400">✓</div>
            <div
              v-if="status === 'complete' && panels[i]"
              class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/60 group-hover:opacity-100"
            >
              <button
                type="button"
                class="rounded bg-[var(--surface)] px-2 py-1 text-xs"
                :disabled="regenerating.includes(i)"
                @click="regeneratePanel(i)"
              >
                {{ regenerating.includes(i) ? "…" : "↻" }}
              </button>
            </div>
            <div v-if="status === 'processing' && i === panels.length" class="absolute inset-0 animate-pulse bg-white/10" />
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-center border-t border-[var(--border)] pt-6">
      <button
        type="button"
        class="rounded-lg border border-[var(--border)] px-5 py-2 text-sm hover:bg-[var(--surface)] disabled:opacity-50"
        :disabled="busy || isGenerating"
        @click="emit('skip')"
      >
        {{ t("storyboard.transition.skip") }} →
      </button>
    </div>
  </div>
</template>
