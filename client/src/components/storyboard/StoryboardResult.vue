<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { useRouter } from "vue-router"
import { enhancePrompt, extractVideoUrl, generateVideo, isRequestGateError } from "@/api/seq"
import { DEMO_FINAL_SEQUENCE } from "@/lib/demo-data"
import { formatApiError } from "@/lib/provider-errors"
import { useEditorStore } from "@/stores/editor"
import { VIDEO_MODEL_OPTIONS, useModelPrefsStore } from "@/stores/modelPrefs"
import { useToastStore } from "@/stores/toast"

const router = useRouter()
const modelPrefs = useModelPrefsStore()
const editor = useEditorStore()
const toast = useToastStore()

export type VideoModel = string

export interface ResultPanel {
  id: string
  imageUrl: string
  linkedImageUrl?: string
  prompt: string
  duration: 3 | 5 | 8
  videoUrl?: string
  isGenerating: boolean
  progress: number
  elapsedSec: number
  error?: string
  model: VideoModel
}

const props = defineProps<{
  initialPanels: string[]
  linkedPanelData: Record<number, string>
  prompts: Record<number, string>
  durations: Record<number, number>
  videoUrls: Record<number, string>
  masterDescription?: string
}>()

const emit = defineEmits<{
  update: [
    prompts: Record<number, string>,
    durations: Record<number, number>,
    videoUrls: Record<number, string>,
  ]
}>()

const { t } = useI18n()

const masterDescription = ref(props.masterDescription || "")
const aspectRatio = ref<"16:9" | "9:16">("16:9")
const useFastModel = ref(true)
const panels = ref<ResultPanel[]>([])
const enhancing = ref<string | null>(null)
const batchError = ref("")
const modelMenuPanelId = ref<string | null>(null)
const modelMenuStyle = ref<Record<string, string>>({})
const progressTimers = new Map<string, ReturnType<typeof setInterval>>()
const progressStartedAt = new Map<string, number>()

function defaultVideoModel(hasLink: boolean): VideoModel {
  const preferred = modelPrefs.videoModel
  const allowed = VIDEO_MODEL_OPTIONS.filter((o) =>
    hasLink ? o.supportsFirstLast : o.supportsI2v,
  )
  const ids = allowed.map((o) => o.id)
  if (ids.includes(preferred)) return preferred as VideoModel
  const cn = allowed.find((o) => o.cnFriendly && !o.needsFal)
  if (cn) return cn.id as VideoModel
  return (ids[0] || "veo3-fast") as VideoModel
}

function buildPanels() {
  clearAllProgressTimers()
  panels.value = props.initialPanels.map((url, index) => ({
    id: crypto.randomUUID(),
    imageUrl: url,
    linkedImageUrl: props.linkedPanelData[index],
    prompt: props.prompts[index] || "",
    duration: (props.durations[index] || 5) as 3 | 5 | 8,
    videoUrl: props.videoUrls[index],
    isGenerating: false,
    progress: 0,
    elapsedSec: 0,
    model: defaultVideoModel(Boolean(props.linkedPanelData[index])),
  }))
}

function expectedVideoMs() {
  return useFastModel.value ? 90_000 : 150_000
}

function clearProgressTimer(id: string) {
  const timer = progressTimers.get(id)
  if (timer) clearInterval(timer)
  progressTimers.delete(id)
  progressStartedAt.delete(id)
}

function clearAllProgressTimers() {
  for (const id of [...progressTimers.keys()]) clearProgressTimer(id)
}

function startProgress(id: string) {
  clearProgressTimer(id)
  const started = Date.now()
  progressStartedAt.set(id, started)
  updatePanel(id, { progress: 3, elapsedSec: 0 }, false)
  const expectedMs = expectedVideoMs()
  const timer = setInterval(() => {
    const elapsed = Date.now() - started
    const pct = Math.min(92, Math.max(3, Math.round(92 * (1 - Math.exp(-elapsed / expectedMs)))))
    panels.value = panels.value.map((p) =>
      p.id === id ? { ...p, progress: pct, elapsedSec: Math.floor(elapsed / 1000) } : p,
    )
  }, 400)
  progressTimers.set(id, timer)
}

