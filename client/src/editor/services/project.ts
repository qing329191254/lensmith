import type { MediaItem, ProjectData, TimelineClip, Track } from "../types"

const PROJECT_VERSION = "1.0.0"

async function blobUrlToBase64(url: string): Promise<string | null> {
  if (!url.startsWith("blob:")) return url

  try {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function base64ToBlobUrl(base64: string): string {
  if (!base64.startsWith("data:")) return base64

  try {
    const [header, data] = base64.split(",")
    const mimeMatch = header.match(/data:([^;]+)/)
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream"

    const binary = atob(data)
    const array = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i)
    }

    const blob = new Blob([array], { type: mime })
    return URL.createObjectURL(blob)
  } catch {
    return base64
  }
}

export async function serializeProject(
  media: MediaItem[],
  timelineClips: TimelineClip[],
  tracks: Track[],
  projectName?: string,
): Promise<ProjectData> {
  const serializedMedia = await Promise.all(
    media.map(async (item) => ({
      ...item,
      url: (await blobUrlToBase64(item.url)) || item.url,
      thumbnailUrl: item.thumbnailUrl
        ? (await blobUrlToBase64(item.thumbnailUrl)) || item.thumbnailUrl
        : undefined,
    })),
  )

  return {
    version: PROJECT_VERSION,
    name: projectName || `Project ${new Date().toLocaleDateString()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    media: serializedMedia,
    timelineClips,
    tracks,
  }
}

export function deserializeProject(data: ProjectData): {
  media: MediaItem[]
  timelineClips: TimelineClip[]
  tracks: Track[]
  name: string
} {
  const deserializedMedia = data.media.map((item) => ({
    ...item,
    url: base64ToBlobUrl(item.url),
    thumbnailUrl: item.thumbnailUrl ? base64ToBlobUrl(item.thumbnailUrl) : undefined,
  }))

  return {
    media: deserializedMedia,
    timelineClips: data.timelineClips,
    tracks: data.tracks,
    name: data.name,
  }
}

export async function saveProjectToFile(projectData: ProjectData): Promise<void> {
  const json = JSON.stringify(projectData, null, 2)
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = `${projectData.name.replace(/[^a-z0-9]/gi, "_")}.seqproj`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function loadProjectFromFile(): Promise<ProjectData | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".seqproj,.json"

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) {
        resolve(null)
        return
      }

      try {
        const text = await file.text()
        const data = JSON.parse(text) as ProjectData
        if (!data.version || !data.media || !data.timelineClips) {
          throw new Error("Invalid project file")
        }
        resolve(data)
      } catch {
        resolve(null)
      }
    }

    input.oncancel = () => resolve(null)
    input.click()
  })
}
