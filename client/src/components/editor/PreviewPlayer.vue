<script setup lang="ts">
import { computed, ref } from "vue"
import { useI18n } from "vue-i18n"
import { formatTimecode } from "@/editor/utils/time"

const props = defineProps<{
  currentTime: number
  duration: number
  isPlaying: boolean
  isExporting: boolean
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
    <div class="preview-stage">
      <video ref="videoRefA" class="preview-video" playsinline crossorigin="anonymous" />
      <video ref="videoRefB" class="preview-video" playsinline crossorigin="anonymous" />
      <img ref="imageRef" class="preview-image" alt="" />
      <canvas ref="canvasRef" class="hidden-canvas" />
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
  background: #05070a;
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
}

.preview-video,
.preview-image {
  position: absolute;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
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

.export-overlay {
  position: absolute;
  inset: 0;
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
