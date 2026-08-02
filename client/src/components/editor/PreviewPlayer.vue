<script setup lang="ts">
import { computed, ref } from "vue"
import { useI18n } from "vue-i18n"
import { formatTimecode } from "@/editor/utils/time"

const props = defineProps<{
  currentTime: number
  duration: number
  isPlaying: boolean
  isExporting: boolean
  isEmpty?: boolean
}>()

const emit = defineEmits<{
  togglePlay: []
  seek: [time: number]
}>()

const { t } = useI18n()

const videoRefA = ref<HTMLVideoElement | null>(null)
const videoRefB = ref<HTMLVideoElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const audioRefA1 = ref<HTMLAudioElement | null>(null)

const scrubberValue = computed({
  get: () => props.currentTime,
  set: (v: number) => emit("seek", v),
})

defineExpose({
  videoRefA,
  videoRefB,
  imageRef,
  canvasRef,
  audioRefA1,
})
</script>

<template>
  <div class="preview">
    <div class="preview-stage" :class="{ 'preview-stage--empty': isEmpty && !isExporting }">
      <video ref="videoRefA" class="preview-video" playsinline crossorigin="anonymous" />
      <video ref="videoRefB" class="preview-video" playsinline crossorigin="anonymous" />
      <img ref="imageRef" class="preview-image" alt="" />
      <canvas ref="canvasRef" class="hidden-canvas" />

      <div v-if="isEmpty && !isExporting" class="empty-state">
        <div class="empty-monitor">
          <span class="empty-eyebrow">{{ t("timeline.previewEmptyEyebrow") }}</span>
          <p class="empty-title">{{ t("timeline.previewEmptyTitle") }}</p>
          <p class="empty-body">{{ t("timeline.previewEmptyBody") }}</p>
        </div>
      </div>

      <div v-if="isExporting" class="export-overlay">{{ t("timeline.exporting") }}</div>
    </div>

    <div class="preview-controls">
      <button type="button" class="play-btn" :aria-label="isPlaying ? t('timeline.pause') : t('timeline.play')" @click="emit('togglePlay')">
        {{ isPlaying ? "⏸" : "▶" }}
      </button>
      <span class="timecode">{{ formatTimecode(currentTime) }} / {{ formatTimecode(duration) }}</span>
      <input
        v-model.number="scrubberValue"
        class="scrubber"
        type="range"
        min="0"
        :max="duration"
        step="0.033"
      />
    </div>

    <audio ref="audioRefA1" crossorigin="anonymous" />
  </div>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #0d121a;
  user-select: none;
  -webkit-user-select: none;
}

.preview-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background:
    radial-gradient(85% 70% at 18% 20%, rgba(232, 168, 124, 0.16), transparent 55%),
    radial-gradient(75% 65% at 86% 78%, rgba(56, 132, 189, 0.18), transparent 52%),
    radial-gradient(60% 50% at 50% 50%, rgba(129, 140, 248, 0.08), transparent 60%),
    linear-gradient(165deg, #182231 0%, #101821 45%, #0c1219 100%);
}

.preview-stage--empty {
  background:
    radial-gradient(90% 75% at 22% 18%, rgba(232, 168, 124, 0.28), transparent 52%),
    radial-gradient(80% 70% at 82% 82%, rgba(56, 132, 189, 0.26), transparent 48%),
    radial-gradient(55% 45% at 55% 40%, rgba(251, 191, 36, 0.08), transparent 55%),
    linear-gradient(160deg, #243246 0%, #162030 48%, #101821 100%);
}

.preview-stage--empty::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(115deg, transparent 40%, rgba(232, 168, 124, 0.06) 50%, transparent 60%);
  mix-blend-mode: screen;
}

.preview-video,
.preview-image {
  position: absolute;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  z-index: 2;
}

.preview-image {
  opacity: 0;
}

.hidden-canvas {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 1px;
  height: 1px;
}

.empty-state {
  position: relative;
  z-index: 1;
  width: min(72%, 34rem);
  pointer-events: none;
}

.empty-monitor {
  position: relative;
  aspect-ratio: 16 / 9;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 1.5rem 1.75rem;
  text-align: center;
  border-radius: 0.75rem;
  border: 1px solid rgba(232, 168, 124, 0.28);
  background:
    linear-gradient(145deg, rgba(232, 168, 124, 0.12), rgba(56, 132, 189, 0.1) 55%, rgba(15, 23, 42, 0.45)),
    rgba(18, 28, 40, 0.62);
  backdrop-filter: blur(10px);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 18px 50px rgba(8, 12, 20, 0.35),
    0 0 60px rgba(232, 168, 124, 0.08);
}

.empty-monitor::before,
.empty-monitor::after {
  content: "";
  position: absolute;
  width: 0.7rem;
  height: 0.7rem;
  border-color: rgba(232, 168, 124, 0.7);
  border-style: solid;
}

.empty-monitor::before {
  top: 0.7rem;
  left: 0.7rem;
  border-width: 1.5px 0 0 1.5px;
}

.empty-monitor::after {
  right: 0.7rem;
  bottom: 0.7rem;
  border-width: 0 1.5px 1.5px 0;
}

.empty-eyebrow {
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
}

.empty-title {
  margin: 0.15rem 0 0;
  font-size: 1.08rem;
  font-weight: 600;
  color: #f8fafc;
  letter-spacing: 0.02em;
}

.empty-body {
  margin: 0;
  max-width: 18rem;
  font-size: 0.78rem;
  line-height: 1.55;
  color: rgba(186, 198, 214, 0.95);
}

.export-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  font-size: 0.875rem;
  color: var(--accent);
}

.preview-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
}

.play-btn {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: var(--accent);
  color: #1a120c;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.play-btn:hover {
  background: var(--accent-strong);
}

.timecode {
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  color: var(--muted);
  min-width: 9rem;
}

.scrubber {
  flex: 1;
  accent-color: var(--accent);
}
</style>
