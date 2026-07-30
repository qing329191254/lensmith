import { ref } from "vue"
import { FFmpeg } from "@ffmpeg/ffmpeg"
import { toBlobURL } from "@ffmpeg/util"
import { storeToRefs } from "pinia"
import { FFMPEG_CONSTANTS } from "@/editor/constants"
import { audioBufferToWav } from "@/editor/utils/audio-processing"
import type { PlaybackRefs } from "@/composables/usePlayback"
import { useEditorStore } from "@/stores/editor"

export type ExportPhase = "idle" | "init" | "fetch" | "audio" | "video" | "encoding" | "complete"

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality: number): Uint8Array {
  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL("image/jpeg", quality)
  } catch {
    throw new Error(
      "无法导出画面（远程视频跨域限制）。请先把片段下载到本地再导入时间线后重试。",
    )
  }
  if (!dataUrl.startsWith("data:image")) {
    throw new Error(
      "无法导出画面（远程视频跨域限制）。请先把片段下载到本地再导入时间线后重试。",
    )
  }
  const b64 = dataUrl.split(",", 2)[1] || ""
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function seekVideo(video: HTMLVideoElement, time: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (!video.src) {
      resolve()
      return
    }

    let done = false
    const finish = () => {
      if (done) return
      done = true
      video.removeEventListener("seeked", onSeeked)
      video.removeEventListener("loadeddata", onLoaded)
      clearTimeout(timer)
      resolve()
    }
    const onSeeked = () => finish()
    const onLoaded = () => {
      if (video.readyState >= 2 && !video.seeking) finish()
    }
    const timer = window.setTimeout(finish, timeoutMs)

    video.addEventListener("seeked", onSeeked)
    video.addEventListener("loadeddata", onLoaded)

    const ensureSeek = () => {
      try {
        const t = Math.max(0, Math.min(time, Number.isFinite(video.duration) ? video.duration - 0.05 : time))
        if (Math.abs(video.currentTime - t) < 0.04 && video.readyState >= 2) {
          finish()
          return
        }
        video.currentTime = t
      } catch {
        finish()
      }
    }

    if (video.readyState < 1) {
      const onMeta = () => {
        video.removeEventListener("loadedmetadata", onMeta)
        ensureSeek()
      }
      video.addEventListener("loadedmetadata", onMeta)
      // In case metadata already arrived between check and listener
      if (video.readyState >= 1) {
        video.removeEventListener("loadedmetadata", onMeta)
        ensureSeek()
      }
    } else {
      ensureSeek()
    }
  })
}

