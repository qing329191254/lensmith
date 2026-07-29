export interface MediaItem {
  id: string
  url: string
  prompt: string
  duration: number
  aspectRatio: string
  thumbnailUrl?: string
  status: "generating" | "ready" | "error" | "complete"
  type: "video" | "audio" | "image"
  resolution?: { width: number; height: number }
}

export interface TimelineClip {
  id: string
  mediaId: string
  trackId: string
  start: number
  duration: number
  offset: number
  volume?: number
  speed?: number
  isLocked?: boolean
}

export interface Track {
  id: string
  name: string
  type: "video" | "audio"
  volume?: number
  isMuted?: boolean
  isLocked?: boolean
}

export interface EditorSnapshot {
  timelineClips: TimelineClip[]
}

export interface ProjectData {
  version: string
  name: string
  createdAt: string
  updatedAt: string
  media: MediaItem[]
  timelineClips: TimelineClip[]
  tracks: Track[]
}
