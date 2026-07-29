import { onMounted, onUnmounted, ref, watch, type Ref } from "vue"
import { storeToRefs } from "pinia"
import { PLAYBACK_CONSTANTS } from "@/editor/constants"
import type { TimelineClip, Track } from "@/editor/types"
import { useEditorStore } from "@/stores/editor"

export interface PlaybackRefs {
  videoRefA: Ref<HTMLVideoElement | null>
  videoRefB: Ref<HTMLVideoElement | null>
  imageRef: Ref<HTMLImageElement | null>
  audioRefs: Ref<Record<string, HTMLAudioElement>>
  canvasRef: Ref<HTMLCanvasElement | null>
}

export function usePlayback(refs: PlaybackRefs, isExporting: Ref<boolean>) {
  const store = useEditorStore()
  const { timelineClips, tracks, mediaMap, isPlaying, currentTime, duration } = storeToRefs(store)

  const currentTimeRef = ref(0)
  const requestRef = ref<number | null>(null)
  const lastTimeRef = ref<number | null>(null)
  const lastStateUpdateRef = ref(0)
  const STATE_UPDATE_INTERVAL = 1000 / 30

  watch(currentTime, (t) => {
    currentTimeRef.value = t
  })

  function getActiveVideoClip(time: number): TimelineClip | undefined {
    return tracks.value
      .filter((t) => t.type === "video")
      .reverse()
      .map((t) => timelineClips.value.find((c) => c.trackId === t.id && time >= c.start && time < c.start + c.duration))
      .find((c) => c !== undefined)
  }

  function syncMediaToTime(time: number, isExportingNow = false) {
    const playerA = refs.videoRefA.value
    const playerB = refs.videoRefB.value
    const imageEl = refs.imageRef.value
    if (!playerA || !playerB) return

    const activeClip = getActiveVideoClip(time)
    const activeTrack = tracks.value.find((t) => t.id === activeClip?.trackId)
    const trackVolume = activeTrack?.volume ?? 1
    const clipVolume = activeClip?.volume ?? 1
    const isMuted = activeTrack?.isMuted
    const effectiveVolume = isMuted ? 0 : trackVolume * clipVolume

    const setPlayerState = (player: HTMLVideoElement | null, clip: TimelineClip | undefined, opacity: number) => {
      if (player && clip) {
        const mediaItem = mediaMap.value[clip.mediaId]
        if (mediaItem?.type === "video") {
          if (player.src !== mediaItem.url) player.src = mediaItem.url
          const timeInClip = time - clip.start + clip.offset
          if (isExportingNow || Math.abs(player.currentTime - timeInClip) > 0.1) {
            player.currentTime = timeInClip
          }
          if (isExportingNow) player.pause()
          else if (isPlaying.value) player.play().catch(() => {})
          else player.pause()
          player.muted = effectiveVolume === 0
          player.volume = effectiveVolume
          player.style.opacity = String(opacity)
        } else {
          player.pause()
          player.style.opacity = "0"
        }
      } else if (player) {
        player.pause()
        player.style.opacity = String(opacity)
      }
    }

    if (imageEl) {
      if (activeClip) {
        const mediaItem = mediaMap.value[activeClip.mediaId]
        if (mediaItem?.type === "image") {
          if (imageEl.src !== mediaItem.url) imageEl.src = mediaItem.url
          imageEl.style.opacity = "1"
          playerA.style.opacity = "0"
          playerB.style.opacity = "0"
        } else {
          imageEl.style.opacity = "0"
          setPlayerState(playerA, activeClip, activeClip ? 1 : 0)
          playerB.style.opacity = "0"
        }
      } else {
        imageEl.style.opacity = "0"
        setPlayerState(playerA, undefined, 0)
        playerB.style.opacity = "0"
      }
    } else {
      setPlayerState(playerA, activeClip, activeClip ? 1 : 0)
      playerB.style.opacity = "0"
    }

    tracks.value
      .filter((t: Track) => t.type === "audio")
      .forEach((track) => {
        const audioEl = refs.audioRefs.value[track.id]
        if (!audioEl) return
        const activeAudioClip = timelineClips.value.find(
          (c) => c.trackId === track.id && time >= c.start && time < c.start + c.duration,
        )
        if (activeAudioClip) {
          const mediaItem = mediaMap.value[activeAudioClip.mediaId]
          if (mediaItem) {
            if (audioEl.src !== mediaItem.url) audioEl.src = mediaItem.url
            const timeInClip = time - activeAudioClip.start + activeAudioClip.offset
            if (isExportingNow || Math.abs(audioEl.currentTime - timeInClip) > 0.1) {
              audioEl.currentTime = timeInClip
            }
            if (isPlaying.value && !isExportingNow) audioEl.play().catch(() => {})
            else audioEl.pause()
            const clipVol = activeAudioClip.volume ?? 1
            audioEl.volume = track.isMuted ? 0 : (track.volume ?? 1) * clipVol
          }
        } else {
          audioEl.pause()
        }
      })
  }

  function drawFrameToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, width, height)

    const activeClip = getActiveVideoClip(time)

    const drawScaled = (source: CanvasImageSource, sw?: number, sh?: number) => {
      const vW = sw ?? ("videoWidth" in source ? (source as HTMLVideoElement).videoWidth : (source as HTMLImageElement).naturalWidth)
      const vH = sh ?? ("videoHeight" in source ? (source as HTMLVideoElement).videoHeight : (source as HTMLImageElement).naturalHeight)
      if (!vW || !vH) return
      const scale = Math.min(width / vW, height / vH)
      const dw = vW * scale
      const dh = vH * scale
      const dx = (width - dw) / 2
      const dy = (height - dh) / 2
      ctx.drawImage(source, dx, dy, dw, dh)
    }

    if (activeClip) {
      const mediaItem = mediaMap.value[activeClip.mediaId]
      if (mediaItem?.type === "image" && refs.imageRef.value?.complete) {
        drawScaled(refs.imageRef.value)
      } else {
        const opacityA = Number.parseFloat(refs.videoRefA.value?.style.opacity || "0")
        if (opacityA > 0 && refs.videoRefA.value) {
          ctx.globalAlpha = opacityA
          drawScaled(refs.videoRefA.value)
          ctx.globalAlpha = 1
        }
      }
    }
  }

  async function waitForVideoReady(video: HTMLVideoElement | null) {
    if (!video || !video.src || video.style.opacity === "0") return
    if (video.readyState < 1) {
      await new Promise<void>((resolve) => {
        const h = () => {
          video.removeEventListener("loadedmetadata", h)
          resolve()
        }
        video.addEventListener("loadedmetadata", h, { once: true })
        setTimeout(resolve, 2000)
      })
    }
    if (video.seeking) {
      await new Promise<void>((resolve) => {
        const h = () => {
          video.removeEventListener("seeked", h)
          resolve()
        }
        video.addEventListener("seeked", h, { once: true })
        setTimeout(resolve, 2000)
      })
    }
    if (video.readyState < 2) {
      await new Promise<void>((resolve) => {
        const h = () => {
          video.removeEventListener("canplay", h)
          resolve()
        }
        video.addEventListener("canplay", h, { once: true })
        setTimeout(resolve, 2000)
      })
    }
  }

  function handleDragStart() {
    if (isPlaying.value) store.setPlaying(false)
  }

  function handleSeek(time: number) {
    currentTimeRef.value = time
    store.setCurrentTime(time)
    syncMediaToTime(time, false)
  }

  function animate(now: number) {
    if (isExporting.value) return
    if (lastTimeRef.value !== null) {
      const deltaTime = (now - lastTimeRef.value) / 1000
      const nextTime = currentTimeRef.value + deltaTime

      if (nextTime >= duration.value) {
        store.setPlaying(false)
        currentTimeRef.value = 0
        store.setCurrentTime(0)
        lastTimeRef.value = now
        return
      }
      currentTimeRef.value = nextTime
      syncMediaToTime(currentTimeRef.value, false)

      const perfNow = performance.now()
      if (perfNow - lastStateUpdateRef.value >= STATE_UPDATE_INTERVAL) {
        store.setCurrentTime(currentTimeRef.value)
        lastStateUpdateRef.value = perfNow
      }
    }
    lastTimeRef.value = now
    if (isPlaying.value) {
      requestRef.value = requestAnimationFrame(animate)
    }
  }

  watch(isPlaying, (playing) => {
    if (playing && !isExporting.value) {
      currentTimeRef.value = currentTime.value
      lastStateUpdateRef.value = performance.now()
      requestRef.value = requestAnimationFrame(animate)
    } else {
      lastTimeRef.value = null
      if (requestRef.value) cancelAnimationFrame(requestRef.value)
    }
  })

  watch(currentTime, (t) => {
    if (!isPlaying.value && !isExporting.value) {
      currentTimeRef.value = t
      syncMediaToTime(t, false)
    }
  })

  watch([timelineClips, tracks], () => {
    if (!isPlaying.value) syncMediaToTime(currentTime.value, false)
  })

  onMounted(() => {
    syncMediaToTime(currentTime.value, false)
  })

  onUnmounted(() => {
    if (requestRef.value) cancelAnimationFrame(requestRef.value)
  })

  function stepFrame(direction: 1 | -1) {
    const step = direction * PLAYBACK_CONSTANTS.SEEK_STEP_SMALL
    handleSeek(Math.max(0, Math.min(duration.value, currentTime.value + step)))
  }

  return {
    syncMediaToTime,
    drawFrameToCanvas,
    waitForVideoReady,
    handleDragStart,
    handleSeek,
    stepFrame,
  }
}
