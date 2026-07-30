import { defineStore } from "pinia"
import { computed, ref } from "vue"
import {
  INITIAL_TRACKS,
  MEDIA_CONSTANTS,
  TIMELINE_CONSTANTS,
} from "@/editor/constants"
import type { EditorSnapshot, MediaItem, TimelineClip, Track } from "@/editor/types"

const MAX_HISTORY = 50

function cloneClips(clips: TimelineClip[]): TimelineClip[] {
  return clips.map((c) => ({ ...c }))
}

function uid(): string {
  return Math.random().toString(36).slice(2, 11)
}

export const useEditorStore = defineStore("editor", () => {
  const media = ref<MediaItem[]>([])
  const timelineClips = ref<TimelineClip[]>([])
  const tracks = ref<Track[]>(INITIAL_TRACKS.map((t) => ({ ...t })))
  const currentTime = ref(0)
  const isPlaying = ref(false)
  const zoomLevel = ref(TIMELINE_CONSTANTS.DEFAULT_ZOOM)
  const selectedClipIds = ref<string[]>([])
  const selectedMediaId = ref<string | null>(null)
  const projectName = ref("Untitled Project")
  const snapEnabled = ref(true)

  const history = ref<EditorSnapshot[]>([])
  const future = ref<EditorSnapshot[]>([])

  const objectUrls = ref<string[]>([])

  const mediaMap = computed(() => {
    const map: Record<string, MediaItem> = {}
    for (const item of media.value) map[item.id] = item
    return map
  })

  const contentDuration = computed(() => {
    if (timelineClips.value.length === 0) return 30
    const maxEnd = Math.max(...timelineClips.value.map((c) => c.start + c.duration))
    return Math.max(maxEnd + 2, 10)
  })

  const duration = computed(() => contentDuration.value)

  function pushHistory() {
    history.value.push({ timelineClips: cloneClips(timelineClips.value) })
    if (history.value.length > MAX_HISTORY) history.value.shift()
    future.value = []
  }

  function undo() {
    const prev = history.value.pop()
    if (!prev) return
    future.value.push({ timelineClips: cloneClips(timelineClips.value) })
    timelineClips.value = cloneClips(prev.timelineClips)
    selectedClipIds.value = selectedClipIds.value.filter((id) =>
      timelineClips.value.some((c) => c.id === id),
    )
  }

  function redo() {
    const next = future.value.pop()
    if (!next) return
    history.value.push({ timelineClips: cloneClips(timelineClips.value) })
    timelineClips.value = cloneClips(next.timelineClips)
  }

  function addMedia(item: MediaItem) {
    media.value.push(item)
  }

  function updateMedia(id: string, updates: Partial<MediaItem>) {
    const idx = media.value.findIndex((m) => m.id === id)
    if (idx !== -1) media.value[idx] = { ...media.value[idx], ...updates }
  }

  function removeMedia(item: MediaItem) {
    media.value = media.value.filter((m) => m.id !== item.id)
    if (selectedMediaId.value === item.id) selectedMediaId.value = null
    timelineClips.value = timelineClips.value.filter((c) => c.mediaId !== item.id)
    if (item.url.startsWith("blob:")) {
      URL.revokeObjectURL(item.url)
      objectUrls.value = objectUrls.value.filter((u) => u !== item.url)
    }
  }

  function importFile(file: File) {
    const url = URL.createObjectURL(file)
    objectUrls.value.push(url)
    const newId = uid()
    const isAudio = file.type.startsWith("audio")
    const isImage = file.type.startsWith("image")

    const newMedia: MediaItem = {
      id: newId,
      url,
      prompt: file.name,
      duration: isImage ? MEDIA_CONSTANTS.DEFAULT_CLIP_DURATION : MEDIA_CONSTANTS.DEFAULT_CLIP_DURATION,
      aspectRatio: "16:9",
      status: "ready",
      type: isAudio ? "audio" : isImage ? "image" : "video",
    }

    if (isImage) {
      const img = new Image()
      img.onload = () => {
        const r = img.naturalWidth / img.naturalHeight
        const updates: Partial<MediaItem> = {
          resolution: { width: img.naturalWidth, height: img.naturalHeight },
        }
        if (Math.abs(r - 16 / 9) < 0.1) updates.aspectRatio = "16:9"
        else if (Math.abs(r - 9 / 16) < 0.1) updates.aspectRatio = "9:16"
        else if (Math.abs(r - 1) < 0.1) updates.aspectRatio = "1:1"
        else updates.aspectRatio = "custom"
        updateMedia(newId, updates)
      }
      img.src = url
      addMedia(newMedia)
      return
    }

    const el = isAudio ? document.createElement("audio") : document.createElement("video")
    el.crossOrigin = "anonymous"
    el.onloadedmetadata = () => {
      const updates: Partial<MediaItem> = { duration: el.duration }
      if (!isAudio) {
        const videoEl = el as HTMLVideoElement
        updates.resolution = { width: videoEl.videoWidth, height: videoEl.videoHeight }
        const r = videoEl.videoWidth / videoEl.videoHeight
        if (Math.abs(r - 16 / 9) < 0.1) updates.aspectRatio = "16:9"
        else if (Math.abs(r - 9 / 16) < 0.1) updates.aspectRatio = "9:16"
        else if (Math.abs(r - 1) < 0.1) updates.aspectRatio = "1:1"
        else updates.aspectRatio = "custom"
      }
      updateMedia(newId, updates)
    }
    el.src = url
    addMedia(newMedia)
  }

  function addClipToTimeline(item: MediaItem, atTime?: number) {
    const trackId = item.type === "audio" ? "a1" : "v1"
    const start = atTime ?? currentTime.value
    pushHistory()
    timelineClips.value.push({
      id: uid(),
      mediaId: item.id,
      trackId,
      start,
      duration: item.duration,
      offset: 0,
      volume: 1,
      speed: 1,
    })
  }

  /** Import remote URLs (e.g. storyboard videos) into the library and lay them out on V1. */
  function importRemoteSequence(
    items: Array<{
      url: string
      prompt?: string
      duration?: number
      thumbnailUrl?: string
      type?: "video" | "image"
    }>,
    options: { replaceTimeline?: boolean; projectName?: string } = {},
  ) {
    const sequence = items.filter((item) => Boolean(item.url))
    if (!sequence.length) return

    const replaceTimeline = options.replaceTimeline !== false
    pushHistory()
    if (replaceTimeline) timelineClips.value = []
    if (options.projectName) projectName.value = options.projectName

    let cursor = replaceTimeline
      ? 0
      : timelineClips.value.reduce((max, c) => Math.max(max, c.start + c.duration), 0)

    for (const [index, item] of sequence.entries()) {
      const existing = media.value.find((m) => m.url === item.url)
      const duration = item.duration && item.duration > 0 ? item.duration : MEDIA_CONSTANTS.DEFAULT_CLIP_DURATION
      let mediaItem = existing

      if (!mediaItem) {
        const id = uid()
        mediaItem = {
          id,
          url: item.url,
          prompt: item.prompt?.trim() || `Clip ${index + 1}`,
          duration,
          aspectRatio: "16:9",
          thumbnailUrl: item.thumbnailUrl,
          status: "ready",
          type: item.type || "video",
        }
        addMedia(mediaItem)

        if (mediaItem.type === "video") {
          const el = document.createElement("video")
          el.crossOrigin = "anonymous"
          el.preload = "metadata"
          const mediaId = id
          el.onloadedmetadata = () => {
            const updates: Partial<MediaItem> = {}
            if (el.videoWidth > 0 && el.videoHeight > 0) {
              updates.resolution = { width: el.videoWidth, height: el.videoHeight }
              const r = el.videoWidth / el.videoHeight
              if (Math.abs(r - 16 / 9) < 0.1) updates.aspectRatio = "16:9"
              else if (Math.abs(r - 9 / 16) < 0.1) updates.aspectRatio = "9:16"
              else if (Math.abs(r - 1) < 0.1) updates.aspectRatio = "1:1"
              else updates.aspectRatio = "custom"
            }
            if (Number.isFinite(el.duration) && el.duration > 0) {
              updates.duration = el.duration
              for (const clip of timelineClips.value) {
                if (clip.mediaId !== mediaId) continue
                const maxUsable = Math.max(0.5, el.duration - (clip.offset || 0))
                if (clip.duration > maxUsable) updateClip(clip.id, { duration: maxUsable })
              }
            }
            if (Object.keys(updates).length) updateMedia(mediaId, updates)
          }
          el.src = item.url
        }
      } else if (item.thumbnailUrl && !mediaItem.thumbnailUrl) {
        updateMedia(mediaItem.id, { thumbnailUrl: item.thumbnailUrl })
      }

      timelineClips.value.push({
        id: uid(),
        mediaId: mediaItem.id,
        trackId: "v1",
        start: cursor,
        duration: item.duration && item.duration > 0 ? item.duration : mediaItem.duration || duration,
        offset: 0,
        volume: 1,
        speed: 1,
      })
      cursor += item.duration && item.duration > 0 ? item.duration : mediaItem.duration || duration
    }

    currentTime.value = 0
    isPlaying.value = false
    selectedClipIds.value = []
  }

  function updateClip(clipId: string, changes: Partial<TimelineClip>, recordHistory = false) {
    if (recordHistory) pushHistory()
    const idx = timelineClips.value.findIndex((c) => c.id === clipId)
    if (idx !== -1) timelineClips.value[idx] = { ...timelineClips.value[idx], ...changes }
  }

  function deleteClips(clipIds: string[]) {
    if (clipIds.length === 0) return
    pushHistory()
    timelineClips.value = timelineClips.value.filter((c) => !clipIds.includes(c.id))
    selectedClipIds.value = selectedClipIds.value.filter((id) => !clipIds.includes(id))
  }

  /** Split selected clips (or the clip under the playhead) at currentTime. */
  function splitAtPlayhead() {
    const t = currentTime.value
    const targets =
      selectedClipIds.value.length > 0
        ? selectedClipIds.value
        : timelineClips.value
            .filter((c) => t > c.start + 0.15 && t < c.start + c.duration - 0.15)
            .map((c) => c.id)

    const toSplit = targets
      .map((id) => timelineClips.value.find((c) => c.id === id))
      .filter((c): c is TimelineClip => {
        if (!c || c.isLocked) return false
        const local = t - c.start
        return local > 0.15 && local < c.duration - 0.15
      })

    if (!toSplit.length) return

    pushHistory()
    const createdIds: string[] = []
    for (const clip of toSplit) {
      const leftDuration = t - clip.start
      const rightDuration = clip.duration - leftDuration
      updateClip(clip.id, { duration: leftDuration })
      const rightId = uid()
      timelineClips.value.push({
        id: rightId,
        mediaId: clip.mediaId,
        trackId: clip.trackId,
        start: t,
        duration: rightDuration,
        offset: clip.offset + leftDuration,
        volume: clip.volume,
        speed: clip.speed,
        isLocked: clip.isLocked,
      })
      createdIds.push(rightId)
    }
    selectedClipIds.value = createdIds.length ? [createdIds[0]] : selectedClipIds.value
  }

  function selectClips(ids: string[]) {
    selectedClipIds.value = ids
    if (ids.length > 0) selectedMediaId.value = null
  }

  function selectMedia(id: string | null) {
    selectedMediaId.value = id
    if (id) selectedClipIds.value = []
  }

  function setCurrentTime(time: number) {
    currentTime.value = Math.max(0, Math.min(time, duration.value))
  }

  function setPlaying(playing: boolean) {
    isPlaying.value = playing
  }

  function togglePlay() {
    isPlaying.value = !isPlaying.value
  }

  function setZoom(zoom: number) {
    zoomLevel.value = Math.max(TIMELINE_CONSTANTS.MIN_ZOOM, Math.min(TIMELINE_CONSTANTS.MAX_ZOOM, zoom))
  }

  function getSnapTime(time: number, ignoreClipIds: string[] = []): number | null {
    if (!snapEnabled.value) return null
    const snapPoints: number[] = [0, currentTime.value]
    for (const clip of timelineClips.value) {
      if (ignoreClipIds.includes(clip.id)) continue
      snapPoints.push(clip.start, clip.start + clip.duration)
    }
    const threshold = 15 / zoomLevel.value
    let closest = -1
    let minDist = Infinity
    for (const p of snapPoints) {
      const d = Math.abs(p - time)
      if (d < minDist) {
        minDist = d
        closest = p
      }
    }
    return minDist <= threshold ? closest : null
  }

  function loadProject(data: {
    media: MediaItem[]
    timelineClips: TimelineClip[]
    tracks: Track[]
    name: string
  }) {
    for (const item of media.value) {
      if (item.url.startsWith("blob:")) URL.revokeObjectURL(item.url)
    }
    media.value = data.media
    timelineClips.value = data.timelineClips
    tracks.value = data.tracks
    projectName.value = data.name
    selectedClipIds.value = []
    selectedMediaId.value = null
    currentTime.value = 0
    isPlaying.value = false
    history.value = []
    future.value = []
  }

  function resetProject() {
    for (const item of media.value) {
      if (item.url.startsWith("blob:")) URL.revokeObjectURL(item.url)
    }
    for (const url of objectUrls.value) URL.revokeObjectURL(url)
    media.value = []
    timelineClips.value = []
    tracks.value = INITIAL_TRACKS.map((t) => ({ ...t }))
    projectName.value = "Untitled Project"
    selectedClipIds.value = []
    selectedMediaId.value = null
    currentTime.value = 0
    isPlaying.value = false
    history.value = []
    future.value = []
    objectUrls.value = []
  }

  return {
    media,
    timelineClips,
    tracks,
    currentTime,
    isPlaying,
    zoomLevel,
    selectedClipIds,
    selectedMediaId,
    projectName,
    snapEnabled,
    history,
    future,
    mediaMap,
    contentDuration,
    duration,
    pushHistory,
    undo,
    redo,
    addMedia,
    updateMedia,
    removeMedia,
    importFile,
    addClipToTimeline,
    importRemoteSequence,
    updateClip,
    deleteClips,
    splitAtPlayhead,
    selectClips,
    selectMedia,
    setCurrentTime,
    setPlaying,
    togglePlay,
    setZoom,
    getSnapTime,
    loadProject,
    resetProject,
  }
})
