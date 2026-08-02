<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { storeToRefs } from "pinia"
import EditorHeader from "@/components/editor/EditorHeader.vue"
import ExportModal from "@/components/editor/ExportModal.vue"
import PreviewPlayer from "@/components/editor/PreviewPlayer.vue"
import ProjectLibrary from "@/components/editor/ProjectLibrary.vue"
import Timeline from "@/components/editor/Timeline.vue"
import { deserializeProject, loadProjectFromFile, saveProjectToFile, serializeProject } from "@/editor/services/project"
import type { MediaItem } from "@/editor/types"
import { useFfmpegExport } from "@/composables/useFfmpegExport"
import { usePlayback, type PlaybackRefs } from "@/composables/usePlayback"
import { useEditorStore } from "@/stores/editor"

const store = useEditorStore()
const {
  media,
  selectedMediaId,
  projectName,
  currentTime,
  duration,
  isPlaying,
  history,
  future,
  timelineClips,
  mediaMap,
} = storeToRefs(store)

const previewRef = ref<InstanceType<typeof PreviewPlayer> | null>(null)
const exportModalOpen = ref(false)
const isExporting = ref(false)

const videoRefA = ref<HTMLVideoElement | null>(null)
const videoRefB = ref<HTMLVideoElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const audioRefs = ref<Record<string, HTMLAudioElement>>({})

watch(
  previewRef,
  () => {
    if (!previewRef.value) return
    videoRefA.value = previewRef.value.videoRefA
    videoRefB.value = previewRef.value.videoRefB
    imageRef.value = previewRef.value.imageRef
    canvasRef.value = previewRef.value.canvasRef
    if (previewRef.value.audioRefA1) {
      audioRefs.value = { a1: previewRef.value.audioRefA1 }
    }
  },
  { immediate: true, flush: "post" },
)

const refsForPlayback: PlaybackRefs = {
  videoRefA,
  videoRefB,
  imageRef,
  audioRefs,
  canvasRef,
}

const playback = usePlayback(refsForPlayback, isExporting)
const {
  isExporting: ffmpegIsExporting,
  exportProgress,
  exportPhase,
  exportFrameLabel,
  downloadUrl,
  ffmpegError,
  loadFFmpeg,
  startExport,
  cancelExport,
} = useFfmpegExport(refsForPlayback, {
  syncMediaToTime: playback.syncMediaToTime,
  drawFrameToCanvas: playback.drawFrameToCanvas,
  waitForVideoReady: playback.waitForVideoReady,
})

watch(ffmpegIsExporting, (v) => {
  isExporting.value = v
})

const previewEmpty = computed(() => {
  return !timelineClips.value.some((clip) => {
    const item = mediaMap.value[clip.mediaId]
    return item?.type === "video" || item?.type === "image"
  })
})

async function handleSave() {
  const data = await serializeProject(
    media.value,
    store.timelineClips,
    store.tracks,
    projectName.value,
  )
  await saveProjectToFile(data)
}

async function handleLoad() {
  const raw = await loadProjectFromFile()
  if (!raw) return
  const data = deserializeProject(raw)
  store.loadProject(data)
}

function handleImport(file: File) {
  store.importFile(file)
}

function handleAddToTimeline(item: MediaItem) {
  const at = store.currentTime
  store.addClipToTimeline(item, at)
  // 视频/图片加入后立刻同步预览，显示首帧或图片
  if (item.type === "video" || item.type === "image") {
    playback.handleSeek(at)
  }
}

function handleExportOpen() {
  exportModalOpen.value = true
}

async function handleStartExport(resolution: "720p" | "1080p") {
  try {
    await loadFFmpeg()
    await startExport(resolution)
  } catch {
    /* error surfaced in modal */
  }
}
</script>

<template>
  <div class="editor-root">
    <EditorHeader
      :project-name="projectName"
      :can-undo="history.length > 0"
      :can-redo="future.length > 0"
      @save="handleSave"
      @load="handleLoad"
      @export="handleExportOpen"
      @undo="store.undo()"
      @redo="store.redo()"
    />

    <div class="editor-main">
      <ProjectLibrary
        class="editor-library"
        :media="media"
        :selected-id="selectedMediaId"
        @select="store.selectMedia($event)"
        @import="handleImport"
        @add-to-timeline="handleAddToTimeline"
        @remove="store.removeMedia($event)"
      />

      <div class="editor-center">
        <PreviewPlayer
          ref="previewRef"
          class="editor-preview"
          :current-time="currentTime"
          :duration="duration"
          :is-playing="isPlaying"
          :is-exporting="ffmpegIsExporting"
          :is-empty="previewEmpty"
          @toggle-play="store.togglePlay()"
          @seek="playback.handleSeek($event)"
        />
        <Timeline
          class="editor-timeline"
          :drag-start-handler="playback.handleDragStart"
          @seek="playback.handleSeek($event)"
        />
      </div>
    </div>

    <ExportModal
      :open="exportModalOpen"
      :is-exporting="ffmpegIsExporting"
      :export-progress="exportProgress"
      :export-phase="exportPhase"
      :export-frame-label="exportFrameLabel"
      :download-url="downloadUrl"
      :ffmpeg-error="ffmpegError"
      @close="exportModalOpen = false"
      @start="handleStartExport"
      @cancel="cancelExport"
    />
  </div>
</template>

<style scoped>
.editor-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  padding-inline: var(--page-pad);
  padding-bottom: 0.75rem;
}

.editor-main {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  overflow: hidden;
  background: rgba(12, 17, 24, 0.35);
  user-select: none;
  -webkit-user-select: none;
}

.editor-library {
  width: 100%;
  max-height: 9.5rem;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  overflow: auto;
}

.editor-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.editor-preview {
  flex: 1;
  min-height: 10rem;
}

.editor-timeline {
  height: 12rem;
  flex-shrink: 0;
}

@media (min-width: 900px) {
  .editor-main {
    flex-direction: row;
  }

  .editor-library {
    width: 16rem;
    max-height: none;
    height: 100%;
    border-bottom: none;
    border-right: 1px solid var(--border);
  }

  .editor-timeline {
    height: 14.5rem;
  }
}
</style>
