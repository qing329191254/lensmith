/** Logged-in user cloud sync: usage / media / workspace settings. */

function authHeaders(): Headers {
  const headers = new Headers({ "Content-Type": "application/json" })
  const token = localStorage.getItem("lensmith-auth-token") || ""
  if (token) headers.set("Authorization", `Bearer ${token}`)
  return headers
}

async function parseOk(res: Response) {
  if (res.status === 401 || res.status === 503) return null
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const detail = (data as { detail?: string }).detail
    throw new Error(typeof detail === "string" ? detail : res.statusText)
  }
  return res.json().catch(() => ({}))
}

export type CloudUsageEvent = {
  id: string
  ts: number
  route: string
  durationMs: number
  ok: boolean
  status?: number | null
  tokens: number
  promptTokens: number
  completionTokens: number
  cachedTokens: number
  estimated: boolean
  model?: string | null
  sample?: boolean
}

export type CloudMediaAsset = {
  id: string
  kind: string
  url: string
  thumbUrl?: string | null
  prompt?: string | null
  source: string
  model?: string | null
  createdAt: number
}

export type CloudSettings = {
  textApiKey: string
  aiGatewayKey: string
  falKey: string
  textModel: string
  imageModel: string
  videoModel: string
  gatewayBaseUrl: string
}

export async function fetchCloudUsage(): Promise<CloudUsageEvent[] | null> {
  const res = await fetch("/api/me/usage", { headers: authHeaders() })
  const data = await parseOk(res)
  return Array.isArray(data) ? (data as CloudUsageEvent[]) : data === null ? null : []
}

export async function pushCloudUsage(events: CloudUsageEvent[]): Promise<void> {
  if (!events.length) return
  const res = await fetch("/api/me/usage", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ events }),
  })
  await parseOk(res)
}

export async function clearCloudUsage(): Promise<void> {
  const res = await fetch("/api/me/usage", { method: "DELETE", headers: authHeaders() })
  await parseOk(res)
}

export async function fetchCloudAssets(): Promise<CloudMediaAsset[] | null> {
  const res = await fetch("/api/me/assets", { headers: authHeaders() })
  const data = await parseOk(res)
  return Array.isArray(data) ? (data as CloudMediaAsset[]) : data === null ? null : []
}

export async function pushCloudAsset(asset: CloudMediaAsset): Promise<void> {
  const res = await fetch("/api/me/assets", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(asset),
  })
  await parseOk(res)
}

export async function pushCloudAssetsBatch(assets: CloudMediaAsset[]): Promise<void> {
  if (!assets.length) return
  const res = await fetch("/api/me/assets/batch", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ assets }),
  })
  await parseOk(res)
}

export async function deleteCloudAsset(id: string): Promise<void> {
  const res = await fetch(`/api/me/assets/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  })
  await parseOk(res)
}

export async function clearCloudAssets(): Promise<void> {
  const res = await fetch("/api/me/assets", { method: "DELETE", headers: authHeaders() })
  await parseOk(res)
}

export async function fetchCloudSettings(): Promise<CloudSettings | null> {
  const res = await fetch("/api/me/settings", { headers: authHeaders() })
  const data = await parseOk(res)
  return data && typeof data === "object" ? (data as CloudSettings) : null
}

export async function pushCloudSettings(settings: CloudSettings): Promise<void> {
  const res = await fetch("/api/me/settings", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(settings),
  })
  await parseOk(res)
}
