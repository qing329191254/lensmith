<script setup lang="ts">
import { ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { analyzeStoryboard, generateImage, isRequestGateError } from "@/api/seq"
import { DEMO_STORYBOARD } from "@/lib/demo-data"

const props = withDefaults(
  defineProps<{
    /** When true, generation runs on the server graph; human still reviews/approves. */
    orchestrated?: boolean
    busy?: boolean
    resultUrl?: string | null
    resultCount?: number | null
  }>(),
  {
    orchestrated: false,
    busy: false,
    resultUrl: null,
    resultCount: null,
  },
)

const emit = defineEmits<{
  generate: [url: string, prompt: string, panelCount: number]
  startGenerate: [prompt: string]
}>()

const { t } = useI18n()

const mode = ref<"generate" | "upload">("generate")
const prompt = ref("")
const isGenerating = ref(false)
const isAnalyzing = ref(false)
const generatedUrl = ref<string | null>(null)
const analyzedCount = ref<number | null>(null)
const isEditingCount = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const MASTER_SYSTEM_PROMPT =
  "You are a professional storyboard artist creating a source image for a video generation pipeline. " +
  "Create a strict 3x2 grid of 6 cinematic keyframes. " +
  "CRITICAL RULES: " +
  "1. NO TEXT, NO CAPTIONS, NO NUMBERING, NO TITLES. The image must be purely visual. " +
  "2. NO BORDERS, NO FRAMES, NO PADDING. The panels should fill the space or have minimal separation. " +
  "3. High-fidelity cinematic style, consistent character and lighting across all panels. " +
  "4. Do not render the 'paper' or 'document' of a storyboard, just the raw panel images arranged in a grid. " +
  "5. TRANSITION HANDLING: If the user describes a transition effect (zoom, pan, rotation, blur, time-shift), " +
  "render the INTERMEDIATE STATE as a visual reference. This helps users see what the effect should look like, " +
  "though they will generate separate first/last frames later for the actual video generation."

watch(
  () => [props.resultUrl, props.resultCount, props.busy] as const,
  ([url, count, busy]) => {
    if (url) {
      generatedUrl.value = url
      if (count) analyzedCount.value = count
      isGenerating.value = false
      isAnalyzing.value = false
    } else if (busy) {
      isGenerating.value = true
    } else {
      isGenerating.value = false
    }
  },
)

function handleLoadDemo() {
  generatedUrl.value = DEMO_STORYBOARD.masterImageUrl
  prompt.value = DEMO_STORYBOARD.masterDescription
  analyzedCount.value = DEMO_STORYBOARD.panelCount
  mode.value = "upload"
}

async function analyzeImage(url: string) {
  isAnalyzing.value = true
  isEditingCount.value = false
  try {
    const data = await analyzeStoryboard(url)
    if (data.panelCount) analyzedCount.value = data.panelCount
  } catch {
    analyzedCount.value = 6
  } finally {
    isAnalyzing.value = false
  }
}

async function handleGenerate() {
  if (!prompt.value.trim()) return

  if (props.orchestrated) {
    isGenerating.value = true
    generatedUrl.value = null
    emit("startGenerate", prompt.value.trim())
    return
  }

  isGenerating.value = true
  generatedUrl.value = null
  try {
    const formData = new FormData()
    formData.append("mode", "text-to-image")
    formData.append("prompt", `${MASTER_SYSTEM_PROMPT}\n\nUser Request: ${prompt.value}`)
    formData.append("aspectRatio", "3:2")
    const data = await generateImage(formData)
    generatedUrl.value = data.url
    mode.value = "generate"
    await analyzeImage(data.url)
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error("Error:", e)
  } finally {
    isGenerating.value = false
  }
}

function handleFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (event) => {
    const result = event.target?.result as string
    generatedUrl.value = result
    if (!prompt.value) prompt.value = `Uploaded Master: ${file.name}`
    analyzeImage(result)
  }
  reader.readAsDataURL(file)
}

function handleApprove() {
  if (generatedUrl.value) {
    emit("generate", generatedUrl.value, prompt.value || "Uploaded Storyboard Master", analyzedCount.value || 6)
  }
}

