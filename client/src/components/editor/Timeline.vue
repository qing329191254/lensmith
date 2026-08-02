<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { storeToRefs } from "pinia"
import { TIMELINE_CONSTANTS } from "@/editor/constants"
import type { TimelineClip, Track } from "@/editor/types"
import { formatTimecode } from "@/editor/utils/time"
import { getNextZoom, getPrevZoom, getZoomConfig } from "@/editor/utils/timeline-scale"
import { useTimelineDrag } from "@/composables/useTimelineDrag"
import { useEditorStore } from "@/stores/editor"

const props = defineProps<{
  dragStartHandler: () => void
}>()

const emit = defineEmits<{
  seek: [time: number]
}>()

const { t } = useI18n()
const store = useEditorStore()
const {
  timelineClips,
  tracks,
  mediaMap,
  currentTime,
  duration,
  zoomLevel,
  selectedClipIds,
  isPlaying,
  snapEnabled,
  history,
  future,
} = storeToRefs(store)

const scrollRef = ref<HTMLDivElement | null>(null)
const isScrubbing = ref(false)
const { snapIndicator, handleMouseDownClip } = useTimelineDrag({
  clips: () => timelineClips.value,
  selectedClipIds: () => selectedClipIds.value,
  zoomLevel: () => zoomLevel.value,
  snapEnabled: () => snapEnabled.value,
  getSnapTime: (time, ignore) => store.getSnapTime(time, ignore),
  getMediaDuration: (clipId) => {
    const clip = timelineClips.value.find((c) => c.id === clipId)
    if (!clip) return null
    return mediaMap.value[clip.mediaId]?.duration ?? null
  },
  onClipUpdate: (id, changes) => store.updateClip(id, changes),
  onSelectClips: (ids) => store.selectClips(ids),
  onDragStart: () => {
    store.pushHistory()
    props.dragStartHandler()
  },
  onDragEndCommit: () => {},
})

const totalWidth = computed(() => {
  if (timelineClips.value.length === 0) return 2000
  const maxEnd = Math.max(...timelineClips.value.map((c) => c.start + c.duration))
  return Math.max(maxEnd * zoomLevel.value + 500, 2000)
})

const zoomConfig = computed(() => getZoomConfig(zoomLevel.value))

const rulerTicks = computed(() => {
  const ticks: { left: number; label?: string; major: boolean }[] = []
  const pps = zoomLevel.value
  const { majorInterval, minorDivisions } = zoomConfig.value
  const minorInterval = majorInterval / minorDivisions
  const endTime = totalWidth.value / pps
  for (let t = 0; t <= endTime; t += minorInterval) {
    const isMajor = Math.abs(t % majorInterval) < 0.001 || t === 0
    ticks.push({
      left: t * pps,
      label: isMajor ? formatTimecode(t).slice(0, 8) : undefined,
      major: isMajor,
    })
  }
  return ticks
})

function clipsForTrack(trackId: string): TimelineClip[] {
  return timelineClips.value.filter((c) => c.trackId === trackId)
}

function clipStyle(clip: TimelineClip) {
  return {
    left: `${clip.start * zoomLevel.value}px`,
    width: `${Math.max(clip.duration * zoomLevel.value, TIMELINE_CONSTANTS.CLIP_MIN_WIDTH)}px`,
  }
}

function clipLabel(clip: TimelineClip): string {
  const media = mediaMap.value[clip.mediaId]
  return media?.prompt?.slice(0, 24) || clip.id.slice(0, 6)
}

function clipColor(track: Track, clip: TimelineClip): string {
  const media = mediaMap.value[clip.mediaId]
  if (track.type === "audio") return "var(--clip-audio)"
  if (media?.type === "image") return "var(--clip-image)"
  return "var(--clip-video)"
}

function onRulerDown(e: MouseEvent) {
  if (!scrollRef.value) return
  isScrubbing.value = true
  props.dragStartHandler()
  seekFromEvent(e)
}

function seekFromEvent(e: MouseEvent) {
  if (!scrollRef.value) return
  const rect = scrollRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollRef.value.scrollLeft
  const time = Math.max(0, Math.min(x / zoomLevel.value, duration.value))
  emit("seek", time)
}

function onMouseUp() {
  isScrubbing.value = false
}

