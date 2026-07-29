import { onMounted, onUnmounted, ref } from "vue"
import type { TimelineClip } from "@/editor/types"

type DragMode = "none" | "move" | "trim-start" | "trim-end"

interface DragState {
  mode: DragMode
  clipIds: string[]
  startX: number
  initialStates: Record<string, { start: number; duration: number; offset: number }>
  minStartDelta: number
  maxStartDelta: number
  snapLocked: boolean
  snapPosition: number | null
  snapBreakThreshold: number
}

export interface UseTimelineDragOptions {
  clips: () => TimelineClip[]
  selectedClipIds: () => string[]
  zoomLevel: () => number
  snapEnabled: () => boolean
  getSnapTime: (time: number, ignoreClipIds: string[]) => number | null
  onClipUpdate: (clipId: string, changes: Partial<TimelineClip>, recordHistory?: boolean) => void
  onSelectClips: (clipIds: string[]) => void
  onDragStart: () => void
  onDragEndCommit: () => void
}

export function useTimelineDrag(options: UseTimelineDragOptions) {
  const dragState = ref<DragState>({
    mode: "none",
    clipIds: [],
    startX: 0,
    initialStates: {},
    minStartDelta: Number.NEGATIVE_INFINITY,
    maxStartDelta: Number.POSITIVE_INFINITY,
    snapLocked: false,
    snapPosition: null,
    snapBreakThreshold: 20,
  })
  const snapIndicator = ref<number | null>(null)

  function handleMouseDownClip(e: MouseEvent, clip: TimelineClip, mode: DragMode) {
    e.stopPropagation()
    e.preventDefault()
    if (clip.isLocked) return

    const clips = options.clips()
    const selectedClipIds = options.selectedClipIds()
    const isMultiSelect = e.ctrlKey || e.metaKey
    const isAlreadySelected = selectedClipIds.includes(clip.id)

    if (isMultiSelect) {
      if (isAlreadySelected) {
        options.onSelectClips(selectedClipIds.filter((id) => id !== clip.id))
      } else {
        options.onSelectClips([...selectedClipIds, clip.id])
      }
    } else if (!isAlreadySelected) {
      options.onSelectClips([clip.id])
    }

    if (e.button === 2) return

    options.onDragStart()

    const activeClipIds =
      isAlreadySelected || !isMultiSelect
        ? selectedClipIds.includes(clip.id)
          ? selectedClipIds
          : [clip.id]
        : [clip.id]

    const initialStates: Record<string, { start: number; duration: number; offset: number }> = {}
    let globalMinStartDelta = Number.NEGATIVE_INFINITY

    activeClipIds.forEach((id) => {
      const c = clips.find((x) => x.id === id)
      if (c) {
        initialStates[id] = { start: c.start, duration: c.duration, offset: c.offset }
        const minDelta = -c.start
        if (minDelta > globalMinStartDelta) globalMinStartDelta = minDelta
      }
    })

    dragState.value = {
      mode,
      clipIds: activeClipIds,
      startX: e.clientX,
      initialStates,
      minStartDelta: globalMinStartDelta,
      maxStartDelta: Number.POSITIVE_INFINITY,
      snapLocked: false,
      snapPosition: null,
      snapBreakThreshold: 20,
    }
  }

  function handleDragMove(e: MouseEvent) {
    const ds = dragState.value
    const zoom = options.zoomLevel()
    if (ds.mode === "none" || ds.clipIds.length === 0) return

    const deltaX = e.clientX - ds.startX
    const deltaSeconds = deltaX / zoom
    let snappedTime: number | null = null

    if (ds.mode === "move") {
      let proposedDelta = Math.max(ds.minStartDelta, deltaSeconds)
      const leadClipId = ds.clipIds[0]
      const leadState = ds.initialStates[leadClipId]
      const leadNewStart = leadState.start + proposedDelta

      if (options.snapEnabled() && !ds.snapLocked) {
        const snapLeft = options.getSnapTime(leadNewStart, ds.clipIds)
        if (snapLeft !== null) {
          const snapDelta = snapLeft - leadState.start
          if (snapDelta >= ds.minStartDelta) {
            proposedDelta = snapDelta
            snappedTime = snapLeft
            dragState.value = { ...ds, snapPosition: snapLeft }
          }
        } else {
          const leadNewEnd = leadNewStart + leadState.duration
          const snapRight = options.getSnapTime(leadNewEnd, ds.clipIds)
          if (snapRight !== null) {
            const snapDelta = snapRight - leadState.duration - leadState.start
            if (snapDelta >= ds.minStartDelta) {
              proposedDelta = snapDelta
              snappedTime = snapRight
              dragState.value = { ...ds, snapPosition: snapRight }
            }
          }
        }
      } else if (ds.snapPosition !== null) {
        const currentPosition = leadState.start + deltaSeconds
        const distanceFromSnap = Math.abs(currentPosition - ds.snapPosition) * zoom
        if (distanceFromSnap > ds.snapBreakThreshold) {
          dragState.value = { ...ds, snapLocked: true }
        } else {
          proposedDelta = ds.snapPosition - leadState.start
          snappedTime = ds.snapPosition
        }
      }

      ds.clipIds.forEach((id) => {
        const state = ds.initialStates[id]
        options.onClipUpdate(id, { start: Math.max(0, state.start + proposedDelta) })
      })
    } else if (ds.mode === "trim-start") {
      const id = ds.clipIds[0]
      const state = ds.initialStates[id]
      const maxDelta = state.duration - 0.5
      let validDelta = Math.min(deltaSeconds, maxDelta)
      let newStart = state.start + validDelta
      const minAllowedStart = state.start + ds.minStartDelta
      if (newStart < minAllowedStart) {
        newStart = minAllowedStart
        validDelta = newStart - state.start
      }
      if (options.snapEnabled()) {
        const snap = options.getSnapTime(newStart, [id])
        if (snap !== null) {
          const snapDelta = snap - state.start
          if (snap >= minAllowedStart && state.duration - snapDelta >= 0.5) {
            newStart = snap
            validDelta = snapDelta
            snappedTime = snap
          }
        }
      }
      newStart = Math.max(0, newStart)
      options.onClipUpdate(id, {
        start: newStart,
        duration: state.duration - validDelta,
        offset: state.offset + validDelta,
      })
    } else if (ds.mode === "trim-end") {
      const id = ds.clipIds[0]
      const state = ds.initialStates[id]
      let newDuration = state.duration + deltaSeconds
      if (options.snapEnabled()) {
        const endPos = state.start + newDuration
        const snap = options.getSnapTime(endPos, [id])
        if (snap !== null && snap - state.start >= 0.5) {
          newDuration = snap - state.start
          snappedTime = snap
        }
      }
      if (newDuration >= 0.5) options.onClipUpdate(id, { duration: newDuration })
    }

    snapIndicator.value = snappedTime
  }

  function handleDragEnd() {
    if (dragState.value.mode !== "none") {
      options.onDragEndCommit()
    }
    dragState.value = {
      mode: "none",
      clipIds: [],
      startX: 0,
      initialStates: {},
      minStartDelta: 0,
      maxStartDelta: 0,
      snapLocked: false,
      snapPosition: null,
      snapBreakThreshold: 20,
    }
    snapIndicator.value = null
  }

  onMounted(() => {
    window.addEventListener("mousemove", handleDragMove)
    window.addEventListener("mouseup", handleDragEnd)
  })

  onUnmounted(() => {
    window.removeEventListener("mousemove", handleDragMove)
    window.removeEventListener("mouseup", handleDragEnd)
  })

  return {
    dragState,
    snapIndicator,
    handleMouseDownClip,
  }
}