export function useFfmpegExport(
  playbackRefs: PlaybackRefs,
  playback: {
    syncMediaToTime: (time: number, isExportingNow?: boolean) => void
    drawFrameToCanvas: (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => void
    waitForVideoReady: (video: HTMLVideoElement | null, timeoutMs?: number) => Promise<void>
  },
) {
  const store = useEditorStore()
  const { timelineClips, tracks, mediaMap, media } = storeToRefs(store)

  // Do NOT put FFmpeg in ref()/reactive() — Vue Proxy breaks private fields (#progressEventCallbacks).
  let ffmpeg: FFmpeg | null = null
  const ffmpegLoaded = ref(false)
  const ffmpegLoading = ref(false)
  const ffmpegError = ref<string | null>(null)

  const isExporting = ref(false)
  const exportProgress = ref(0)
  const exportPhase = ref<ExportPhase>("idle")
  const exportFrameLabel = ref("")
  const downloadUrl = ref<string | null>(null)
  const abortExport = ref(false)

  function timelineEndSeconds(): number {
    if (!timelineClips.value.length) return 0
    return Math.max(...timelineClips.value.map((c) => c.start + c.duration))
  }

  async function loadFFmpeg() {
    if (ffmpegLoaded.value || ffmpegLoading.value) return
    ffmpegLoading.value = true
    ffmpegError.value = null

    if (!ffmpeg) ffmpeg = new FFmpeg()
    const instance = ffmpeg

    const errors: string[] = []

    const tryLoad = async (coreSrc: string, wasmSrc: string) => {
      const coreURL = await toBlobURL(coreSrc, "text/javascript")
      const wasmURL = await toBlobURL(wasmSrc, "application/wasm")
      await instance.load({ coreURL, wasmURL })
      ffmpegLoaded.value = true
    }

    try {
      // 1) Bundled from node_modules (most reliable offline / CN)
      try {
        const [{ default: corePath }, { default: wasmPath }] = await Promise.all([
          import("@ffmpeg/core?url"),
          import("@ffmpeg/core/wasm?url"),
        ])
        await tryLoad(corePath, wasmPath)
        return
      } catch (e) {
        errors.push(`local-package: ${e instanceof Error ? e.message : String(e)}`)
      }

      // 2) Same-origin /public/ffmpeg (copied by postinstall)
      // 3) CDN esm mirrors (Vite needs esm, not umd)
      const bases = [
        `${window.location.origin}/ffmpeg`,
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm",
        "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm",
        "https://cdn.jsdmirror.com/npm/@ffmpeg/core@0.12.10/dist/esm",
      ]
      for (const base of bases) {
        try {
          await tryLoad(`${base}/ffmpeg-core.js`, `${base}/ffmpeg-core.wasm`)
          return
        } catch (e) {
          errors.push(`${base}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      throw new Error(errors.slice(0, 3).join(" · ") || "All FFmpeg sources failed")
    } catch (e) {
      ffmpeg = null
      ffmpegLoaded.value = false
      ffmpegError.value =
        e instanceof Error ? `FFmpeg 加载失败：${e.message}` : "FFmpeg 加载失败"
      throw e
    } finally {
      ffmpegLoading.value = false
    }
  }

  async function prefetchMediaForExport(): Promise<{
    restore: () => void
  }> {
    const originals = new Map<string, string>()
    const createdBlobs: string[] = []
    const ids = [...new Set(timelineClips.value.map((c) => c.mediaId))]

    exportPhase.value = "fetch"
    exportProgress.value = 3

    for (let i = 0; i < ids.length; i++) {
      if (abortExport.value) throw new Error("Export cancelled")
      const id = ids[i]
      const item = media.value.find((m) => m.id === id)
      if (!item?.url) continue
      // Already local
      if (item.url.startsWith("blob:") || item.url.startsWith("data:")) {
        exportProgress.value = 3 + Math.round(((i + 1) / ids.length) * 12)
        continue
      }

      exportFrameLabel.value = `${i + 1} / ${ids.length}`
      exportProgress.value = 3 + Math.round(((i + 1) / ids.length) * 12)

      try {
        const res = await fetch(item.url, { mode: "cors", credentials: "omit" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const localUrl = URL.createObjectURL(blob)
        createdBlobs.push(localUrl)
        originals.set(id, item.url)
        store.updateMedia(id, { url: localUrl })
      } catch {
        // Keep remote URL; canvas may fail later with a clearer error
      }
    }

    exportFrameLabel.value = ""

    return {
      restore: () => {
        for (const [id, url] of originals) store.updateMedia(id, { url })
        for (const u of createdBlobs) URL.revokeObjectURL(u)
      },
    }
  }

  async function startExport(resolution: "720p" | "1080p") {
    if (!ffmpeg || !ffmpegLoaded.value) {
      await loadFFmpeg()
    }
    const instance = ffmpeg
    if (!instance) throw new Error("FFmpeg not available")
    abortExport.value = false
    isExporting.value = true
    exportProgress.value = 0
    exportPhase.value = "init"
    exportFrameLabel.value = ""
    downloadUrl.value = null
    ffmpegError.value = null
    store.setPlaying(false)

    const exportStartTime = 0
    const exportEndTime = timelineEndSeconds()
    const exportDuration = exportEndTime - exportStartTime

    if (exportDuration <= 0) {
      ffmpegError.value = "时间线为空，请先添加片段再导出。"
      isExporting.value = false
      exportPhase.value = "idle"
      return
    }

    const width = resolution === "1080p" ? 1920 : 1280
    const height = resolution === "1080p" ? 1080 : 720
    let restoreMedia: (() => void) | null = null

    try {
      const pref = await prefetchMediaForExport()
      restoreMedia = pref.restore

      // Force preview players to pick up local blob URLs
      const playerA = playbackRefs.videoRefA.value
      const playerB = playbackRefs.videoRefB.value
      if (playerA) {
        playerA.removeAttribute("src")
        playerA.load()
      }
      if (playerB) {
        playerB.removeAttribute("src")
        playerB.load()
      }

      const fps = 24
      const dt = 1 / fps
      const totalVideoFrames = Math.max(1, Math.ceil(exportDuration * fps))

      exportPhase.value = "audio"
      exportProgress.value = 16
      const sampleRate = FFMPEG_CONSTANTS.AUDIO_SAMPLE_RATE
      const totalAudioFrames = Math.ceil(exportDuration * sampleRate)
      const OfflineCtx =
        window.OfflineAudioContext ||
        (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext

      let hasAudio = false
      if (OfflineCtx) {
        const offlineCtx = new OfflineCtx(2, totalAudioFrames, sampleRate)
        const audioBufferMap = new Map<string, AudioBuffer>()
        const uniqueMediaIds = new Set(
          timelineClips.value.filter((c) => c.trackId.startsWith("a")).map((c) => c.mediaId),
        )

        for (const mid of uniqueMediaIds) {
          if (abortExport.value) throw new Error("Export cancelled")
          const item = mediaMap.value[mid]
          if (item?.url) {
            try {
              const response = await fetch(item.url)
              const arrayBuffer = await response.arrayBuffer()
              const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer)
              audioBufferMap.set(mid, audioBuffer)
            } catch {
              /* skip */
            }
          }
        }

        timelineClips.value.forEach((clip) => {
          if (abortExport.value) return
          const track = tracks.value.find((t) => t.id === clip.trackId)
          if (track?.isMuted || track?.type !== "audio") return

          let startInDest = clip.start - exportStartTime
          let clipOffset = clip.offset
          let clipDuration = clip.duration

          if (startInDest < 0) {
            const diff = -startInDest
            if (diff >= clipDuration) return
            clipOffset += diff
            clipDuration -= diff
            startInDest = 0
          }
          if (startInDest + clipDuration > exportDuration) {
            clipDuration -= startInDest + clipDuration - exportDuration
          }
          if (clipDuration <= 0) return

          const buffer = audioBufferMap.get(clip.mediaId)
          if (buffer) {
            hasAudio = true
            const source = offlineCtx.createBufferSource()
            source.buffer = buffer
            const gainNode = offlineCtx.createGain()
            gainNode.gain.setValueAtTime((track.volume ?? 1) * (clip.volume ?? 1), startInDest)
            source.connect(gainNode)
            gainNode.connect(offlineCtx.destination)
            source.start(startInDest, clipOffset, clipDuration)
          }
        })

        if (hasAudio) {
          const renderedBuffer = await offlineCtx.startRendering()
          const wavData = audioBufferToWav(renderedBuffer)
          await instance.writeFile("audio.wav", new Uint8Array(wavData))
        }
      }

      exportProgress.value = 20
      exportPhase.value = "video"

      const canvas = playbackRefs.canvasRef.value
      if (!canvas) throw new Error("Canvas not available")
      canvas.width = width
      canvas.height = height
      const renderCtx = canvas.getContext("2d", { alpha: false, willReadFrequently: true })!
      renderCtx.imageSmoothingEnabled = true
      renderCtx.imageSmoothingQuality = "high"

      let exportTime = exportStartTime
      let frameCount = 0

      while (exportTime < exportEndTime && !abortExport.value) {
        exportFrameLabel.value = `${frameCount + 1} / ${totalVideoFrames}`
        exportProgress.value = Math.min(75, Math.round(20 + (frameCount / totalVideoFrames) * 55))

        playback.syncMediaToTime(exportTime, true)

        const video = playbackRefs.videoRefA.value
        if (video && video.style.opacity !== "0" && video.src) {
          const clip = timelineClips.value.find(
            (c) =>
              c.trackId.startsWith("v") &&
              exportTime >= c.start &&
              exportTime < c.start + c.duration,
          )
          const mediaItem = clip ? mediaMap.value[clip.mediaId] : null
          if (mediaItem?.type === "video") {
            const timeInClip = exportTime - (clip?.start || 0) + (clip?.offset || 0)
            await seekVideo(video, timeInClip, 800)
          }
        } else if (playbackRefs.imageRef.value?.style.opacity === "1") {
          await new Promise<void>((r) => setTimeout(r, 10))
        }

        playback.drawFrameToCanvas(renderCtx, width, height, exportTime)

        const jpegBytes = canvasToJpegBytes(canvas, FFMPEG_CONSTANTS.JPEG_QUALITY)
        await instance.writeFile(
          `frame${frameCount.toString().padStart(4, "0")}.jpg`,
          jpegBytes,
        )

        exportTime += dt
        frameCount++
        exportProgress.value = Math.min(75, Math.round(20 + (frameCount / totalVideoFrames) * 55))
        // Always yield so UI can update between frames
        await new Promise<void>((r) => setTimeout(r, 0))
      }

      if (abortExport.value) throw new Error("Export cancelled")
      if (frameCount === 0) throw new Error("No frames rendered")

      exportPhase.value = "encoding"
      exportFrameLabel.value = ""
      exportProgress.value = 78

      const onProgress = ({ progress }: { progress: number }) => {
        exportProgress.value = Math.min(97, 78 + Math.round(Math.max(0, progress) * 19))
      }
      try {
        instance.on("progress", onProgress)
      } catch {
        /* ignore — progress is optional */
      }

      const encodeArgs = ["-framerate", String(fps), "-i", "frame%04d.jpg"]

      if (hasAudio) {
        encodeArgs.push("-i", "audio.wav", "-c:a", "aac", "-shortest")
      } else {
        encodeArgs.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest")
      }

      encodeArgs.push(
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        String(FFMPEG_CONSTANTS.EXPORT_CRF),
        "-movflags",
        "+faststart",
        "output.mp4",
      )

      await instance.exec(encodeArgs)
      try {
        instance.off("progress", onProgress)
      } catch {
        /* ignore */
      }

      exportPhase.value = "complete"
      exportProgress.value = 98

      const data = (await instance.readFile("output.mp4")) as Uint8Array
      const copy = new Uint8Array(data.byteLength)
      copy.set(data)
      downloadUrl.value = URL.createObjectURL(new Blob([copy], { type: "video/mp4" }))
      exportProgress.value = 100

      try {
        if (hasAudio) await instance.deleteFile("audio.wav")
      } catch { /* ignore */ }
      try {
        await instance.deleteFile("output.mp4")
      } catch { /* ignore */ }
      for (let i = 0; i < frameCount; i++) {
        try {
          await instance.deleteFile(`frame${i.toString().padStart(4, "0")}.jpg`)
        } catch { /* ignore */ }
      }
    } catch (err) {
      if ((err as Error).message !== "Export cancelled") {
        ffmpegError.value = (err as Error).message || "Export failed"
      }
      exportPhase.value = "idle"
      exportFrameLabel.value = ""
    } finally {
      restoreMedia?.()
      isExporting.value = false
      store.setCurrentTime(0)
      if (playbackRefs.videoRefA.value) {
        playbackRefs.videoRefA.value.style.opacity = "1"
        playbackRefs.videoRefA.value.muted = false
      }
      if (playbackRefs.videoRefB.value) playbackRefs.videoRefB.value.style.opacity = "0"
    }
  }

  function cancelExport() {
    abortExport.value = true
    isExporting.value = false
    exportPhase.value = "idle"
    exportFrameLabel.value = ""
  }

  return {
    ffmpegLoaded,
    ffmpegLoading,
    ffmpegError,
    isExporting,
    exportProgress,
    exportPhase,
    exportFrameLabel,
    downloadUrl,
    loadFFmpeg,
    startExport,
    cancelExport,
  }
}
