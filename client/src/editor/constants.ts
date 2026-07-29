export const TIMELINE_CONSTANTS = {
  MIN_ZOOM: 5,
  MAX_ZOOM: 320,
  DEFAULT_ZOOM: 40,
  SNAP_THRESHOLD: 10,
  TRACK_HEIGHT: 72,
  AUDIO_TRACK_HEIGHT: 48,
  RULER_HEIGHT: 28,
  CLIP_MIN_WIDTH: 20,
} as const

export const PLAYBACK_CONSTANTS = {
  DEFAULT_FPS: 30,
  SEEK_STEP_SMALL: 1 / 30,
  SEEK_STEP_LARGE: 1,
} as const

export const EXPORT_CONSTANTS = {
  RESOLUTIONS: {
    "720p": { width: 1280, height: 720 },
    "1080p": { width: 1920, height: 1080 },
  },
  DEFAULT_BITRATE: 8000000,
  AUDIO_SAMPLE_RATE: 48000,
} as const

export const MEDIA_CONSTANTS = {
  DEFAULT_CLIP_DURATION: 5,
  MAX_CLIP_DURATION: 300,
  SUPPORTED_VIDEO_FORMATS: ["video/mp4", "video/webm", "video/quicktime"],
  SUPPORTED_IMAGE_FORMATS: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  SUPPORTED_AUDIO_FORMATS: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"],
} as const

export const INITIAL_TRACKS = [
  { id: "v1", name: "Video 1", type: "video" as const, volume: 1 },
  { id: "a1", name: "Audio 1", type: "audio" as const, volume: 1 },
] as const

export const FFMPEG_CONSTANTS = {
  AUDIO_SAMPLE_RATE: 44100,
  JPEG_QUALITY: 0.9,
  EXPORT_CRF: 23,
} as const

export const KEYBOARD_SHORTCUTS = {
  play: " ",
  undo: "z",
  redo: "y",
  delete: ["Delete", "Backspace"],
} as const
