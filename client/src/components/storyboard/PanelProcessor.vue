<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { DEMO_STORYBOARD } from "@/lib/demo-data"
import { extractPanelFromGrid } from "@/lib/panel-extraction"
import { isRequestGateError } from "@/api/seq"
import type { StorageMode } from "@/stores/storyboard"

const props = withDefaults(
  defineProps<{
    masterUrl: string
    masterPrompt: string
    panelCount: number
    storageMode: StorageMode
    /** Graph is extracting panels; UI is progress-only. */
    orchestrated?: boolean
    busy?: boolean
    externalPanels?: string[]
  }>(),
  { orchestrated: false, busy: false, externalPanels: () => [] },
)

const emit = defineEmits<{
  complete: [panels: string[]]
  runExtract: []
}>()

const { t } = useI18n()

const status = ref<"ready" | "processing" | "complete">("ready")
const panels = ref<string[]>([])
const progress = ref(0)
const regenerating = ref<number[]>([])
const processing = ref(false)
const toast = ref("")
const localError = ref("")

const gridColumns = computed<"2" | "3">(() => (props.panelCount <= 4 ? "2" : "3"))

const showStartActions = computed(
  () => !props.busy && !processing.value && panels.value.length === 0 && status.value !== "processing",
)

const showContinue = computed(() => !props.busy && !processing.value && panels.value.length > 0)

watch(
  () => [props.orchestrated, props.busy, props.externalPanels] as const,
  ([orchestrated, busy, external]) => {
    if (!orchestrated) return
    if (busy) {
      status.value = "processing"
      progress.value = Math.min(90, (panels.value.length / Math.max(props.panelCount, 1)) * 100 + 10)
      return
    }
    if (external.length) {
      panels.value = [...external]
      progress.value = 100
      status.value = "complete"
      localError.value = ""
    } else if (!processing.value && panels.value.length === 0) {
      status.value = "ready"
    }
  },
  { immediate: true, deep: true },
)

async function processPanels() {
  if (processing.value || props.busy) return

  // Orchestrated HITL: server runs AI extract only when the user asks.
  if (props.orchestrated) {
    emit("runExtract")
    return
  }

  processing.value = true
  status.value = "processing"
  panels.value = []
  progress.value = 0
  localError.value = ""
  toast.value = ""

  try {
    const extracted: string[] = []
    const columns = Number(gridColumns.value) as 2 | 3

    for (let i = 0; i < props.panelCount; i++) {
      const url = await extractPanelFromGrid(i, props.masterUrl, {
        columns,
        kind: "main",
        uploadToBlob: props.storageMode === "persistent",
      })
      if (url) {
        extracted.push(url)
        panels.value = [...extracted]
      }
      progress.value = ((i + 1) / props.panelCount) * 100
    }

    if (!extracted.length) {
      status.value = "ready"
      localError.value = t("storyboard.process.errEmpty")
      return
    }

    status.value = "complete"
    progress.value = 100

    if (props.storageMode === "temporal") {
      const dataUriCount = panels.value.filter((url) => url.startsWith("data:")).length
      toast.value = t("storyboard.process.toastTemporal", { count: dataUriCount })
    } else {
      const httpUrlCount = panels.value.filter((url) => url.startsWith("http")).length
      toast.value = t("storyboard.process.toastSaved", { count: httpUrlCount })
    }
  } catch (e) {
    if (isRequestGateError(e)) return
    console.error("Processing error:", e)
    status.value = "ready"
    localError.value = t("storyboard.process.errEmpty")
  } finally {
    processing.value = false
  }
}

function continueWithPanels() {
  if (!panels.value.length) return
  emit("complete", [...panels.value])
}

function useMasterAndContinue() {
  panels.value = [props.masterUrl]
  progress.value = 100
  status.value = "complete"
  localError.value = ""
  emit("complete", [props.masterUrl])
}

