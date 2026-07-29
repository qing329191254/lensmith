<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import MasterGenerator from "@/components/storyboard/MasterGenerator.vue"
import TransitionGenerator from "@/components/storyboard/TransitionGenerator.vue"
import PanelProcessor from "@/components/storyboard/PanelProcessor.vue"
import PanelSelector from "@/components/storyboard/PanelSelector.vue"
import StoryboardResult from "@/components/storyboard/StoryboardResult.vue"
import {
  resumeStoryboardSession,
  startStoryboardSession,
  type StoryboardSessionResponse,
} from "@/api/seq"
import { useStoryboardStore, type StoryboardStep } from "@/stores/storyboard"

const { t } = useI18n()
const store = useStoryboardStore()

const dismissedBanners = ref<Set<string>>(new Set())
const graphBusy = ref(false)
const graphError = ref("")
const waitingFor = ref("")
const masterPreviewUrl = ref<string | null>(null)
const masterPreviewCount = ref<number | null>(null)
const pendingProduce = ref(false)

const STEPS = computed(() => {
  const keys: StoryboardStep[] = ["prompt", "transition", "process", "selection", "result"]
  return keys.map((key) => ({
    key,
    label: t(`storyboard.steps.${key}`),
  }))
})

const stepIndex = computed(() => STEPS.value.findIndex((s) => s.key === store.step))

onMounted(() => {
  store.load()
})

function canNavigateToStep(index: number) {
  if (graphBusy.value) return false
  if (index === 0) return true
  if (index === 1) return !!store.masterData
  if (index === 2) return !!store.masterData
  if (index === 3) return store.processedPanels.length > 0
  if (index === 4) return store.finalPanels.length > 0
  return false
}

function goToStep(key: StoryboardStep) {
  const index = STEPS.value.findIndex((s) => s.key === key)
  if (canNavigateToStep(index)) store.step = key
}

function dismissBanner(id: string) {
  dismissedBanners.value = new Set([...dismissedBanners.value, id])
}

function applySession(res: StoryboardSessionResponse) {
  store.threadId = res.threadId
  waitingFor.value = res.waitingFor || ""
  const s = res.state
  const errors = s.errors || []
  graphError.value = errors.length ? errors.join(" · ") : ""

  if (s.masterUrl) {
    store.masterData = {
      url: s.masterUrl,
      prompt: s.workingPrompt || s.prompt || store.masterData?.prompt || "",
      panelCount: s.panelCount || store.masterData?.panelCount || 6,
    }
    masterPreviewUrl.value = s.masterUrl
    masterPreviewCount.value = s.panelCount || null
  }
  if (s.transitionPanels?.length) store.transitionPanels = s.transitionPanels
  if (s.processedPanels?.length) store.processedPanels = s.processedPanels

  if (s.panels?.length) {
    store.finalPanels = s.panels.map((p) => p.imageUrl || "").filter(Boolean)
    const linked: Record<number, string> = {}
    const prompts: Record<number, string> = {}
    const durations: Record<number, number> = {}
    const videoUrls: Record<number, string> = {}
    s.panels.forEach((p, i) => {
      if (p.linkedImageUrl) linked[i] = p.linkedImageUrl
      if (p.prompt) prompts[i] = p.prompt
      if (p.duration) durations[i] = p.duration
      if (p.videoUrl) videoUrls[i] = p.videoUrl
    })
    store.linkedPanelData = linked
    store.prompts = prompts
    store.durations = durations
    store.videoUrls = videoUrls
  }

  if (res.status === "failed") {
    graphError.value = graphError.value || t("storyboard.hitl.failed")
  }
}

async function resume(action: string, extra: Record<string, unknown> = {}) {
  if (!store.threadId) throw new Error("Missing storyboard session")
  return resumeStoryboardSession(store.threadId, { action, ...extra })
}