function zoomIn() {
  store.setZoom(getNextZoom(zoomLevel.value))
}

function zoomOut() {
  store.setZoom(getPrevZoom(zoomLevel.value))
}

function deleteSelected() {
  if (selectedClipIds.value.length) store.deleteClips([...selectedClipIds.value])
}

function splitSelected() {
  store.splitAtPlayhead()
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return
  if (e.code === "Space") {
    e.preventDefault()
    store.togglePlay()
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault()
    store.undo()
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
    e.preventDefault()
    store.redo()
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
    e.preventDefault()
    splitSelected()
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    deleteSelected()
  }
}

onMounted(() => {
  window.addEventListener("mouseup", onMouseUp)
  window.addEventListener("keydown", onKeyDown)
})
onUnmounted(() => {
  window.removeEventListener("mouseup", onMouseUp)
  window.removeEventListener("keydown", onKeyDown)
})
</script>

<template>
  <div class="timeline-panel">
    <div class="toolbar">
      <button type="button" class="tool-btn" @click="store.togglePlay()">
        {{ isPlaying ? t("timeline.pause") : t("timeline.play") }}
      </button>
      <span class="tool-time">{{ formatTimecode(currentTime) }}</span>
      <span class="sep" />
      <button type="button" class="tool-btn" :disabled="!history.length" @click="store.undo()">{{ t("timeline.undo") }}</button>
      <button type="button" class="tool-btn" :disabled="!future.length" @click="store.redo()">{{ t("timeline.redo") }}</button>
      <button type="button" class="tool-btn" @click="splitSelected()" :title="t('timeline.splitHint')">
        {{ t("timeline.split") }}
      </button>
      <button type="button" class="tool-btn danger" :disabled="!selectedClipIds.length" @click="deleteSelected()" :title="t('timeline.deleteHint')">
        {{ t("timeline.delete") }}
      </button>
      <span class="sep" />
      <button type="button" class="tool-btn" @click="zoomOut()">−</button>
      <span class="zoom-label">{{ Math.round(zoomLevel) }} px/s</span>
      <button type="button" class="tool-btn" @click="zoomIn()">+</button>
      <label class="snap-toggle">
        <input v-model="snapEnabled" type="checkbox" />
        {{ t("timeline.snap") }}
      </label>
    </div>
    <p class="timeline-hint">{{ t("timeline.editHint") }}</p>

    <div class="timeline-body">
      <div class="track-labels">
        <div class="ruler-spacer" />
        <div
          v-for="track in tracks"
          :key="track.id"
          class="track-label"
          :style="{ height: track.type === 'audio' ? `${TIMELINE_CONSTANTS.AUDIO_TRACK_HEIGHT}px` : `${TIMELINE_CONSTANTS.TRACK_HEIGHT}px` }"
        >
          {{ track.name }}
        </div>
        <div class="scrollbar-spacer" aria-hidden="true" />
      </div>

      <div
        ref="scrollRef"
        class="timeline-scroll"
        @mousemove="isScrubbing && seekFromEvent($event)"
        @mousedown.self="onRulerDown"
      >
        <div class="timeline-content" :style="{ width: `${totalWidth}px` }">
          <div class="ruler" @mousedown="onRulerDown">
            <div
              v-for="(tick, i) in rulerTicks"
              :key="i"
              class="tick"
              :class="{ major: tick.major }"
              :style="{ left: `${tick.left}px` }"
            >
              <span v-if="tick.label" class="tick-label">{{ tick.label }}</span>
            </div>
          </div>

          <div
            v-for="track in tracks"
            :key="track.id"
            class="track-lane"
            :class="`track-lane--${track.type}`"
            :style="{ height: track.type === 'audio' ? `${TIMELINE_CONSTANTS.AUDIO_TRACK_HEIGHT}px` : `${TIMELINE_CONSTANTS.TRACK_HEIGHT}px` }"
          >
            <div
              v-for="clip in clipsForTrack(track.id)"
              :key="clip.id"
              class="clip"
              :class="{ selected: selectedClipIds.includes(clip.id) }"
              :style="{ ...clipStyle(clip), background: clipColor(track, clip) }"
              @mousedown="handleMouseDownClip($event, clip, 'move')"
            >
              <div
                class="trim-handle trim-start"
                @mousedown.stop="handleMouseDownClip($event, clip, 'trim-start')"
              />
              <span class="clip-label">{{ clipLabel(clip) }}</span>
              <div
                class="trim-handle trim-end"
                @mousedown.stop="handleMouseDownClip($event, clip, 'trim-end')"
              />
            </div>
          </div>

          <div
            v-if="snapIndicator !== null"
            class="snap-line"
            :style="{ left: `${snapIndicator * zoomLevel}px` }"
          />

          <div class="playhead" :style="{ left: `${currentTime * zoomLevel}px` }">
            <div class="playhead-head" />
            <div class="playhead-line" />
          </div>

          <!-- 给横向滚动条留空，避免挡住最下方音轨 -->
          <div class="scrollbar-spacer" aria-hidden="true" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
  --clip-video: rgba(56, 132, 189, 0.85);
  --clip-image: rgba(59, 99, 196, 0.85);
  --clip-audio: rgba(16, 148, 99, 0.85);
  user-select: none;
  -webkit-user-select: none;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.tool-btn {
  border-radius: 0.4rem;
  padding: 0.3rem 0.55rem;
  font-size: 0.75rem;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--border);
}
.tool-btn:hover:not(:disabled) {
  color: var(--text);
}
.tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.tool-btn.danger:hover:not(:disabled) {
  color: #f87171;
}

