<script setup lang="ts">
import { computed, ref } from "vue"
import { useI18n } from "vue-i18n"
import TransitionGenerator from "@/components/storyboard/TransitionGenerator.vue"
import PanelProcessor from "@/components/storyboard/PanelProcessor.vue"
import PanelSelector from "@/components/storyboard/PanelSelector.vue"
import StoryboardResult from "@/components/storyboard/StoryboardResult.vue"
import { isRequestGateError, resumeAdSession, startAdSession, type AdSessionResponse } from "@/api/seq"
import { formatApiError } from "@/lib/provider-errors"
import { useAdStore, type AdStep } from "@/stores/ads"

const { t } = useI18n()
const store = useAdStore()

const graphBusy = ref(false)
const graphError = ref("")
const pendingProduce = ref(false)
const panelCountEdit = ref(6)

const STEPS = computed(() => {
  const keys: AdStep[] = ["brief", "copy", "master", "transition", "process", "selection", "result"]
  return keys.map((key) => ({ key, label: t(`ads.steps.${key}`) }))
})

const stepIndex = computed(() => STEPS.value.findIndex((s) => s.key === store.step))

const templates = computed(() => [
  { id: "pain-product-cta", label: t("ads.templates.painProductCta") },
  { id: "unboxing", label: t("ads.templates.unboxing") },
])

const platforms = computed(() => [
  { id: "tiktok", label: "TikTok" },
  { id: "reels", label: "Reels" },
  { id: "shorts", label: "Shorts" },
])

const durations = [6, 15, 30]

function canNavigateToStep(index: number) {
  if (graphBusy.value) return false
  if (index === 0) return true
  if (index === 1) return !!store.copy.hook || store.copy.lines.length > 0
  if (index === 2) return !!store.masterUrl
  if (index === 3) return !!store.masterUrl
  if (index === 4) return !!store.masterUrl
  if (index === 5) return store.processedPanels.length > 0
  if (index === 6) return store.finalPanels.length > 0
  return false
}

function goToStep(key: AdStep) {
  const index = STEPS.value.findIndex((s) => s.key === key)
  if (canNavigateToStep(index)) store.step = key
}

function applySession(res: AdSessionResponse) {
  store.threadId = res.threadId
  store.waitingFor = res.waitingFor || ""
  const s = res.state
  graphError.value = (s.errors || []).length ? (s.errors || []).join(" · ") : ""

  if (s.brief) store.brief = { ...store.brief, ...s.brief }
  if (s.copy) {
    store.copy = {
      hook: s.copy.hook || "",
      lines: [...(s.copy.lines || [])],
      cta: s.copy.cta || "",
      visualBrief: s.copy.visualBrief || "",
    }
  }
  if (s.masterUrl) store.masterUrl = s.masterUrl
  if (s.panelCount) {
    store.panelCount = s.panelCount
    panelCountEdit.value = s.panelCount
  }
  if (s.workingPrompt) store.workingPrompt = s.workingPrompt
  if (s.transitionPanels?.length) store.transitionPanels = s.transitionPanels
  if (s.processedPanels?.length) store.processedPanels = s.processedPanels

  if (s.panels?.length) {
    store.finalPanels = s.panels.map((p) => p.imageUrl || "").filter(Boolean)
    const linked: Record<number, string> = {}
    const prompts: Record<number, string> = {}
    const durationsMap: Record<number, number> = {}
    const videos: Record<number, string> = {}
    const subs: Record<number, string> = {}
    s.panels.forEach((p, i) => {
      if (p.linkedImageUrl) linked[i] = p.linkedImageUrl
      if (p.prompt) prompts[i] = p.prompt
      if (p.duration) durationsMap[i] = p.duration
      if (p.videoUrl) videos[i] = p.videoUrl
      if (p.subtitle) subs[i] = p.subtitle
    })
    store.linkedPanelData = linked
    store.prompts = prompts
    store.durations = durationsMap
    store.videoUrls = videos
    store.subtitles = subs
  }

  if (res.status === "failed") {
    graphError.value = graphError.value || t("ads.failed")
  }
}

