<script setup lang="ts">
import { ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import type { ExportPhase } from "@/composables/useFfmpegExport"

const props = defineProps<{
  open: boolean
  isExporting: boolean
  exportProgress: number
  exportPhase: ExportPhase
  exportFrameLabel?: string
  downloadUrl: string | null
  ffmpegError: string | null
}>()

const emit = defineEmits<{
  close: []
  start: [resolution: "720p" | "1080p"]
  cancel: []
}>()

const { t } = useI18n()
const resolution = ref<"720p" | "1080p">("720p")
const autoDownloaded = ref(false)

watch(
  () => props.open,
  (v) => {
    if (v) {
      resolution.value = "720p"
      autoDownloaded.value = false
    }
  },
)

watch(
  () => [props.exportPhase, props.downloadUrl] as const,
  ([phase, url]) => {
    if (phase === "complete" && url && !autoDownloaded.value) {
      autoDownloaded.value = true
      triggerDownload(url)
    }
  },
)

function phaseLabel(phase: ExportPhase): string {
  const map: Record<ExportPhase, string> = {
    idle: t("timeline.exportPhaseIdle"),
    init: t("timeline.exportPhaseInit"),
    fetch: t("timeline.exportPhaseFetch"),
    audio: t("timeline.exportPhaseAudio"),
    video: t("timeline.exportPhaseVideo"),
    encoding: t("timeline.exportPhaseEncoding"),
    complete: t("timeline.exportPhaseComplete"),
  }
  return map[phase]
}

function triggerDownload(url: string) {
  const a = document.createElement("a")
  a.href = url
  a.download = `lensmith-${Date.now()}.mp4`
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function onDownloadClick() {
  if (props.downloadUrl) triggerDownload(props.downloadUrl)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="!isExporting && emit('close')">
      <div class="modal">
        <header class="modal-header">
          <h2>{{ t("timeline.exportTitle") }}</h2>
          <button type="button" class="close-btn" :disabled="isExporting" @click="emit('close')">×</button>
        </header>

        <div v-if="!isExporting && exportPhase !== 'complete'" class="modal-body">
          <p class="hint">{{ t("timeline.exportHint") }}</p>
          <div class="res-grid">
            <button
              type="button"
              class="res-btn"
              :class="{ active: resolution === '1080p' }"
              @click="resolution = '1080p'"
            >
              <strong>1080p</strong>
              <span>1920×1080</span>
            </button>
            <button
              type="button"
              class="res-btn"
              :class="{ active: resolution === '720p' }"
              @click="resolution = '720p'"
            >
              <strong>720p</strong>
              <span>1280×720</span>
            </button>
          </div>
          <p v-if="ffmpegError" class="error">{{ ffmpegError }}</p>
        </div>

        <div v-else-if="exportPhase === 'complete' && downloadUrl" class="modal-body">
          <p class="phase success-title">{{ t("timeline.exportPhaseComplete") }}</p>
          <p class="hint success-hint">{{ t("timeline.exportReadyHint") }}</p>
          <button type="button" class="download-btn" @click="onDownloadClick">
            {{ t("timeline.download") }}
          </button>
        </div>

        <div v-else class="modal-body">
          <p class="phase">{{ phaseLabel(exportPhase) }}</p>
          <p v-if="exportFrameLabel && (exportPhase === 'video' || exportPhase === 'fetch')" class="frame-label">
            {{
              exportPhase === "fetch"
                ? t("timeline.exportFetchProgress", { label: exportFrameLabel })
                : t("timeline.exportFrameProgress", { label: exportFrameLabel })
            }}
          </p>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${exportProgress}%` }" />
          </div>
          <p class="progress-text">{{ Math.round(exportProgress) }}%</p>
          <p v-if="isExporting && exportPhase === 'video'" class="hint slow-hint">{{ t("timeline.exportSlowHint") }}</p>
          <p v-if="ffmpegError" class="error">{{ ffmpegError }}</p>
        </div>

        <footer class="modal-footer">
          <button v-if="isExporting" type="button" class="btn-secondary" @click="emit('cancel')">
            {{ t("timeline.cancel") }}
          </button>
          <button v-else-if="exportPhase !== 'complete'" type="button" class="btn-primary" @click="emit('start', resolution)">
            {{ t("timeline.startExport") }}
          </button>
          <template v-else>
            <button type="button" class="btn-secondary" @click="onDownloadClick">{{ t("timeline.downloadAgain") }}</button>
            <button type="button" class="btn-primary" @click="emit('close')">{{ t("timeline.done") }}</button>
          </template>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  padding: 1rem;
}

.modal {
  width: min(420px, 100%);
  border-radius: 0.85rem;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--border);
}
.modal-header h2 {
  margin: 0;
  font-size: 1rem;
}
.close-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}
.close-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.modal-body {
  padding: 1rem;
}

.hint {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: var(--muted);
  line-height: 1.5;
}

.success-title {
  color: var(--accent);
}

.success-hint {
  margin-bottom: 1rem;
}

.download-btn {
  display: block;
  width: 100%;
  border-radius: 0.55rem;
  padding: 0.7rem 1rem;
  background: var(--accent);
  color: #1a120c;
  font-size: 0.875rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
}
.download-btn:hover {
  filter: brightness(1.06);
}

.res-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.res-btn {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  background: var(--surface);
  text-align: left;
  color: var(--text);
}
.res-btn span {
  font-size: 0.7rem;
  color: var(--muted);
}
.res-btn.active {
  border-color: var(--accent);
  background: rgba(232, 168, 124, 0.12);
}

.error {
  margin-top: 0.75rem;
  color: #f87171;
  font-size: 0.8125rem;
}

.phase {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
}

.frame-label {
  margin: -0.35rem 0 0.65rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.slow-hint {
  margin-top: 0.65rem;
}

.progress-bar {
  height: 0.5rem;
  border-radius: 999px;
  background: var(--surface);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}
.progress-text {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--muted);
  text-align: center;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border);
}

.btn-primary,
.btn-secondary {
  border-radius: 0.5rem;
  padding: 0.45rem 0.85rem;
  font-size: 0.8125rem;
  cursor: pointer;
}
.btn-primary {
  background: var(--accent);
  color: #1a120c;
  font-weight: 600;
  border: none;
}
.btn-secondary {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}
</style>