async function regeneratePanel(index: number) {
  regenerating.value = [...regenerating.value, index]
  try {
    const columns = Number(gridColumns.value) as 2 | 3
    const url = await extractPanelFromGrid(index, props.masterUrl, {
      columns,
      kind: "main",
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

function loadDemoPanels() {
  const demoPanelUrls = DEMO_STORYBOARD.panels.map((p) => p.imageUrl)
  panels.value = demoPanelUrls
  progress.value = 100
  status.value = "complete"
  localError.value = ""
  toast.value = t("storyboard.process.demoLoaded", { count: demoPanelUrls.length })
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <div class="mb-8 text-center">
      <h2 class="display text-2xl">{{ t("storyboard.process.title") }}</h2>
      <p class="mt-2 text-sm text-[var(--muted)]">
        {{ t("storyboard.process.subtitle", { count: panelCount }) }}
        <span v-if="masterPrompt.includes('Ratatouille')"> ({{ t("storyboard.demoMode") }})</span>
      </p>
    </div>

    <p v-if="toast" class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
      {{ toast }}
    </p>
    <p v-if="localError" class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
      {{ localError }}
    </p>
    <p
      v-if="showStartActions && orchestrated"
      class="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center text-sm text-[var(--muted)]"
    >
      {{ t("storyboard.process.emptyHint") }}
    </p>

    <div v-if="showStartActions" class="mb-4 flex flex-wrap justify-center gap-3">
      <button
        type="button"
        class="rounded-lg bg-[var(--accent)] px-6 py-3 font-medium text-[#1a120c]"
        @click="processPanels"
      >
        ▶ {{ t("storyboard.process.start") }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-[var(--border)] px-6 py-3 hover:bg-[var(--surface)]"
        @click="useMasterAndContinue"
      >
        {{ t("storyboard.process.useMaster") }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-[var(--border)] px-6 py-3 hover:bg-[var(--surface)]"
        @click="loadDemoPanels"
      >
        ✦ {{ t("storyboard.process.useDemo") }}
      </button>
    </div>

    <div v-if="showContinue" class="mb-4 flex flex-wrap justify-center gap-3">
      <button
        type="button"
        class="rounded-lg bg-[var(--accent)] px-6 py-3 font-medium text-[#1a120c]"
        @click="continueWithPanels"
      >
        → {{ t("storyboard.process.continueSelect") }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-[var(--border)] px-6 py-3 hover:bg-[var(--surface)]"
        @click="processPanels"
      >
        ↻ {{ t("storyboard.process.start") }}
      </button>
    </div>

    <p
      v-if="(orchestrated && busy) || processing"
      class="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center text-sm text-[var(--muted)]"
    >
      {{ t("storyboard.hitl.processWorking") }}
    </p>

    <div class="grid items-start gap-8 md:grid-cols-2">
      <div class="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div class="relative aspect-[3/2] overflow-hidden rounded-lg">
          <img :src="masterUrl" :alt="t('storyboard.masterAlt')" class="h-full w-full object-cover" />
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
            <span class="rounded-full border border-white/20 bg-black/60 px-3 py-1 text-sm text-white backdrop-blur-sm">
              {{ t("storyboard.process.masterRef") }}
            </span>
          </div>
        </div>
      </div>

      <div class="space-y-6">
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-[var(--muted)]">{{ t("storyboard.status") }}</span>
            <span class="font-medium capitalize">
              {{
                status === "processing" || processing || busy
                  ? t("storyboard.process.extracting", { current: panels.length + 1, total: panelCount })
                  : status
              }}
            </span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-[var(--surface)]">
            <div class="h-full bg-[var(--accent)] transition-all duration-500" :style="{ width: `${progress}%` }" />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div
            v-for="(_, i) in panelCount"
            :key="i"
            class="group relative aspect-video overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)]"
          >
            <img
              v-if="panels[i]"
              :src="panels[i]"
              :alt="t('storyboard.panelAlt', { n: i + 1 })"
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
            <div
              v-if="(status === 'processing' || processing) && i === panels.length"
              class="absolute inset-0 animate-pulse bg-white/10"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