async function resume(action: string, extra: Record<string, unknown> = {}) {
  if (!store.threadId) throw new Error("Missing ad session")
  return resumeAdSession(store.threadId, { action, ...extra })
}

async function handleStartBrief() {
  if (!store.brief.product?.trim()) {
    graphError.value = t("ads.errProduct")
    return
  }
  graphBusy.value = true
  graphError.value = ""
  try {
    const res = await startAdSession({
      brief: {
        ...store.brief,
        product: store.brief.product.trim(),
        aspectRatio: "9:16",
      },
    })
    applySession(res)
    store.step = "copy"
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error(e)
    graphError.value = formatApiError(e, t)
  } finally {
    graphBusy.value = false
  }
}

async function handleReviseMaster() {
  store.masterUrl = null
  graphBusy.value = true
  graphError.value = ""
  try {
    const res = await resume("revise_master")
    applySession(res)
    store.step = "master"
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error(e)
    graphError.value = formatApiError(e, t)
  } finally {
    graphBusy.value = false
  }
}

async function handleApproveCopy() {
  graphBusy.value = true
  graphError.value = ""
  store.step = "master"
  store.masterUrl = null
  try {
    const res = await resume("approve_copy", {
      hook: store.copy.hook,
      lines: store.copy.lines,
      cta: store.copy.cta,
      visualBrief: store.copy.visualBrief,
    })
    applySession(res)
    store.step = "master"
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error(e)
    graphError.value = formatApiError(e, t)
    store.step = "copy"
  } finally {
    graphBusy.value = false
  }
}

async function handleReviseCopy() {
  graphBusy.value = true
  graphError.value = ""
  try {
    const res = await resume("revise_copy", {
      hook: store.copy.hook,
      lines: store.copy.lines,
      cta: store.copy.cta,
      visualBrief: store.copy.visualBrief,
      notes: store.brief.sellingPoints,
    })
    applySession(res)
    store.step = "copy"
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error(e)
    graphError.value = formatApiError(e, t)
  } finally {
    graphBusy.value = false
  }
}

async function handleApproveMaster() {
  graphBusy.value = true
  graphError.value = ""
  try {
    const res = await resume("approve_master", { panelCount: panelCountEdit.value })
    applySession(res)
    store.step = "transition"
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error(e)
    graphError.value = formatApiError(e, t)
  } finally {
    graphBusy.value = false
  }
}

async function continueAfterTransition(decision: { action: string; transitionPrompt?: string }) {
  graphBusy.value = true
  graphError.value = ""
  store.step = "process"
  try {
    const res = await resume(decision.action, { transitionPrompt: decision.transitionPrompt })
    applySession(res)
    if (res.status === "failed") {
      store.step = "transition"
      return
    }
    store.step = "selection"
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error(e)
    graphError.value = formatApiError(e, t)
    store.step = "transition"
  } finally {
    graphBusy.value = false
  }
}

function handleTransitionRun(prompt: string) {
  return continueAfterTransition({ action: "run_transition", transitionPrompt: prompt })
}

function handleTransitionSkip() {
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

  graphBusy.value = true
  graphError.value = ""
  try {
    const panels = selectedPanels.map((imageUrl, i) => ({
      imageUrl,
      linkedImageUrl: linkedData[i] || "",
      prompt: promptsData[i] || "",
      duration: durationsData[i] || 3,
      videoUrl: videoUrlsData[i] || "",
      subtitle: store.subtitles[i] || store.copy.lines[i] || "",
    }))
    const res = await resume("submit_selection", { panels })
    applySession(res)
    pendingProduce.value = res.waitingFor === "confirm_produce"
    store.step = "result"
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error(e)
    graphError.value = formatApiError(e, t)
    store.step = "result"
  } finally {
    graphBusy.value = false
  }
}