/** Start graph: AI generates master, then pauses for human review. */
async function handleStartGenerate(prompt: string) {
  graphBusy.value = true
  graphError.value = ""
  masterPreviewUrl.value = null
  try {
    const res = await startStoryboardSession({
      prompt,
      options: { aspectRatio: "3:2", maxPanels: 6 },
    })
    applySession(res)
    if (res.status === "failed") return
    // Stay on prompt for human approve / revise.
    store.step = "prompt"
  } catch (e) {
    console.error(e)
    graphError.value = e instanceof Error ? e.message : t("storyboard.hitl.failed")
    masterPreviewUrl.value = null
  } finally {
    graphBusy.value = false
  }
}

/**
 * Human approved master.
 * - If session already waiting on review_master → resume approve
 * - Upload/demo path → start session with masterUrl, then approve
 */
async function handleMasterApproved(url: string, prompt: string, panelCount: number) {
  graphBusy.value = true
  graphError.value = ""
  try {
    if (store.threadId && waitingFor.value === "review_master") {
      const res = await resume("approve_master", { panelCount })
      applySession(res)
    } else {
      const started = await startStoryboardSession({
        prompt,
        masterUrl: url,
        options: { aspectRatio: "3:2", maxPanels: panelCount || 6 },
      })
      applySession(started)
      if (started.status === "interrupted" && started.waitingFor === "review_master") {
        const res = await resume("approve_master", { panelCount })
        applySession(res)
      }
    }
    store.masterData = {
      url: store.masterData?.url || url,
      prompt: store.masterData?.prompt || prompt,
      panelCount: panelCount || store.masterData?.panelCount || 6,
    }
    store.step = "transition"
  } catch (e) {
    console.error(e)
    graphError.value = e instanceof Error ? e.message : t("storyboard.hitl.failed")
  } finally {
    graphBusy.value = false
  }
}

async function continueAfterTransition(decision: { action: string; transitionPrompt?: string }) {
  graphBusy.value = true
  graphError.value = ""
  store.step = "process"
  try {
    const res = await resume(decision.action, {
      transitionPrompt: decision.transitionPrompt,
    })
    applySession(res)
    if (res.status === "failed") {
      store.step = "transition"
      return
    }
    // Graph ran transition (optional) + process; now waiting for human selection.
    store.step = "selection"
  } catch (e) {
    console.error(e)
    graphError.value = e instanceof Error ? e.message : t("storyboard.hitl.failed")
    store.step = "transition"
  } finally {
    graphBusy.value = false
  }
}

function handleTransitionRun(transitionPrompt: string) {
  return continueAfterTransition({ action: "run_transition", transitionPrompt })
}

function handleTransitionSkipped() {
  return continueAfterTransition({ action: "skip_transition" })
}

async function handleSelectionComplete(
  selectedPanels: string[],
  linkedData: Record<number, string>,
  promptsData: Record<number, string>,
  durationsData: Record<number, number>,
  videoUrlsData: Record<number, string>,
) {
  store.finalPanels = selectedPanels
  store.linkedPanelData = linkedData
  store.prompts = promptsData
  store.durations = durationsData
  store.videoUrls = videoUrlsData

  if (!store.threadId) {
    store.step = "result"
    return
  }

  graphBusy.value = true
  graphError.value = ""
  try {
    const panels = selectedPanels.map((imageUrl, i) => ({
      imageUrl,
      linkedImageUrl: linkedData[i] || "",
      prompt: promptsData[i] || "",
      duration: durationsData[i] || 8,
      videoUrl: videoUrlsData[i] || "",
    }))
    const res = await resume("submit_selection", { panels })
    applySession(res)
    if (res.waitingFor === "confirm_produce") {
      pendingProduce.value = true
      store.step = "result"
    } else {
      store.step = "result"
    }
  } catch (e) {
    console.error(e)
    graphError.value = e instanceof Error ? e.message : t("storyboard.hitl.failed")
    // Still allow local result editing if resume failed.
    store.step = "result"
  } finally {
    graphBusy.value = false
  }
}

