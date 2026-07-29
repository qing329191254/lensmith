import { ref } from "vue"
import { FFmpeg } from "@ffmpeg/ffmpeg"
import { toBlobURL } from "@ffmpeg/util"
import { storeToRefs } from "pinia"
import { FFMPEG_CONSTANTS } from "@/editor/constants"
import { audioBufferToWav } from "@/editor/utils/audio-processing"
import type { PlaybackRefs } from "@/composables/usePlayback"
import { useEditorStore } from "@/stores/editor"

export type ExportPhase = "idle" | "init" | "audio" | "video" | "encoding" | "complete"

export function useFfmpegExport(
  playbackRefs: PlaybackRefs,
  playback: {
    syncMediaToTime: (time: number, isExportingNow?: boolean) => void
    drawFrameToCanvas: (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => void
    waitForVideoReady: (video: HTMLVideoElement | null) => Promise<void>
  },
) {
  const store = useEditorStore()
  const { timelineClips, tracks, mediaMap, contentDuration } = storeToRefs(store)

  const ffmpegRef = ref<FFmpeg | null>(null)
  const ffmpegLoaded = ref(false)
  const ffmpegLoading = ref(false)
  const ffmpegError = ref<string | null>(null)

  const isExporting = ref(false)
  const exportProgress = ref(0)
  const exportPhase = ref<ExportPhase>("idle")
  const downloadUrl = ref<string | null>(null)
  const abortExport = ref(false)

  async function loadFFmpeg() {
    if (ffmpegLoaded.value || ffmpegLoading.value) return
    ffmpegLoading.value = true
    ffmpegError.value = null

    if (!ffmpegRef.value) ffmpegRef.value = new FFmpeg()
    const ffmpeg = ffmpegRef.value

    try {
      const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd"
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      })
      ffmpegLoaded.value = true
    } catch (e) {
      ffmpegError.value = e instanceof Error ? e.message : "FFmpeg load failed"
      throw e
    } finally {
      ffmpegLoading.value = false
    }
  }

  async function startExport(resolution: "720p" | "1080p") {
    if (!ffmpegRef.value) {
      await loadFFmpeg()
    }
    const ffmpeg = ffmpegRef.value!
    abortExport.value = false
    isExporting.value = true
    exportProgress.value = 0
    exportPhase.value = "init"
    downloadUrl.value = null
    store.setPlaying(false)

    const exportStartTime = 0
    const exportEndTime = contentDuration.value
    const exportDuration = exportEndTime - exportStartTime

    if (exportDuration <= 0) {
      isExporting.value = false
      exportPhase.value = "idle"
      return
    }

    const width = resolution === "1080p" ? 1920 : 1280
    const height = resolution === "1080p" ? 1080 : 720

    try {
      const fps = 30
      const dt = 1 / fps

      exportPhase.value = "audio"
      const sampleRate = FFMPEG_CONSTANTS.AUDIO_SAMPLE_RATE
      const totalFrames = Math.ceil(exportDuration * sampleRate)
      const OfflineCtx =
        window.OfflineAudioContext ||
        (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext

      let hasAudio = false
      if (OfflineCtx) {
        const offlineCtx = new OfflineCtx(2, totalFrames, sampleRate)
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
          await ffmpeg.writeFile("audio.wav", new Uint8Array(wavData))
        }
      }

      exportProgress.value = 10
      exportPhase.value = "video"

      const canvas = playbackRefs.canvasRef.value
      if (!canvas) throw new Error("Canvas not available")
      canvas.width = width
      canvas.height = height
      const renderCtx = canvas.getContext("2d", { alpha: false })!
      renderCtx.imageSmoothingEnabled = true
      renderCtx.imageSmoothingQuality = "high"

      let exportTime = exportStartTime
      let frameCount = 0

      while (exportTime < exportEndTime && !abortExport.value) {
        playback.syncMediaToTime(exportTime, true)
        await playback.waitForVideoReady(playbackRefs.videoRefA.value)
        if (playbackRefs.imageRef.value?.style.opacity === "1") {
          await new Promise<void>((r) => setTimeout(r, 50))
        }
        playback.drawFrameToCanvas(renderCtx, width, height, exportTime)

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
            "image/jpeg",
            FFMPEG_CONSTANTS.JPEG_QUALITY,
          )
        })

        const buffer = await blob.arrayBuffer()
        await ffmpeg.writeFile(`frame${frameCount.toString().padStart(4, "0")}.jpg`, new Uint8Array(buffer))

        exportProgress.value = 10 + ((exportTime - exportStartTime) / exportDuration) * 65
        exportTime += dt
        frameCount++
        await new Promise<void>((r) => setTimeout(r, 0))
      }

      if (frameCount === 0) throw new Error("No frames rendered")

      exportPhase.value = "encoding"
      exportProgress.value = 78

      ffmpeg.on("progress", ({ progress }) => {
        exportProgress.value = 78 + Math.round(progress * 20)
      })

      const encodeArgs = ["-framerate", "30", "-i", "frame%04d.jpg"]

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

      await ffmpeg.exec(encodeArgs)

      exportPhase.value = "complete"
      exportProgress.value = 98

      const data = (await ffmpeg.readFile("output.mp4")) as Uint8Array
      downloadUrl.value = URL.createObjectURL(new Blob([data], { type: "video/mp4" }))
      exportProgress.value = 100

      try {
        if (hasAudio) await ffmpeg.deleteFile("audio.wav")
      } catch { /* ignore */ }
      try {
        await ffmpeg.deleteFile("output.mp4")
      } catch { /* ignore */ }
      for (let i = 0; i < frameCount; i++) {
        try {
          await ffmpeg.deleteFile(`frame${i.toString().padStart(4, "0")}.jpg`)
        } catch { /* ignore */ }
      }
    } catch (err) {
      if ((err as Error).message !== "Export cancelled") {
        ffmpegError.value = (err as Error).message || "Export failed"
      }
      exportPhase.value = "idle"
    } finally {
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
  }

  return {
    ffmpegLoaded,
    ffmpegLoading,
    ffmpegError,
    isExporting,
    exportProgress,
    exportPhase,
    downloadUrl,
    loadFFmpeg,
    startExport,
    cancelExport,
  }
}