function finishProgress(id: string) {
  clearProgressTimer(id)
  panels.value = panels.value.map((p) =>
    p.id === id ? { ...p, progress: 100, elapsedSec: p.elapsedSec } : p,
  )
}

onMounted(() => {
  buildPanels()
  document.addEventListener("pointerdown", onDocPointerDown)
})
onUnmounted(() => {
  clearAllProgressTimers()
  document.removeEventListener("pointerdown", onDocPointerDown)
})
watch(() => props.initialPanels, buildPanels)

const totalDuration = computed(() => panels.value.reduce((sum, p) => sum + (p.duration || 5), 0))
const generatedCount = computed(() => panels.value.filter((p) => p.videoUrl).length)
const generatingPanels = computed(() => panels.value.filter((p) => p.isGenerating))
const anyGenerating = computed(() => generatingPanels.value.length > 0)
const batchProgress = computed(() => {
  if (!anyGenerating.value) return 0
  const total = generatingPanels.value.reduce((sum, p) => sum + (p.progress || 0), 0)
  return Math.round(total / generatingPanels.value.length)
})
const allVideosReady = computed(
  () => panels.value.length > 0 && panels.value.every((p) => Boolean(p.videoUrl)),
)
const modelMenuPanel = computed(() =>
  modelMenuPanelId.value ? panels.value.find((p) => p.id === modelMenuPanelId.value) || null : null,
)

function goToTimeline() {
  syncToParent()
  const sequence = panels.value
    .filter((p) => Boolean(p.videoUrl))
    .map((p, index) => ({
      url: p.videoUrl as string,
      prompt: p.prompt || t("storyboard.panelTitle", { n: index + 1 }),
      duration: p.duration,
      thumbnailUrl: p.imageUrl,
      type: "video" as const,
    }))
  editor.importRemoteSequence(sequence, {
    replaceTimeline: true,
    projectName: t("storyboard.result.timelineProjectName"),
  })
  router.push("/timeline")
}

function syncToParent() {
  const prompts: Record<number, string> = {}
  const durations: Record<number, number> = {}
  const videoUrls: Record<number, string> = {}
  panels.value.forEach((panel, index) => {
    if (panel.prompt) prompts[index] = panel.prompt
    if (panel.duration) durations[index] = panel.duration
    if (panel.videoUrl) videoUrls[index] = panel.videoUrl
  })
  emit("update", prompts, durations, videoUrls)
}

function updatePanel(id: string, updates: Partial<ResultPanel>, sync = true) {
  panels.value = panels.value.map((p) => (p.id === id ? { ...p, ...updates } : p))
  if (sync) syncToParent()
}

async function handleEnhance(panel: ResultPanel) {
  if (!masterDescription.value.trim() && !panel.prompt.trim()) return
  enhancing.value = panel.id
  try {
    const data = await enhancePrompt({
      imageUrl: panel.imageUrl,
      masterDescription: masterDescription.value,
      panelPrompt: panel.prompt,
    })
    if (data.enhancedPrompt) updatePanel(panel.id, { prompt: data.enhancedPrompt })
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error("Enhance failed", e)
  } finally {
    enhancing.value = null
  }
}