async function handleProduceChoice(batch: boolean) {
  if (!store.threadId || waitingFor.value !== "confirm_produce") {
    pendingProduce.value = false
    return
  }
  graphBusy.value = true
  graphError.value = ""
  try {
    const res = await resume(batch ? "confirm_produce" : "skip_produce", {
      enhanceVideoPrompts: true,
      generateVideos: batch,
      useFastVideo: true,
    })
    applySession(res)
    pendingProduce.value = false
  } catch (e) {
    console.error(e)
    graphError.value = e instanceof Error ? e.message : t("storyboard.hitl.failed")
  } finally {
    graphBusy.value = false
  }
}

function handleResultUpdate(
  prompts: Record<number, string>,
  durations: Record<number, number>,
  videoUrls: Record<number, string>,
) {
  store.prompts = prompts
  store.durations = durations
  store.videoUrls = videoUrls
}

function resetAll() {
  if (confirm(t("storyboard.confirmClear"))) {
    store.clear()
    dismissedBanners.value = new Set()
    graphBusy.value = false
    graphError.value = ""
    waitingFor.value = ""
    masterPreviewUrl.value = null
    masterPreviewCount.value = null
    pendingProduce.value = false
  }
}
</script>

<template>
  <section class="page-container py-8 sm:py-10">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">{{ t("storyboard.eyebrow") }}</p>
        <h1 class="display mt-3 text-3xl md:text-4xl">{{ t("storyboard.title") }}</h1>
        <p class="mt-1 text-xs text-[var(--muted)]">{{ t("storyboard.subtitle") }}</p>
        <p class="mt-2 text-xs text-[var(--muted)]">{{ t("storyboard.hitl.hint") }}</p>
      </div>

      <div class="flex items-center gap-2">
        <div class="flex rounded-lg bg-[var(--surface)] p-0.5">
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition"
            :class="store.storageMode === 'temporal' ? 'bg-[var(--bg-elevated)] text-[var(--text)]' : 'text-[var(--muted)]'"
            @click="store.setStorageMode('temporal')"
          >
            {{ t("storyboard.storage.temporal") }}
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition"
            :class="store.storageMode === 'persistent' ? 'bg-[var(--bg-elevated)] text-[var(--text)]' : 'text-[var(--muted)]'"
            @click="store.setStorageMode('persistent')"
          >
            {{ t("storyboard.storage.persistent") }}
          </button>
        </div>

        <button
          v-if="store.step !== 'prompt'"
          type="button"
          class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)]"
          @click="resetAll"
        >
          {{ t("storyboard.reset") }}
        </button>
      </div>
    </div>

    <nav class="mb-8 flex max-w-2xl items-center justify-between mx-auto">
      <template v-for="(s, i) in STEPS" :key="s.key">
        <button
          type="button"
          class="flex flex-col items-center gap-1.5 transition"
          :class="canNavigateToStep(i) ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
          :disabled="!canNavigateToStep(i)"
          @click="goToStep(s.key)"
        >
          <div
            class="flex h-9 w-9 items-center justify-center rounded-xl border text-sm transition"
            :class="
              i === stepIndex
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[#1a120c] shadow-lg'
                : i < stepIndex
                  ? 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]'
            "
          >
            {{ i < stepIndex ? "✓" : i + 1 }}
          </div>
          <span
            class="text-[10px] font-medium"
            :class="i === stepIndex ? 'text-[var(--text)]' : i < stepIndex ? 'text-[var(--accent)]' : 'text-[var(--muted)]'"
          >
            {{ s.label }}
          </span>
        </button>
        <div v-if="i < STEPS.length - 1" class="mx-2 h-px flex-1" :class="i < stepIndex ? 'bg-[var(--accent)]/50' : 'bg-[var(--border)]'" />
      </template>
    </nav>

    <div
      v-if="graphError"
      class="mb-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm"
    >
      <p class="flex-1 text-red-200">{{ graphError }}</p>
      <button type="button" class="text-[var(--muted)] hover:text-[var(--text)]" @click="graphError = ''">×</button>
    </div>

    <div
      v-if="store.storageMode === 'temporal' && store.step !== 'prompt' && !dismissedBanners.has('temporal')"
      class="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <span class="text-amber-400">⚠</span>
      <p class="flex-1 text-[var(--text)]/80">
        <span class="font-medium text-amber-400">{{ t("storyboard.banner.temporalTitle") }}</span>
        — {{ t("storyboard.banner.temporalBody") }}
      </p>
      <button type="button" class="text-[var(--muted)] hover:text-[var(--text)]" @click="dismissBanner('temporal')">×</button>
    </div>

    <div
      v-if="store.restored && store.step !== 'prompt' && !dismissedBanners.has('session')"
      class="mb-6 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
    >
      <span class="text-[var(--muted)]">ℹ</span>
      <p class="flex-1 text-[var(--muted)]">
        <span class="font-medium text-[var(--text)]">{{ t("storyboard.restored") }}</span>
        — {{ t("storyboard.banner.sessionBody") }}
      </p>
      <button type="button" class="text-[var(--muted)] hover:text-[var(--text)]" @click="dismissBanner('session')">×</button>
    </div>

    <div
      v-if="pendingProduce && store.step === 'result'"
      class="mb-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4"
    >
      <p class="text-sm text-[var(--text)]">{{ t("storyboard.hitl.produceTitle") }}</p>
      <p class="mt-1 text-xs text-[var(--muted)]">{{ t("storyboard.hitl.produceBody") }}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#1a120c] disabled:opacity-50"
          :disabled="graphBusy"
          @click="handleProduceChoice(true)"
        >
          {{ t("storyboard.hitl.produceBatch") }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface)] disabled:opacity-50"
          :disabled="graphBusy"
          @click="handleProduceChoice(false)"
        >
          {{ t("storyboard.hitl.produceManual") }}
        </button>
      </div>
    </div>

    <MasterGenerator
      v-if="store.step === 'prompt'"
      orchestrated
      :busy="graphBusy"
      :result-url="masterPreviewUrl"
      :result-count="masterPreviewCount"
      @start-generate="handleStartGenerate"
      @generate="handleMasterApproved"
    />

    <TransitionGenerator
      v-else-if="store.step === 'transition' && store.masterData"
      orchestrated
      :busy="graphBusy"
      :master-url="store.masterData.url"
      :master-prompt="store.masterData.prompt"
      :storage-mode="store.storageMode"
      @run="handleTransitionRun"
      @skip="handleTransitionSkipped"
    />

    <PanelProcessor
      v-else-if="store.step === 'process' && store.masterData"
      orchestrated
      :busy="graphBusy"
      :external-panels="store.processedPanels"
      :master-url="store.masterData.url"
      :master-prompt="store.masterData.prompt"
      :panel-count="store.masterData.panelCount"
      :storage-mode="store.storageMode"
    />

    <PanelSelector
      v-else-if="store.step === 'selection' && store.masterData"
      :panels="store.processedPanels"
      :master-url="store.masterData.url"
      :transition-panels="store.transitionPanels"
      :saved-final-panels="store.finalPanels"
      :saved-linked-panel-data="store.linkedPanelData"
      :saved-prompts="store.prompts"
      :saved-durations="store.durations"
      :saved-video-urls="store.videoUrls"
      @confirm="handleSelectionComplete"
    />

    <StoryboardResult
      v-else-if="store.step === 'result'"
      :initial-panels="store.finalPanels"
      :linked-panel-data="store.linkedPanelData"
      :prompts="store.prompts"
      :durations="store.durations"
      :video-urls="store.videoUrls"
      :master-description="store.masterData?.prompt"
      @update="handleResultUpdate"
    />
  </section>
</template>