function handleReset() {
  generatedUrl.value = null
  analyzedCount.value = null
  if (mode.value === "upload" && fileInputRef.value) fileInputRef.value.value = ""
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-4">
    <div class="mb-8 space-y-2 text-center">
      <h2 class="display text-2xl">{{ t("storyboard.master.title") }}</h2>
      <p class="text-sm text-[var(--muted)]">{{ t("storyboard.master.subtitle") }}</p>
    </div>

    <div v-if="!generatedUrl" class="mb-4 flex justify-center">
      <button
        type="button"
        class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
        :disabled="busy || isGenerating"
        @click="handleLoadDemo"
      >
        ✦ {{ t("storyboard.master.loadDemo") }}
      </button>
    </div>

    <div class="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
      <template v-if="!generatedUrl">
        <div class="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface)] p-1">
          <button
            type="button"
            class="rounded-md px-3 py-2 text-sm font-medium transition"
            :class="mode === 'generate' ? 'bg-[var(--accent)] text-[#1a120c]' : 'text-[var(--muted)]'"
            :disabled="busy || isGenerating"
            @click="mode = 'generate'"
          >
            {{ t("storyboard.master.tabGenerate") }}
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-2 text-sm font-medium transition"
            :class="mode === 'upload' ? 'bg-[var(--accent)] text-[#1a120c]' : 'text-[var(--muted)]'"
            :disabled="busy || isGenerating"
            @click="mode = 'upload'"
          >
            {{ t("storyboard.master.tabUpload") }}
          </button>
        </div>

        <div v-if="mode === 'generate'" class="space-y-4">
          <label class="block text-sm text-[var(--muted)]">{{ t("storyboard.describe") }}</label>
          <textarea
            v-model="prompt"
            rows="5"
            class="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--text)] outline-none focus:border-[var(--focus)]"
            :placeholder="t('storyboard.promptPlaceholder')"
            :disabled="busy || isGenerating"
          />
          <button
            type="button"
            class="h-12 w-full rounded-lg bg-[var(--accent)] text-lg font-medium text-[#1a120c] disabled:opacity-50"
            :disabled="!prompt.trim() || isGenerating || busy"
            @click="handleGenerate"
          >
            {{ isGenerating || busy ? t("storyboard.master.generating") : t("storyboard.generateMaster") }}
          </button>
        </div>

        <div v-else class="space-y-6">
          <div
            class="cursor-pointer rounded-xl border-2 border-dashed border-[var(--border)] p-10 text-center transition hover:border-[var(--accent)] hover:bg-[var(--surface)]"
            @click="fileInputRef?.click()"
          >
            <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileUpload" />
            <p class="text-lg font-medium">{{ t("storyboard.master.uploadTitle") }}</p>
            <p class="mt-1 text-sm text-[var(--muted)]">{{ t("storyboard.master.uploadHint") }}</p>
          </div>
          <div class="space-y-2">
            <label class="block text-sm text-[var(--muted)]">{{ t("storyboard.master.contextLabel") }}</label>
            <input
              v-model="prompt"
              type="text"
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--focus)]"
              :placeholder="t('storyboard.master.contextPlaceholder')"
            />
          </div>
        </div>
      </template>

      <template v-else>
        <div class="relative aspect-[3/2] overflow-hidden rounded-xl border border-[var(--border)]">
          <img :src="generatedUrl" :alt="t('storyboard.masterAlt')" class="h-full w-full object-cover" />
          <div
            class="absolute right-2 top-2 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
          >
            <template v-if="isAnalyzing">
              <span class="animate-pulse">…</span>
              {{ t("storyboard.master.analyzing") }}
            </template>
            <template v-else>
              <span class="text-emerald-400">✓</span>
              <template v-if="isEditingCount">
                <input
                  type="number"
                  min="1"
                  max="12"
                  class="h-6 w-16 rounded border border-[var(--border)] bg-[var(--surface)] px-1 text-xs"
                  :value="analyzedCount || 6"
                  @input="analyzedCount = Number(($event.target as HTMLInputElement).value) || 6"
                  @click.stop
                />
                <button type="button" class="text-emerald-400" @click.stop="isEditingCount = false">✓</button>
              </template>
              <button
                v-else
                type="button"
                class="flex items-center gap-1 hover:text-[var(--muted)]"
                @click="isEditingCount = true"
              >
                {{ analyzedCount ? t("storyboard.master.panelsDetected", { count: analyzedCount }) : t("storyboard.master.previewReady") }}
                <span class="opacity-50">✎</span>
              </button>
            </template>
          </div>
        </div>

        <div class="flex gap-4">
          <button
            type="button"
            class="h-12 flex-1 rounded-lg border border-[var(--border)] text-lg hover:bg-[var(--surface)] disabled:opacity-50"
            :disabled="isGenerating || isAnalyzing || busy"
            @click="handleReset"
          >
            {{ mode === "generate" ? t("storyboard.master.generateNew") : t("storyboard.master.uploadDifferent") }}
          </button>
          <button
            type="button"
            class="h-12 flex-1 rounded-lg bg-[var(--accent)] text-lg font-medium text-[#1a120c] disabled:opacity-50"
            :disabled="isAnalyzing || busy"
            @click="handleApprove"
          >
            ✓ {{ t("storyboard.master.approve") }}
          </button>
        </div>
        <p class="text-center text-xs text-[var(--muted)]">
          {{
            analyzedCount
              ? t("storyboard.master.approveHintCount", { count: analyzedCount })
              : t("storyboard.master.approveHint")
          }}
        </p>
      </template>
    </div>
  </div>
</template>