async function generatePanelVideo(id: string) {
  const panel = panels.value.find((p) => p.id === id)
  if (!panel || !panel.prompt.trim() || panel.isGenerating) return

  // Keep model compatible with first/last vs single-image panels.
  const allowed = modelOptions(panel).map((o) => o.value)
  const model = allowed.includes(panel.model)
    ? panel.model
    : defaultVideoModel(Boolean(panel.linkedImageUrl))
  if (model !== panel.model) updatePanel(id, { model })

  batchError.value = ""
  updatePanel(id, { isGenerating: true, error: undefined, progress: 3, elapsedSec: 0 }, false)
  startProgress(id)

  try {
    const result = await generateVideo({
      imageUrl: panel.imageUrl,
      linkedImageUrl: panel.linkedImageUrl,
      prompt: panel.prompt,
      aspectRatio: aspectRatio.value,
      duration: panel.duration,
      useFastModel: useFastModel.value,
      model,
    })
    const url = extractVideoUrl(result)
    if (!url) throw new Error(t("storyboard.errNoVideoUrl"))
    finishProgress(id)
    updatePanel(id, { videoUrl: url, isGenerating: false, progress: 100, error: undefined })
  } catch (e) {
    clearProgressTimer(id)
    if (isRequestGateError(e)) {
      updatePanel(id, { isGenerating: false, error: undefined, progress: 0, elapsedSec: 0 }, false)
      return
    }
    const message = formatApiError(e, t)
    updatePanel(
      id,
      { isGenerating: false, progress: 0, elapsedSec: 0, error: message },
      false,
    )
    batchError.value = message
    toast.error(message, 5000)
  }
}

async function generateAll() {
  if (anyGenerating.value) return
  const pending = panels.value.filter((p) => !p.videoUrl && !p.isGenerating && p.prompt.trim())
  if (!pending.length) {
    toast.error(t("storyboard.result.nothingToGenerate"))
    return
  }
  batchError.value = ""
  await Promise.all(pending.map((p) => generatePanelVideo(p.id)))
  const failed = panels.value.filter((p) => p.error)
  if (failed.length) {
    batchError.value = failed[0]?.error || t("errors.providerFailed")
  }
}

function loadDemoData() {
  panels.value = panels.value.map((panel) => {
    const demoPanel = DEMO_FINAL_SEQUENCE.panels.find(
      (dp) =>
        dp.imageUrl === panel.imageUrl &&
        (panel.linkedImageUrl ? dp.linkedImageUrl === panel.linkedImageUrl : !dp.linkedImageUrl),
    )
    if (demoPanel) {
      return {
        ...panel,
        prompt: demoPanel.prompt,
        duration: demoPanel.duration as 3 | 5 | 8,
        videoUrl: demoPanel.videoUrl,
      }
    }
    return panel
  })
  masterDescription.value = DEMO_FINAL_SEQUENCE.masterDescription
  aspectRatio.value = DEMO_FINAL_SEQUENCE.videoConfig.aspectRatio
  useFastModel.value = DEMO_FINAL_SEQUENCE.videoConfig.useFastModel
  syncToParent()
}

function modelOptions(panel: ResultPanel) {
  const hasLink = Boolean(panel.linkedImageUrl)
  return VIDEO_MODEL_OPTIONS.filter((o) => (hasLink ? o.supportsFirstLast : o.supportsI2v)).map((o) => ({
    value: o.id,
    label: [
      o.label,
      o.vendor,
      o.needsFal ? t("workspace.videoPathFal") : t("workspace.videoPathGateway"),
    ].join(" · "),
  }))
}

function modelLabel(panel: ResultPanel) {
  return modelOptions(panel).find((o) => o.value === panel.model)?.label || panel.model
}

function closeModelMenu() {
  modelMenuPanelId.value = null
}