async function handleProduceChoice(batch: boolean) {
  if (!store.threadId || store.waitingFor !== "confirm_produce") {
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
    if (isRequestGateError(e)) return
    console.error(e)
    graphError.value = formatApiError(e, t)
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
  if (confirm(t("ads.confirmClear"))) {
    store.clear()
    graphBusy.value = false
    graphError.value = ""
    pendingProduce.value = false
  }
}

function updateCopyLine(index: number, value: string) {
  const next = [...store.copy.lines]
  next[index] = value
  store.copy.lines = next
}

function addCopyLine() {
  if (store.copy.lines.length >= 5) return
  store.copy.lines = [...store.copy.lines, ""]
}
</script>

<template>
  <section class="page-container py-8 sm:py-10">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">{{ t("ads.eyebrow") }}</p>
        <h1 class="display mt-3 text-3xl md:text-4xl">{{ t("ads.title") }}</h1>
        <p class="mt-1 text-xs text-[var(--muted)]">{{ t("ads.subtitle") }}</p>
        <p class="mt-2 text-xs text-[var(--muted)]">{{ t("ads.hitlHint") }}</p>
      </div>
      <button
        v-if="store.step !== 'brief'"
        type="button"
        class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)]"
        @click="resetAll"
      >
        {{ t("ads.reset") }}
      </button>
    </div>

    <nav class="mb-8 mx-auto flex max-w-3xl items-center justify-between">
      <template v-for="(s, i) in STEPS" :key="s.key">
        <button
          type="button"
          class="flex flex-col items-center gap-1.5 transition"
          :class="canNavigateToStep(i) ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
          :disabled="!canNavigateToStep(i)"
          @click="goToStep(s.key)"
        >
          <div
            class="flex h-8 w-8 items-center justify-center rounded-xl border text-xs transition"
            :class="
              i === stepIndex
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[#1a120c]'
                : i < stepIndex
                  ? 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]'
            "
          >
            {{ i < stepIndex ? "✓" : i + 1 }}
          </div>
          <span class="hidden text-[10px] sm:inline" :class="i === stepIndex ? 'text-[var(--text)]' : 'text-[var(--muted)]'">
            {{ s.label }}
          </span>
        </button>
        <div v-if="i < STEPS.length - 1" class="mx-1 h-px flex-1" :class="i < stepIndex ? 'bg-[var(--accent)]/50' : 'bg-[var(--border)]'" />
      </template>
    </nav>

    <div
      v-if="graphError"
      class="mb-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm"
    >
      <p class="flex-1 text-red-200">{{ graphError }}</p>
      <button type="button" class="text-[var(--muted)]" @click="graphError = ''">×</button>
    </div>

    <!-- Brief -->
    <div v-if="store.step === 'brief'" class="mx-auto max-w-2xl space-y-6">
      <div class="text-center">
        <h2 class="display text-2xl">{{ t("ads.briefTitle") }}</h2>
        <p class="mt-2 text-sm text-[var(--muted)]">{{ t("ads.briefSubtitle") }}</p>
      </div>

      <div class="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
        <div>
          <label class="mb-1.5 block text-sm text-[var(--muted)]">{{ t("ads.product") }}</label>
          <input
            v-model="store.brief.product"
            type="text"
            class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--focus)]"
            :placeholder="t('ads.productPlaceholder')"
            :disabled="graphBusy"
          />
        </div>
        <div>
          <label class="mb-1.5 block text-sm text-[var(--muted)]">{{ t("ads.sellingPoints") }}</label>
          <textarea
            v-model="store.brief.sellingPoints"
            rows="3"
            class="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--focus)]"
            :placeholder="t('ads.sellingPlaceholder')"
            :disabled="graphBusy"
          />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-sm text-[var(--muted)]">{{ t("ads.audience") }}</label>
            <input
              v-model="store.brief.audience"
              type="text"
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--focus)]"
              :placeholder="t('ads.audiencePlaceholder')"
              :disabled="graphBusy"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-sm text-[var(--muted)]">{{ t("ads.cta") }}</label>
            <input
              v-model="store.brief.cta"
              type="text"
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--focus)]"
              :placeholder="t('ads.ctaPlaceholder')"
              :disabled="graphBusy"
            />
          </div>
        </div>

        <div>
          <label class="mb-1.5 block text-sm text-[var(--muted)]">{{ t("ads.template") }}</label>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="tpl in templates"
              :key="tpl.id"
              type="button"
              class="rounded-lg border px-3 py-2.5 text-left text-sm transition"
              :class="
                store.brief.template === tpl.id
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/40'
              "
              :disabled="graphBusy"
              @click="store.brief.template = tpl.id"
            >
              {{ tpl.label }}
            </button>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <div>
            <label class="mb-1.5 block text-sm text-[var(--muted)]">{{ t("ads.duration") }}</label>
            <select
              v-model.number="store.brief.durationSec"
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none"
              :disabled="graphBusy"
            >
              <option v-for="d in durations" :key="d" :value="d">{{ d }}s</option>
            </select>
          </div>
          <div>
            <label class="mb-1.5 block text-sm text-[var(--muted)]">{{ t("ads.platform") }}</label>
            <select
              v-model="store.brief.platform"
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none"
              :disabled="graphBusy"
            >
              <option v-for="p in platforms" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>
          </div>
          <div>
            <label class="mb-1.5 block text-sm text-[var(--muted)]">{{ t("ads.aspect") }}</label>
            <input
              type="text"
              value="9:16"
              disabled
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--muted)]"
            />
          </div>
        </div>

        <button
          type="button"
          class="h-12 w-full rounded-lg bg-[var(--accent)] text-lg font-medium text-[#1a120c] disabled:opacity-50"
          :disabled="graphBusy || !store.brief.product?.trim()"
          @click="handleStartBrief"
        >
          {{ graphBusy ? t("ads.working") : t("ads.start") }}
        </button>
      </div>
    </div>

    <!-- Copy review -->
    <div v-else-if="store.step === 'copy'" class="mx-auto max-w-2xl space-y-6">
      <div class="text-center">
        <h2 class="display text-2xl">{{ t("ads.copyTitle") }}</h2>
        <p class="mt-2 text-sm text-[var(--muted)]">{{ t("ads.copySubtitle") }}</p>
      </div>
      <div class="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
        <div>
          <label class="mb-1.5 block text-sm text-[var(--muted)]">{{ t("ads.hook") }}</label>
          <input
            v-model="store.copy.hook"
            type="text"
            class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--focus)]"
            :disabled="graphBusy"
          />
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-sm text-[var(--muted)]">{{ t("ads.lines") }}</label>
            <button type="button" class="text-xs text-[var(--accent)]" :disabled="graphBusy" @click="addCopyLine">
              + {{ t("ads.addLine") }}
            </button>
          </div>
          <input
            v-for="(line, i) in store.copy.lines"
            :key="i"
            :value="line"
            type="text"
            class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--focus)]"
            :disabled="graphBusy"
            @input="updateCopyLine(i, ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div>
          <label class="mb-1.5 block text-sm text-[var(--muted)]">{{ t("ads.cta") }}</label>
          <input
            v-model="store.copy.cta"
            type="text"
            class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--focus)]"
            :disabled="graphBusy"
          />
        </div>
        <div>
          <label class="mb-1.5 block text-sm text-[var(--muted)]">{{ t("ads.visualBrief") }}</label>
          <textarea
            v-model="store.copy.visualBrief"
            rows="4"
            class="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none focus:border-[var(--focus)]"
            :disabled="graphBusy"
          />
        </div>
        <div class="flex gap-3">
          <button
            type="button"
            class="h-11 flex-1 rounded-lg border border-[var(--border)] disabled:opacity-50"
            :disabled="graphBusy"
            @click="handleReviseCopy"
          >
            {{ t("ads.regenerateCopy") }}
          </button>
          <button
            type="button"
            class="h-11 flex-1 rounded-lg bg-[var(--accent)] font-medium text-[#1a120c] disabled:opacity-50"
            :disabled="graphBusy"
            @click="handleApproveCopy"
          >
            {{ graphBusy ? t("ads.working") : t("ads.approveCopy") }}
          </button>
        </div>
      </div>
    </div>

    <!-- Master review -->
    <div v-else-if="store.step === 'master'" class="mx-auto max-w-xl space-y-6">
      <div class="text-center">
        <h2 class="display text-2xl">{{ t("ads.masterTitle") }}</h2>
        <p class="mt-2 text-sm text-[var(--muted)]">{{ t("ads.masterSubtitle") }}</p>
      </div>
      <div v-if="graphBusy && !store.masterUrl" class="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-10 text-center text-sm text-[var(--muted)]">
        {{ t("ads.generatingMaster") }}
      </div>
      <div v-else-if="store.masterUrl" class="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div class="mx-auto aspect-[9/16] max-h-[70vh] overflow-hidden rounded-xl border border-[var(--border)]">
          <img :src="store.masterUrl" :alt="t('ads.masterAlt')" class="h-full w-full object-cover" />
        </div>
        <div class="flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
          <span>{{ t("ads.panelCount") }}</span>
          <input
            v-model.number="panelCountEdit"
            type="number"
            min="1"
            max="12"
            class="h-8 w-16 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-center"
            :disabled="graphBusy"
          />
        </div>
        <div class="flex gap-3">
          <button
            type="button"
            class="h-11 flex-1 rounded-lg border border-[var(--border)] disabled:opacity-50"
            :disabled="graphBusy"
            @click="handleReviseMaster"
          >
            {{ t("ads.regenerateMaster") }}
          </button>
          <button
            type="button"
            class="h-11 flex-1 rounded-lg bg-[var(--accent)] font-medium text-[#1a120c] disabled:opacity-50"
            :disabled="graphBusy"
            @click="handleApproveMaster"
          >
            {{ t("ads.approveMaster") }}
          </button>
        </div>
      </div>
    </div>

    <TransitionGenerator
      v-else-if="store.step === 'transition' && store.masterUrl"
      orchestrated
      :busy="graphBusy"
      :master-url="store.masterUrl"
      :master-prompt="store.workingPrompt || store.copy.hook"
      storage-mode="temporal"
      @run="handleTransitionRun"
      @skip="handleTransitionSkip"
    />

    <PanelProcessor
      v-else-if="store.step === 'process' && store.masterUrl"
      orchestrated
      :busy="graphBusy"
      :external-panels="store.processedPanels"
      :master-url="store.masterUrl"
      :master-prompt="store.workingPrompt || store.copy.hook"
      :panel-count="store.panelCount"
      storage-mode="temporal"
    />

    <PanelSelector
      v-else-if="store.step === 'selection' && store.masterUrl"
      :panels="store.processedPanels"
      :master-url="store.masterUrl"
      :transition-panels="store.transitionPanels"
      :saved-final-panels="store.finalPanels"
      :saved-linked-panel-data="store.linkedPanelData"
      :saved-prompts="store.prompts"
      :saved-durations="store.durations"
      :saved-video-urls="store.videoUrls"
      @confirm="handleSelectionComplete"
    />

    <template v-else-if="store.step === 'result'">
      <div
        v-if="pendingProduce"
        class="mb-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4"
      >
        <p class="text-sm text-[var(--text)]">{{ t("ads.produceTitle") }}</p>
        <p class="mt-1 text-xs text-[var(--muted)]">{{ t("ads.produceBody") }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#1a120c] disabled:opacity-50"
            :disabled="graphBusy"
            @click="handleProduceChoice(true)"
          >
            {{ t("ads.produceBatch") }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50"
            :disabled="graphBusy"
            @click="handleProduceChoice(false)"
          >
            {{ t("ads.produceManual") }}
          </button>
        </div>
      </div>

      <div
        v-if="store.copy.lines.length || store.copy.cta"
        class="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
      >
        <p class="mb-1 text-xs uppercase tracking-wider text-[var(--muted)]">{{ t("ads.subtitleDraft") }}</p>
        <ul class="space-y-1 text-[var(--text)]/90">
          <li v-for="(line, i) in store.copy.lines" :key="i">{{ i + 1 }}. {{ line }}</li>
          <li v-if="store.copy.cta" class="text-[var(--accent)]">CTA · {{ store.copy.cta }}</li>
        </ul>
      </div>

      <StoryboardResult
        :initial-panels="store.finalPanels"
        :linked-panel-data="store.linkedPanelData"
        :prompts="store.prompts"
        :durations="store.durations"
        :video-urls="store.videoUrls"
        :master-description="store.workingPrompt || store.copy.hook"
        @update="handleResultUpdate"
      />
    </template>
  </section>
</template>
