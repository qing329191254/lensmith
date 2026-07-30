import { pushCloudSettings } from "@/api/me"
import { useApiKeysStore } from "@/stores/apiKeys"
import { useModelPrefsStore } from "@/stores/modelPrefs"

/** Push workspace keys + model prefs to cloud when logged in. */
export function pushWorkspaceSettings() {
  if (!localStorage.getItem("lensmith-auth-token")) return
  const keys = useApiKeysStore()
  const prefs = useModelPrefsStore()
  void pushCloudSettings({
    textApiKey: keys.textApiKey,
    aiGatewayKey: keys.aiGatewayKey,
    falKey: keys.falKey,
    textModel: prefs.textModel,
    imageModel: prefs.imageModel,
    videoModel: prefs.videoModel,
    gatewayBaseUrl: prefs.gatewayBaseUrl,
  }).catch(() => {})
}