async function toggleModelMenu(panelId: string, event: MouseEvent) {
  if (modelMenuPanelId.value === panelId) {
    closeModelMenu()
    return
  }
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const menuHeight = Math.min(240, window.innerHeight - 16)
  const spaceBelow = window.innerHeight - rect.bottom - 8
  const openUp = spaceBelow < 160 && rect.top > spaceBelow
  modelMenuStyle.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 288))}px`,
    width: `${Math.max(rect.width, 240)}px`,
    maxHeight: `${menuHeight}px`,
    ...(openUp
      ? { bottom: `${window.innerHeight - rect.top + 4}px`, top: "auto" }
      : { top: `${rect.bottom + 4}px`, bottom: "auto" }),
  }
  modelMenuPanelId.value = panelId
  await nextTick()
}

function pickModel(panelId: string, model: VideoModel) {
  updatePanel(panelId, { model })
  closeModelMenu()
}

function onDocPointerDown(event: PointerEvent) {
  if (!modelMenuPanelId.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest("[data-model-menu]") || target?.closest("[data-model-trigger]")) return
  closeModelMenu()
}

</script>

<template>
  <div class="space-y-6">
    <div class="text-center">
      <div class="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
        <span class="relative flex h-2 w-2">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
          <span class="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
        </span>
        {{ t("storyboard.result.readyBadge") }}
      </div>
      <h2 class="text-xl font-semibold">{{ t("storyboard.result.title") }}</h2>
      <p class="text-sm text-[var(--muted)]">{{ t("storyboard.result.subtitle") }}</p>
      <button
        v-if="allVideosReady"
        type="button"
        class="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#1a120c]"
        @click="goToTimeline"
      >
        {{ t("storyboard.result.continueTimeline") }}
      </button>
    </div>

    <div class="flex flex-col gap-6 overflow-hidden rounded-2xl border border-[var(--border)] lg:flex-row">
      <div class="flex w-full flex-col border-[var(--border)] lg:w-[35%] lg:min-w-[280px] lg:border-r">
        <div class="flex h-12 items-center justify-between border-b border-[var(--border)] px-4">
          <span class="text-sm font-medium">🎬 {{ t("storyboard.result.configTitle") }}</span>
          <span class="rounded bg-[var(--surface)] px-2 py-0.5 text-xs text-[var(--muted)]">
            {{ t("storyboard.result.panelCount", { count: panels.length }) }}
          </span>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto p-4">
          <div v-if="panels.length && panels.every((p) => !p.prompt)" class="rounded-lg bg-[var(--surface)] p-3 text-xs text-[var(--muted)]">
            <p class="mb-1 font-medium text-[var(--text)]">{{ t("storyboard.result.noPromptsTitle") }}</p>
            <p>{{ t("storyboard.result.noPromptsBody") }}</p>
          </div>

          <div class="space-y-2 rounded-lg bg-[var(--surface)] p-4">
            <label class="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {{ t("storyboard.result.masterContext") }}
            </label>
            <textarea
              v-model="masterDescription"
              rows="4"
              class="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs outline-none focus:border-[var(--focus)]"
              :placeholder="t('storyboard.result.masterContextPlaceholder')"
            />
          </div>

          <div class="space-y-3 rounded-lg bg-[var(--surface)] p-4">
            <label class="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {{ t("storyboard.result.videoConfig") }}
            </label>
            <div class="space-y-1.5">
              <label class="text-[10px] text-[var(--muted)]">{{ t("storyboard.result.aspectRatio") }}</label>
              <select
                v-model="aspectRatio"
                class="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs"
              >
                <option value="16:9">{{ t("storyboard.result.landscape") }}</option>
                <option value="9:16">{{ t("storyboard.result.portrait") }}</option>
              </select>
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] text-[var(--muted)]">{{ t("storyboard.result.quality") }}</label>
              <select
                :value="useFastModel ? 'fast' : 'standard'"
                class="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs"
                @change="useFastModel = ($event.target as HTMLSelectElement).value === 'fast'"
              >
                <option value="fast">{{ t("storyboard.result.qualityFast") }}</option>
                <option value="standard">{{ t("storyboard.result.qualityStandard") }}</option>
              </select>
            </div>
            <p class="text-[10px] text-[var(--muted)]">
              {{ t("storyboard.result.totalDuration", { seconds: totalDuration }) }}
            </p>
          </div>

          <div class="flex flex-col gap-2">
            <button
              type="button"
              class="h-8 w-full rounded-lg border border-[var(--border)] text-xs hover:bg-[var(--surface)]"
              @click="loadDemoData"
            >
              {{ t("storyboard.result.loadDemo") }}
            </button>
          </div>
        </div>

        <div class="space-y-2 border-t border-[var(--border)] p-4">
          <div v-if="anyGenerating" class="space-y-1.5">
            <div class="flex items-center justify-between text-[10px] text-[var(--muted)]">
              <span>{{ t("storyboard.result.generatingBatch", { count: generatingPanels.length }) }}</span>
              <span>{{ batchProgress }}%</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
              <div
                class="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                :style="{ width: `${batchProgress}%` }"
              />
            </div>
          </div>
          <button
            type="button"
            class="h-10 w-full rounded-lg bg-[var(--accent)] text-sm font-medium text-[#1a120c] disabled:opacity-50"
            :disabled="anyGenerating"
            @click="generateAll"
          >
            ✦ {{ anyGenerating ? t("storyboard.result.generating") : t("storyboard.result.generateAll") }}
          </button>
          <p
            v-if="batchError"
            class="rounded-md border border-red-400/30 bg-red-500/10 px-2.5 py-2 text-xs leading-snug text-red-300"
          >
            {{ batchError }}
          </p>
        </div>
      </div>

      <div class="flex flex-1 flex-col overflow-hidden">
        <div class="flex h-12 items-center justify-between border-b border-[var(--border)] px-4">
          <span class="text-sm font-medium">{{ t("storyboard.result.panelsTitle") }}</span>
          <span class="text-xs text-[var(--muted)]">
            {{ t("storyboard.result.generatedCount", { done: generatedCount, total: panels.length }) }}
          </span>
        </div>

        <div class="flex-1 overflow-x-auto p-4">
          <div class="flex w-max gap-4 pb-4">
            <div
              v-for="(panel, index) in panels"
              :key="panel.id"
              class="flex min-h-[420px] w-[280px] flex-none flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]"
            >
              <div class="flex items-center justify-between border-b border-[var(--border)] p-2">
                <div class="flex items-center gap-2">
                  <span class="rounded border border-[var(--border)] px-2 py-0.5 text-xs">
                    {{ t("storyboard.panelTitle", { n: index + 1 }) }}
                  </span>
                  <span v-if="panel.linkedImageUrl" class="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                    {{ t("storyboard.result.firstLast") }}
                  </span>
                </div>
              </div>

              <div class="relative aspect-video overflow-hidden bg-[var(--surface)]">
                <video
                  v-if="panel.videoUrl"
                  :src="panel.videoUrl"
                  controls
                  class="h-full w-full object-contain"
                />
                <template v-else-if="panel.linkedImageUrl">
                  <div class="flex h-full gap-0.5">
                    <div class="relative w-1/2">
                      <img :src="panel.imageUrl" alt="First" class="h-full w-full object-contain" />
                      <span class="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] text-white/80">{{ t("storyboard.selector.start") }}</span>
                    </div>
                    <div class="relative w-1/2">
                      <img :src="panel.linkedImageUrl" alt="Last" class="h-full w-full object-contain" />
                      <span class="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white/80">{{ t("storyboard.selector.end") }}</span>
                    </div>
                  </div>
                </template>
                <img v-else :src="panel.imageUrl" :alt="t('storyboard.panelAlt', { n: index + 1 })" class="h-full w-full object-contain" />

                <div
                  v-if="panel.isGenerating"
                  class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/65 px-4 backdrop-blur-[1px]"
                >
                  <span class="text-xs font-medium text-white/90">
                    {{ t("storyboard.result.generatingProgress", { percent: panel.progress }) }}
                  </span>
                  <div class="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-white/20">
                    <div
                      class="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                      :style="{ width: `${panel.progress}%` }"
                    />
                  </div>
                  <span class="text-[10px] text-white/55">
                    {{ t("storyboard.result.generatingElapsed", { seconds: panel.elapsedSec }) }}
                  </span>
                  <span class="text-center text-[10px] leading-relaxed text-white/45">
                    {{ t("storyboard.result.generatingHint") }}
                  </span>
                </div>
              </div>

              <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                <div class="space-y-1">
                  <label class="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    {{ t("storyboard.result.videoModel") }}
                  </label>
                  <button
                    type="button"
                    data-model-trigger
                    class="flex h-7 w-full items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-left text-xs outline-none hover:border-[var(--focus)] focus:border-[var(--focus)]"
                    @click="toggleModelMenu(panel.id, $event)"
                  >
                    <span class="truncate">{{ modelLabel(panel) }}</span>
                    <span class="shrink-0 text-[var(--muted)]">▾</span>
                  </button>
                </div>

                <div class="space-y-1">
                  <div class="flex items-center justify-between">
                    <label class="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      {{ t("storyboard.result.videoPrompt") }}
                    </label>
                    <button
                      type="button"
                      class="text-[10px] text-[var(--accent)] disabled:opacity-40"
                      :disabled="enhancing === panel.id || (!masterDescription.trim() && !panel.prompt.trim())"
                      @click="handleEnhance(panel)"
                    >
                      {{ enhancing === panel.id ? "…" : "✦ " + t("storyboard.result.enhance") }}
                    </button>
                  </div>
                  <textarea
                    :value="panel.prompt"
                    rows="3"
                    class="min-h-[64px] w-full resize-none rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs outline-none focus:border-[var(--focus)]"
                    :placeholder="panel.linkedImageUrl ? t('storyboard.result.transitionPromptPlaceholder') : t('storyboard.motionPlaceholder')"
                    @input="updatePanel(panel.id, { prompt: ($event.target as HTMLTextAreaElement).value })"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    {{ t("storyboard.result.duration") }}
                  </label>
                  <select
                    :value="String(panel.duration)"
                    class="h-7 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
                    @change="updatePanel(panel.id, { duration: Number(($event.target as HTMLSelectElement).value) as 3 | 5 | 8 })"
                  >
                    <option value="3">3s</option>
                    <option value="5">5s</option>
                    <option value="8">8s</option>
                  </select>
                </div>

                <div class="mt-auto space-y-2 pt-2">
                  <p
                    v-if="panel.error"
                    class="rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1.5 text-xs leading-snug text-red-300"
                  >
                    {{ panel.error }}
                  </p>
                  <button
                    type="button"
                    class="h-8 w-full rounded-lg text-xs font-medium disabled:opacity-50"
                    :class="panel.videoUrl ? 'border border-[var(--border)] hover:bg-[var(--surface)]' : 'bg-[var(--accent)] text-[#1a120c]'"
                    :disabled="panel.isGenerating || !panel.prompt.trim()"
                    @click="generatePanelVideo(panel.id)"
                  >
                    {{ panel.videoUrl ? t("storyboard.result.regenerate") : t("storyboard.generateVideo") }}
                  </button>
                  <a
                    v-if="panel.videoUrl"
                    :href="panel.videoUrl"
                    target="_blank"
                    rel="noreferrer"
                    class="block text-center text-xs text-[var(--focus)] underline"
                  >
                    {{ t("storyboard.openVideo") }}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="modelMenuPanelId && modelMenuPanel"
        data-model-menu
        class="thin-scrollbar fixed z-[100] overflow-y-auto overscroll-contain rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-xl"
        :style="modelMenuStyle"
      >
        <button
          v-for="opt in modelOptions(modelMenuPanel)"
          :key="opt.value"
          type="button"
          class="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--surface)]"
          :class="opt.value === modelMenuPanel.model ? 'bg-[var(--surface)] text-[var(--accent)]' : 'text-[var(--text)]'"
          @click="pickModel(modelMenuPanelId!, opt.value as VideoModel)"
        >
          {{ opt.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
