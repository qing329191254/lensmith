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

type VideoSlot = "A" | "B"

export function usePlayback(refs: PlaybackRefs, isExporting: Ref<boolean>) {
  const store = useEditorStore()
  const { timelineClips, tracks, mediaMap, isPlaying, currentTime, duration } = storeToRefs(store)

  const currentTimeRef = ref(0)
  const requestRef = ref<number | null>(null)
  const lastTimeRef = ref<number | null>(null)
  const lastStateUpdateRef = ref(0)
  const STATE_UPDATE_INTERVAL = 1000 / 30

  /** 当前负责显示的 video 槽位；另一槽预加载下一镜 */
  const activeSlot = ref<VideoSlot>("A")
  /** 各槽当前绑定的 timeline clip id */
  const clipOnSlot = ref<Record<VideoSlot, string | null>>({ A: null, B: null })

  watch(currentTime, (t) => {
    currentTimeRef.value = t
  })

  function otherSlot(slot: VideoSlot): VideoSlot {
    return slot === "A" ? "B" : "A"
  }

  function playerOf(slot: VideoSlot): HTMLVideoElement | null {
    return slot === "A" ? refs.videoRefA.value : refs.videoRefB.value
  }

  function getActiveVideoClip(time: number): TimelineClip | undefined {
    return tracks.value
      .filter((t) => t.type === "video")
      .reverse()
      .map((t) =>
        timelineClips.value.find((c) => c.trackId === t.id && time >= c.start && time < c.start + c.duration),
      )
      .find((c) => c !== undefined)
  }

  function isVideoMediaClip(clip: TimelineClip): boolean {
    return mediaMap.value[clip.mediaId]?.type === "video"
  }

  /** 时间轴上按 start 排序的视频素材片段 */
  function getOrderedVideoClips(): TimelineClip[] {
    return timelineClips.value
      .filter((c) => {
        const track = tracks.value.find((t) => t.id === c.trackId)
        return track?.type === "video" && isVideoMediaClip(c)
      })
      .slice()
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  }

  /** 预加载目标：当前视频镜之后的下一段视频（跳过中间的图片镜） */
  function getNextVideoClip(time: number, active: TimelineClip | undefined): TimelineClip | undefined {
    const clips = getOrderedVideoClips()
    if (active && isVideoMediaClip(active)) {
      const activeEnd = active.start + active.duration
      return clips.find((c) => c.id !== active.id && c.start >= activeEnd - 0.001)
    }
    return clips.find((c) => c.start > time)
  }

  function hidePlayer(player: HTMLVideoElement | null) {
    if (!player) return
    player.pause()
    player.style.opacity = "0"
  }

  const pendingReady = new WeakMap<HTMLVideoElement, number>()

  /**
   * 把某个 clip 准备到指定 video 元素上。
   * standby 预加载时 wantPlay=false、opacity=0，只 seek 到片头 offset。
   * 源未就绪时挂一次性回调，就绪后再 sync，保证能看到首帧。
   */
  function prepareClipOnPlayer(
    player: HTMLVideoElement,
    clip: TimelineClip,
    mediaTime: number,
    opts: {
      wantPlay: boolean
      opacity: number
      volume: number
      muted: boolean
      forceSeek?: boolean
    },
  ): void {
    const mediaItem = mediaMap.value[clip.mediaId]
    if (!mediaItem || mediaItem.type !== "video") {
      hidePlayer(player)
      return
    }

    const targetTime = Math.max(0, mediaTime)
    const srcChanged = player.src !== mediaItem.url
    if (srcChanged) {
      player.src = mediaItem.url
      player.preload = "auto"
      player.load()
    }

    const applySeek = () => {
      if (player.readyState < HTMLMediaElement.HAVE_METADATA || player.seeking) return
      if (srcChanged || opts.forceSeek || Math.abs(player.currentTime - targetTime) > 0.1) {
        // 部分浏览器对 exact 0 不解码首帧，略微偏移
        player.currentTime = targetTime === 0 ? 0.001 : targetTime
      }
    }

    if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
      applySeek()
    } else if (opts.opacity > 0 || opts.forceSeek) {
      const token = (pendingReady.get(player) ?? 0) + 1
      pendingReady.set(player, token)
      const onReady = () => {
        if (pendingReady.get(player) !== token) return
        pendingReady.delete(player)
        if (isExporting.value) return
        syncMediaToTime(currentTimeRef.value, false)
      }
      player.addEventListener("loadedmetadata", onReady, { once: true })
      player.addEventListener("error", onReady, { once: true })
    }

    player.muted = opts.muted
    player.volume = opts.volume
    player.style.opacity = String(opts.opacity)

    if (opts.wantPlay) {
      if (player.paused && player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        player.play().then(() => {
          if (!isPlaying.value) player.pause()
        }).catch(() => {})
      }
    } else {
      player.pause()
    }
  }

  function showImage(imageEl: HTMLImageElement, url: string) {
    if (imageEl.src !== url) {
      imageEl.onload = () => {
        imageEl.style.opacity = "1"
      }
      imageEl.src = url
      if (imageEl.complete && imageEl.naturalWidth > 0) {
        imageEl.style.opacity = "1"
      }
    } else {
      imageEl.style.opacity = "1"
    }
  }

  function syncAudio(time: number, isExportingNow: boolean) {
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
            if (
              audioEl.readyState >= HTMLMediaElement.HAVE_METADATA &&
              !audioEl.seeking &&
              (isExportingNow || Math.abs(audioEl.currentTime - timeInClip) > 0.1)
            ) {
              audioEl.currentTime = timeInClip
            }
            if (isPlaying.value && !isExportingNow) {
              if (audioEl.paused) audioEl.play().catch(() => {})
            } else {
              audioEl.pause()
            }
            const clipVol = activeAudioClip.volume ?? 1
            audioEl.volume = track.isMuted ? 0 : (track.volume ?? 1) * clipVol
          }
        } else {
          audioEl.pause()
        }
      })
  }

  function syncMediaToTime(time: number, isExportingNow = false) {
    const playerA = refs.videoRefA.value
    const playerB = refs.videoRefB.value
    const imageEl = refs.imageRef.value
    if (!playerA || !playerB) return

    const activeClip = getActiveVideoClip(time)
    const activeMedia = activeClip ? mediaMap.value[activeClip.mediaId] : undefined

    // 导出逐帧：固定用 A，不做交替预加载，逻辑更稳
    if (isExportingNow) {
      activeSlot.value = "A"
      clipOnSlot.value = { A: activeClip?.id ?? null, B: null }
      hidePlayer(playerB)
      if (imageEl) imageEl.style.opacity = "0"
      if (activeClip && activeMedia?.type === "video") {
        const mediaTime = time - activeClip.start + activeClip.offset
        prepareClipOnPlayer(playerA, activeClip, mediaTime, {
          wantPlay: false,
          opacity: 1,
          volume: 0,
          muted: true,
          forceSeek: true,
        })
      } else if (activeClip && activeMedia?.type === "image" && imageEl) {
        hidePlayer(playerA)
        showImage(imageEl, activeMedia.url)
      } else {
        hidePlayer(playerA)
      }
      syncAudio(time, true)
      return
    }

    const activeTrack = tracks.value.find((t) => t.id === activeClip?.trackId)
    const trackVolume = activeTrack?.volume ?? 1
    const clipVolume = activeClip?.volume ?? 1
    const isMuted = Boolean(activeTrack?.isMuted)
    const effectiveVolume = isMuted ? 0 : trackVolume * clipVolume
    const wantPlay = isPlaying.value

    // —— 图片镜头：隐藏两个 video，仍用待机槽预加载下一视频 —— //
    if (activeClip && activeMedia?.type === "image") {
      if (imageEl) showImage(imageEl, activeMedia.url)
      hidePlayer(playerA)
      hidePlayer(playerB)
      // 图片期间不占槽位绑定，避免误 swap
      const standbySlot = otherSlot(activeSlot.value)
      const nextClip = getNextVideoClip(time, activeClip)
      if (nextClip) {
        const standby = playerOf(standbySlot)
        if (standby) {
          prepareClipOnPlayer(standby, nextClip, nextClip.offset, {
            wantPlay: false,
            opacity: 0,
            volume: 0,
            muted: true,
            forceSeek: clipOnSlot.value[standbySlot] !== nextClip.id,
          })
          clipOnSlot.value = { ...clipOnSlot.value, [standbySlot]: nextClip.id }
        }
      }
      syncAudio(time, false)
      return
    }

    if (imageEl) imageEl.style.opacity = "0"

    // —— 无活动视频镜 —— //
    if (!activeClip || activeMedia?.type !== "video") {
      hidePlayer(playerA)
      hidePlayer(playerB)
      const nextClip = getNextVideoClip(time, undefined)
      const standbySlot = otherSlot(activeSlot.value)
      if (nextClip) {
        const standby = playerOf(standbySlot)
        if (standby) {
          prepareClipOnPlayer(standby, nextClip, nextClip.offset, {
            wantPlay: false,
            opacity: 0,
            volume: 0,
            muted: true,
            forceSeek: clipOnSlot.value[standbySlot] !== nextClip.id,
          })
          clipOnSlot.value = { ...clipOnSlot.value, [standbySlot]: nextClip.id }
        }
      }
      syncAudio(time, false)
      return
    }

    // —— 视频镜：若待机槽已预加载好当前镜，则切换主槽 —— //
    let slot = activeSlot.value
    const standbySlot = otherSlot(slot)
    if (clipOnSlot.value[standbySlot] === activeClip.id && clipOnSlot.value[slot] !== activeClip.id) {
      hidePlayer(playerOf(slot))
      slot = standbySlot
      activeSlot.value = slot
    }

    const activePlayer = playerOf(slot)
    if (!activePlayer) return

    const mediaTime = time - activeClip.start + activeClip.offset
    const needBind = clipOnSlot.value[slot] !== activeClip.id
    prepareClipOnPlayer(activePlayer, activeClip, mediaTime, {
      wantPlay,
      opacity: 1,
      volume: effectiveVolume,
      muted: effectiveVolume === 0,
      forceSeek: needBind,
    })
    clipOnSlot.value = { ...clipOnSlot.value, [slot]: activeClip.id }

    // —— 待机槽预加载下一视频镜 —— //
    const nextClip = getNextVideoClip(time, activeClip)
    const nextSlot = otherSlot(slot)
    const standbyPlayer = playerOf(nextSlot)
    if (nextClip && standbyPlayer) {
      const already = clipOnSlot.value[nextSlot] === nextClip.id
      prepareClipOnPlayer(standbyPlayer, nextClip, nextClip.offset, {
        wantPlay: false,
        opacity: 0,
        volume: 0,
        muted: true,
        forceSeek: !already,
      })
      if (!already) {
        clipOnSlot.value = { ...clipOnSlot.value, [nextSlot]: nextClip.id }
      }
    } else if (standbyPlayer) {
      hidePlayer(standbyPlayer)
      if (clipOnSlot.value[nextSlot] !== null) {
        clipOnSlot.value = { ...clipOnSlot.value, [nextSlot]: null }
      }
    }

    syncAudio(time, false)
  }

  function visibleVideoPlayer(): HTMLVideoElement | null {
    const a = refs.videoRefA.value
    const b = refs.videoRefB.value
    if (a && Number.parseFloat(a.style.opacity || "0") > 0) return a
    if (b && Number.parseFloat(b.style.opacity || "0") > 0) return b
    return playerOf(activeSlot.value)
  }

  function drawFrameToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, width, height)

    const activeClip = getActiveVideoClip(time)

    const drawScaled = (source: CanvasImageSource) => {
      const vW =
        "videoWidth" in source
          ? (source as HTMLVideoElement).videoWidth
          : (source as HTMLImageElement).naturalWidth
      const vH =
        "videoHeight" in source
          ? (source as HTMLVideoElement).videoHeight
          : (source as HTMLImageElement).naturalHeight
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
        const video = visibleVideoPlayer()
        if (video && Number.parseFloat(video.style.opacity || "0") > 0) {
          drawScaled(video)
        }
      }
    }
  }

  async function waitForVideoReady(video: HTMLVideoElement | null, timeoutMs = 2000) {
    if (!video || !video.src || video.style.opacity === "0") return
    if (video.readyState < 1) {
      await new Promise<void>((resolve) => {
        const h = () => {
          video.removeEventListener("loadedmetadata", h)
          resolve()
        }
        video.addEventListener("loadedmetadata", h, { once: true })
        setTimeout(resolve, timeoutMs)
      })
    }
    if (video.seeking) {
      await new Promise<void>((resolve) => {
        const h = () => {
          video.removeEventListener("seeked", h)
          resolve()
        }
        video.addEventListener("seeked", h, { once: true })
        setTimeout(resolve, timeoutMs)
      })
    }
    if (video.readyState < 2) {
      await new Promise<void>((resolve) => {
        const h = () => {
          video.removeEventListener("canplay", h)
          resolve()
        }
        video.addEventListener("canplay", h, { once: true })
        setTimeout(resolve, timeoutMs)
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

  /** 当前显示中的视频尚未就绪时卡住时钟 */
  function shouldStallForVideo(time: number): boolean {
    const clip = getActiveVideoClip(time)
    if (!clip) return false
    if (mediaMap.value[clip.mediaId]?.type !== "video") return false
    const player = visibleVideoPlayer()
    if (!player) return true
    if (player.seeking) return true
    if (player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return true
    return false
  }

  function animate(now: number) {
    if (isExporting.value) return

    if (isPlaying.value && shouldStallForVideo(currentTimeRef.value)) {
      syncMediaToTime(currentTimeRef.value, false)
      lastTimeRef.value = now
      requestRef.value = requestAnimationFrame(animate)
      return
    }

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
      syncMediaToTime(currentTime.value, false)
      requestRef.value = requestAnimationFrame(animate)
    } else {
      lastTimeRef.value = null
      if (requestRef.value) {
        cancelAnimationFrame(requestRef.value)
        requestRef.value = null
      }
      syncMediaToTime(currentTime.value, false)
      refs.videoRefA.value?.pause()
      refs.videoRefB.value?.pause()
      Object.values(refs.audioRefs.value).forEach((el) => el.pause())
    }
  })

  watch(currentTime, (t) => {
    if (!isPlaying.value && !isExporting.value) {
      currentTimeRef.value = t
      syncMediaToTime(t, false)
    }
  })

  watch(
    [timelineClips, tracks],
    () => {
      // 时间线结构变了，清掉槽位绑定，避免预加载指向已删片段
      clipOnSlot.value = { A: null, B: null }
      if (!isPlaying.value) syncMediaToTime(currentTime.value, false)
    },
    { deep: true },
  )

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
