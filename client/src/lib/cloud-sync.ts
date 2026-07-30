/** Pull cloud user data into local stores after login. */

import {
  fetchCloudAssets,
  fetchCloudSettings,
  fetchCloudUsage,
  pushCloudAssetsBatch,
  pushCloudSettings,
  pushCloudUsage,
  type CloudMediaAsset,
  type CloudUsageEvent,
} from "@/api/me"
import { useApiKeysStore } from "@/stores/apiKeys"
import { useAssetsStore, type AssetKind, type AssetSource, type MediaAsset } from "@/stores/assets"
import { useAuthStore } from "@/stores/auth"
import { useModelPrefsStore } from "@/stores/modelPrefs"
import { useUsageStore, type UsageEvent, type UsageRoute } from "@/stores/usage"

function hasAuthToken() {
  return Boolean(localStorage.getItem("lensmith-auth-token"))
}

export async function syncUserCloudData() {
  const auth = useAuthStore()
  if (!auth.isLoggedIn || !hasAuthToken()) return

  try {
    await Promise.all([syncUsage(), syncAssets(), syncSettings()])
  } catch (e) {
    console.warn("Cloud sync failed", e)
  }
}

async function syncUsage() {
  const usage = useUsageStore()
  const remote = await fetchCloudUsage()
  if (remote === null) return

  // Upload any local-only events first
  const remoteIds = new Set(remote.map((e) => e.id))
  const localOnly = usage.events
    .filter((e) => !remoteIds.has(e.id))
    .map(
      (e): CloudUsageEvent => ({
        id: e.id,
        ts: e.ts,
        route: e.route,
        durationMs: e.durationMs,
        ok: e.ok,
        status: e.status,
        tokens: e.tokens,
        promptTokens: e.promptTokens,
        completionTokens: e.completionTokens,
        cachedTokens: e.cachedTokens,
        estimated: e.estimated,
        model: e.model,
        sample: e.sample,
      }),
    )
  if (localOnly.length) await pushCloudUsage(localOnly)

  const merged = new Map<string, UsageEvent>()
  for (const e of usage.events) merged.set(e.id, e)
  for (const e of remote) {
    merged.set(e.id, {
      id: e.id,
      ts: e.ts,
      route: e.route as UsageRoute,
      durationMs: e.durationMs,
      ok: e.ok,
      status: e.status ?? undefined,
      tokens: e.tokens,
      promptTokens: e.promptTokens,
      completionTokens: e.completionTokens,
      cachedTokens: e.cachedTokens,
      estimated: e.estimated,
      model: e.model || undefined,
      sample: e.sample,
    })
  }
  usage.replaceAll([...merged.values()].sort((a, b) => b.ts - a.ts).slice(0, 800))
}

async function syncAssets() {
  const assets = useAssetsStore()
  const remote = await fetchCloudAssets()
  if (remote === null) return

  const remoteIds = new Set(remote.map((a) => a.id))
  const localOnly = assets.items
    .filter((a) => !remoteIds.has(a.id))
    .map(
      (a): CloudMediaAsset => ({
        id: a.id,
        kind: a.kind,
        url: a.url,
        thumbUrl: a.thumbUrl,
        prompt: a.prompt,
        source: a.source,
        model: a.model,
        createdAt: a.createdAt,
      }),
    )
  if (localOnly.length) await pushCloudAssetsBatch(localOnly)

  const merged = new Map<string, MediaAsset>()
  for (const a of assets.items) merged.set(a.id, a)
  for (const a of remote) {
    if (a.kind !== "image" && a.kind !== "video") continue
    merged.set(a.id, {
      id: a.id,
      kind: a.kind as AssetKind,
      url: a.url,
      thumbUrl: a.thumbUrl || undefined,
      prompt: a.prompt || undefined,
      source: (a.source as AssetSource) || "other",
      model: a.model || undefined,
      createdAt: a.createdAt,
    })
  }
  assets.replaceAll([...merged.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 120))
}

/** Prefer non-empty remote; never clobber a local secret with an empty cloud value. */
function mergeSecret(remote: string | undefined, local: string): string {
  const r = (remote || "").trim()
  if (r) return r
  return (local || "").trim()
}

async function syncSettings() {
  const keys = useApiKeysStore()
  const prefs = useModelPrefsStore()
  const remote = await fetchCloudSettings()
  if (remote === null) return

  const remoteEmpty =
    !remote.textApiKey &&
    !remote.aiGatewayKey &&
    !remote.falKey &&
    !remote.textModel &&
    !remote.imageModel &&
    !remote.videoModel &&
    !remote.gatewayBaseUrl

  if (remoteEmpty && (keys.hasAny || prefs.textModel)) {
    // First login: push local browser settings up
    await pushCloudSettings({
      textApiKey: keys.textApiKey,
      aiGatewayKey: keys.aiGatewayKey,
      falKey: keys.falKey,
      textModel: prefs.textModel,
      imageModel: prefs.imageModel,
      videoModel: prefs.videoModel,
      gatewayBaseUrl: prefs.gatewayBaseUrl,
    })
    return
  }

  const mergedKeys = {
    textApiKey: mergeSecret(remote.textApiKey, keys.textApiKey),
    aiGatewayKey: mergeSecret(remote.aiGatewayKey, keys.aiGatewayKey),
    falKey: mergeSecret(remote.falKey, keys.falKey),
  }
  keys.applyRemote(mergedKeys)

  if (remote.textModel || remote.imageModel || remote.videoModel || remote.gatewayBaseUrl) {
    prefs.applyRemote({
      textModel: remote.textModel,
      imageModel: remote.imageModel,
      videoModel: remote.videoModel,
      gatewayBaseUrl: remote.gatewayBaseUrl,
    })
  }

  // Heal cloud when decrypt/empty remote dropped secrets we still have locally
  const healed =
    (mergedKeys.aiGatewayKey && !remote.aiGatewayKey) ||
    (mergedKeys.falKey && !remote.falKey) ||
    (mergedKeys.textApiKey && !remote.textApiKey)
  if (healed) {
    await pushCloudSettings({
      ...mergedKeys,
      textModel: prefs.textModel,
      imageModel: prefs.imageModel,
      videoModel: prefs.videoModel,
      gatewayBaseUrl: prefs.gatewayBaseUrl,
    })
  }
}