.timeline-hint {
  margin: 0;
  padding: 0.35rem 0.75rem 0.5rem;
  font-size: 0.7rem;
  line-height: 1.4;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

.tool-time {
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  color: var(--text);
  min-width: 5.5rem;
}

.sep {
  width: 1px;
  height: 1.25rem;
  background: var(--border);
  margin: 0 0.25rem;
}

.zoom-label {
  font-size: 0.7rem;
  color: var(--muted);
  min-width: 4.5rem;
  text-align: center;
}

.snap-toggle {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--muted);
}

.timeline-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.track-labels {
  width: 5.5rem;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--surface);
}

.ruler-spacer {
  height: 28px;
  border-bottom: 1px solid var(--border);
}

.track-label {
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  font-size: 0.7rem;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

.timeline-scroll {
  flex: 1;
  overflow: auto;
  position: relative;
  scrollbar-gutter: stable;
}

.timeline-content {
  position: relative;
  min-height: 100%;
  box-sizing: border-box;
}

.scrollbar-spacer {
  height: 14px;
  flex-shrink: 0;
}

.ruler {
  position: sticky;
  top: 0;
  z-index: 5;
  height: 28px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.08);
}
.tick.major {
  background: rgba(255, 255, 255, 0.18);
}
.tick-label {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 0.625rem;
  color: var(--muted);
  white-space: nowrap;
}

.track-lane {
  position: relative;
  border-bottom: 1px solid var(--border);
}
.track-lane--video {
  background: rgba(56, 132, 189, 0.06);
}
.track-lane--audio {
  background: rgba(16, 148, 99, 0.06);
}

.clip {
  position: absolute;
  top: 6px;
  bottom: 6px;
  border-radius: 0.35rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: grab;
  display: flex;
  align-items: center;
  overflow: hidden;
  user-select: none;
}
.clip.selected {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.clip-label {
  padding: 0 0.5rem;
  font-size: 0.65rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.trim-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  cursor: ew-resize;
  z-index: 2;
  background: transparent;
}
.trim-handle:hover,
.clip.selected .trim-handle {
  background: rgba(232, 168, 124, 0.55);
}
.trim-start {
  left: 0;
  border-radius: 0.35rem 0 0 0.35rem;
}
.trim-end {
  right: 0;
  border-radius: 0 0.35rem 0.35rem 0;
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  z-index: 10;
  pointer-events: none;
}
.playhead-head {
  position: absolute;
  top: 0;
  left: -6px;
  width: 12px;
  height: 12px;
  background: #ef4444;
  clip-path: polygon(50% 100%, 0 0, 100% 0);
}
.playhead-line {
  position: absolute;
  top: 12px;
  bottom: 0;
  left: 0;
  width: 2px;
  margin-left: -1px;
  background: #ef4444;
}

.snap-line {
  position: absolute;
  top: 28px;
  bottom: 0;
  width: 1px;
  background: #facc15;
  z-index: 8;
  pointer-events: none;
}
</style>
