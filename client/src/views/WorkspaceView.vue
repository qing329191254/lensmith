<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { RouterLink } from "vue-router"
import { useI18n } from "vue-i18n"
import { checkApiKey } from "@/api/seq"
import { formatUsd } from "@/lib/pricing"
import { useApiKeysStore } from "@/stores/apiKeys"
import {
  IMAGE_MODEL_OPTIONS,
  VIDEO_MODEL_OPTIONS,
  WORKSPACE_PRESETS,
  useModelPrefsStore,
  type ModelOption,
  type WorkspacePresetId,
} from "@/stores/modelPrefs"
import { useUsageStore } from "@/stores/usage"

type VisibleRole = "image" | "video"

const { t } = useI18n()
const keys = useApiKeysStore()
const prefs = useModelPrefsStore()
const usage = useUsageStore()

const aiGatewayKey = ref(keys.aiGatewayKey)
const falKey = ref(keys.falKey)
const showGateway = ref(false)
const showFal = ref(false)
const saved = ref(false)
const showAdvanced = ref(false)
const serverStatus = ref<{
  configured: boolean
  textConfigured?: boolean
  falConfigured?: boolean
} | null>(null)
const checking = ref(false)

const imageModel = ref(prefs.imageModel)
const videoModel = ref(prefs.videoModel)
const gatewayBaseUrl = ref(prefs.gatewayBaseUrl)
const editingCustom = ref({ image: false, video: false })

const today = computed(() => usage.summarize("1d"))

const selectedVideoOpt = computed(() => VIDEO_MODEL_OPTIONS.find((o) => o.id === videoModel.value))
const selectedImageOpt = computed(() => IMAGE_MODEL_OPTIONS.find((o) => o.id === imageModel.value))

const videoNeedsFal = computed(() => {
  const opt = selectedVideoOpt.value
  if (opt) return Boolean(opt.needsFal)
  const id = videoModel.value.trim()
  if (/^doubao-seedance|^jimeng-seedance/i.test(id)) return false
  return /^(veo|kling|wan|minimax|seedance-2|fal-ai\/|bytedance\/)/i.test(id)
})

const videoModelLabel = computed(() => selectedVideoOpt.value?.label || videoModel.value || "—")
const imageModelLabel = computed(() => selectedImageOpt.value?.label || imageModel.value || "—")

const activePreset = computed(() => {
  for (const id of Object.keys(WORKSPACE_PRESETS) as WorkspacePresetId[]) {
    const p = WORKSPACE_PRESETS[id].prefs
    if (
      prefs.textModel === p.textModel &&
      imageModel.value === p.imageModel &&
      videoModel.value === p.videoModel &&
      (gatewayBaseUrl.value.trim() || "") === (p.gatewayBaseUrl || "")
    ) {
      return id
    }
  }
  return null
})

function formatTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatMs(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`
  return `${n}ms`
}

function selectValue(current: string, options: ModelOption[], role: VisibleRole): string {
  if (editingCustom.value[role]) return "__custom__"
  return options.some((o) => o.id === current) ? current : "__custom__"
}

function onSelect(role: VisibleRole, value: string) {
  if (value === "__custom__") {
    editingCustom.value[role] = true
    return
  }
  editingCustom.value[role] = false
  if (role === "image") imageModel.value = value
  else videoModel.value = value
}

function optionLabel(opt: ModelOption) {
  const bits = [opt.label, opt.vendor]
  if (opt.recommended) bits.push(t("workspace.recommended"))
  if (opt.cnFriendly) bits.push(t("workspace.cnFriendly"))
  if (opt.role === "video") {
    bits.push(opt.needsFal ? t("workspace.videoPathFal") : t("workspace.videoPathGateway"))
  } else if (opt.note && !opt.recommended) {
    bits.push(opt.note)
  }
  return bits.join(" · ")
}

async function refreshStatus() {
  checking.value = true
  try {
    serverStatus.value = await checkApiKey()
  } catch {
    serverStatus.value = null
  } finally {
    checking.value = false
  }
}

function applyPreset(id: WorkspacePresetId) {
  prefs.applyPreset(id)
  imageModel.value = prefs.imageModel
  videoModel.value = prefs.videoModel
  gatewayBaseUrl.value = prefs.gatewayBaseUrl
  editingCustom.value = { image: false, video: false }
  showAdvanced.value = false
}

function saveAll() {
  keys.save({
    textApiKey: "",
    aiGatewayKey: aiGatewayKey.value,
    falKey: falKey.value,
  })
  prefs.save({
    textModel: prefs.textModel,
    imageModel: imageModel.value,
    videoModel: videoModel.value,
    gatewayBaseUrl: gatewayBaseUrl.value,
  })
  saved.value = true
  window.setTimeout(() => {
    saved.value = false
  }, 2000)
  void refreshStatus()
}

function resetModels() {
  applyPreset("jimeng")
  saveAll()
}

function clearKeys() {
  keys.clear()
  aiGatewayKey.value = ""
  falKey.value = ""
  void refreshStatus()
}

function hydrateFromStores() {
  aiGatewayKey.value = keys.aiGatewayKey
  falKey.value = keys.falKey
  imageModel.value = prefs.imageModel
  videoModel.value = prefs.videoModel
  gatewayBaseUrl.value = prefs.gatewayBaseUrl
}

// Keep form in sync when cloud sync / another tab updates the store
watch(
  () => [keys.aiGatewayKey, keys.falKey] as const,
  ([gateway, fal]) => {
    aiGatewayKey.value = gateway
    falKey.value = fal
  },
)

onMounted(() => {
  hydrateFromStores()
  if (!prefs.activePreset) showAdvanced.value = true
  void refreshStatus()
})
</script>

<template>
  <section class="page-container max-w-2xl py-10 sm:py-12">
    <div class="mb-8">
      <p class="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">{{ t("workspace.eyebrow") }}</p>
      <h1 class="display mt-3 text-3xl md:text-4xl">{{ t("workspace.title") }}</h1>
      <p class="mt-3 text-[var(--muted)] leading-relaxed">{{ t("workspace.subtitle") }}</p>
    </div>

    <div class="mb-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-sm">
      <div class="mb-2 flex items-center justify-between">
        <span class="font-medium">{{ t("workspace.statusTitle") }}</span>
        <button
          type="button"
          class="text-xs text-[var(--focus)] hover:underline disabled:opacity-50"
          :disabled="checking"
          @click="refreshStatus"
        >
          {{ checking ? t("workspace.checking") : t("workspace.refresh") }}
        </button>
      </div>
      <ul class="space-y-1 text-[var(--muted)]">
        <li>
          {{ t("workspace.sectionImage") }}:
          <span :class="serverStatus?.configured || keys.hasGateway ? 'text-emerald-400' : 'text-amber-300'">
            {{ serverStatus?.configured || keys.hasGateway ? t("workspace.ready") : t("workspace.missing") }}
          </span>
        </li>
        <li>
          {{ t("workspace.sectionVideo") }}:
          <span v-if="!videoNeedsFal" class="text-[var(--muted)]">
            {{ t("workspace.falNotNeededNow") }}
          </span>
          <span v-else :class="serverStatus?.falConfigured || keys.hasFal ? 'text-emerald-400' : 'text-amber-300'">
            {{ serverStatus?.falConfigured || keys.hasFal ? t("workspace.ready") : t("workspace.missing") }}
          </span>
        </li>
      </ul>
    </div>

    <form class="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6" @submit.prevent="saveAll">
      <div>
        <h2 class="text-base font-medium">{{ t("workspace.simpleTitle") }}</h2>
        <p class="mt-1 text-xs leading-relaxed text-[var(--muted)]">{{ t("workspace.simpleHint") }}</p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          class="rounded-xl border px-4 py-3 text-left transition"
          :class="
            activePreset === 'jimeng'
              ? 'border-[var(--accent)] bg-[var(--accent)]/10'
              : 'border-[var(--border)] hover:border-[var(--focus)]/50'
          "
          @click="applyPreset('jimeng')"
        >
          <p class="text-sm font-semibold">{{ t("workspace.presetJimeng") }}</p>
          <p class="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{{ t("workspace.presetJimengDesc") }}</p>
        </button>
        <button
          type="button"
          class="rounded-xl border px-4 py-3 text-left transition"
          :class="
            activePreset === 'recommended'
              ? 'border-[var(--accent)] bg-[var(--accent)]/10'
              : 'border-[var(--border)] hover:border-[var(--focus)]/50'
          "
          @click="applyPreset('recommended')"
        >
          <p class="text-sm font-semibold">{{ t("workspace.presetRecommended") }}</p>
          <p class="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{{ t("workspace.presetRecommendedDesc") }}</p>
        </button>
      </div>

      <p class="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">
        {{ t("workspace.currentModels", { image: imageModelLabel, video: videoModelLabel }) }}
        <span v-if="!activePreset" class="text-amber-200/90"> · {{ t("workspace.presetCustom") }}</span>
      </p>
      <p v-if="activePreset === 'jimeng'" class="text-[11px] leading-relaxed text-[var(--muted)]">
        {{ t("workspace.jimengHint") }}
      </p>

      <div class="space-y-1.5">
        <div class="space-y-0.5">
          <label class="block text-xs font-medium text-[var(--text)]/85" for="gateway-key">
            {{ activePreset === "jimeng" ? t("workspace.arkKeyLabel") : t("workspace.gatewayLabel") }}
          </label>
          <p class="text-[11px] leading-relaxed text-[var(--muted)]">
            {{ activePreset === "jimeng" ? t("workspace.arkKeyHint") : t("workspace.gatewayHintSimple") }}
          </p>
        </div>
        <div class="flex gap-2">
          <input
            id="gateway-key"
            v-model="aiGatewayKey"
            :type="showGateway ? 'text' : 'password'"
            autocomplete="off"
            spellcheck="false"
            class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 font-mono text-sm outline-none focus:border-[var(--focus)]"
            :placeholder="
              activePreset === 'jimeng' ? t('workspace.arkKeyPlaceholder') : t('workspace.gatewayPlaceholder')
            "
          />
          <button
            type="button"
            class="shrink-0 rounded-xl border border-[var(--border)] px-3 text-xs text-[var(--muted)] hover:text-[var(--text)]"
            @click="showGateway = !showGateway"
          >
            {{ showGateway ? t("workspace.hide") : t("workspace.show") }}
          </button>
        </div>
      </div>

      <div v-if="videoNeedsFal" class="space-y-1.5">
        <div class="space-y-0.5">
          <label class="block text-xs font-medium text-[var(--text)]/85" for="fal-key">
            {{ t("workspace.falLabel") }}
            <span class="ml-1 font-normal text-amber-300">{{ t("workspace.falRequiredBadge") }}</span>
          </label>
          <p class="text-[11px] leading-relaxed text-[var(--muted)]">{{ t("workspace.falHintRequired") }}</p>
        </div>
        <div class="flex gap-2">
          <input
            id="fal-key"
            v-model="falKey"
            :type="showFal ? 'text' : 'password'"
            autocomplete="off"
            spellcheck="false"
            class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 font-mono text-sm outline-none focus:border-[var(--focus)]"
            :placeholder="t('workspace.falPlaceholder')"
          />
          <button
            type="button"
            class="shrink-0 rounded-xl border border-[var(--border)] px-3 text-xs text-[var(--muted)] hover:text-[var(--text)]"
            @click="showFal = !showFal"
          >
            {{ showFal ? t("workspace.hide") : t("workspace.show") }}
          </button>
        </div>
      </div>
      <p v-else class="text-[11px] leading-relaxed text-[var(--muted)]">{{ t("workspace.falHiddenHint") }}</p>

      <details
        class="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40"
        :open="showAdvanced"
        @toggle="showAdvanced = ($event.target as HTMLDetailsElement).open"
      >
        <summary class="cursor-pointer select-none px-4 py-3 text-sm font-medium text-[var(--text)]/90">
          {{ t("workspace.advancedTitle") }}
        </summary>
        <div class="space-y-5 border-t border-[var(--border)] px-4 py-4">
          <p class="text-[11px] leading-relaxed text-[var(--muted)]">{{ t("workspace.advancedHint") }}</p>

          <div class="space-y-1.5">
            <label class="block text-xs font-medium text-[var(--text)]/85" for="image-model">
              {{ t("workspace.imageModel") }}
            </label>
            <select
              id="image-model"
              class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-4 text-sm outline-none focus:border-[var(--focus)]"
              :value="selectValue(imageModel, IMAGE_MODEL_OPTIONS, 'image')"
              @change="onSelect('image', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in IMAGE_MODEL_OPTIONS" :key="opt.id" :value="opt.id">
                {{ optionLabel(opt) }}
              </option>
              <option value="__custom__">{{ t("workspace.customModel") }}</option>
            </select>
            <input
              v-if="selectValue(imageModel, IMAGE_MODEL_OPTIONS, 'image') === '__custom__'"
              v-model="imageModel"
              type="text"
              class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm outline-none focus:border-[var(--focus)]"
              :placeholder="t('workspace.customModelPlaceholder')"
            />
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-medium text-[var(--text)]/85" for="video-model">
              {{ t("workspace.videoModel") }}
            </label>
            <select
              id="video-model"
              class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-4 text-sm outline-none focus:border-[var(--focus)]"
              :value="selectValue(videoModel, VIDEO_MODEL_OPTIONS, 'video')"
              @change="onSelect('video', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in VIDEO_MODEL_OPTIONS" :key="opt.id" :value="opt.id">
                {{ optionLabel(opt) }}
              </option>
              <option value="__custom__">{{ t("workspace.customModel") }}</option>
            </select>
            <input
              v-if="selectValue(videoModel, VIDEO_MODEL_OPTIONS, 'video') === '__custom__'"
              v-model="videoModel"
              type="text"
              class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm outline-none focus:border-[var(--focus)]"
              :placeholder="t('workspace.customModelPlaceholder')"
            />
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-medium text-[var(--text)]/85" for="proxy-base">
              {{ t("workspace.proxyBase") }}
            </label>
            <p class="text-[11px] leading-relaxed text-[var(--muted)]">{{ t("workspace.proxyBaseHint") }}</p>
            <input
              id="proxy-base"
              v-model="gatewayBaseUrl"
              type="url"
              autocomplete="off"
              spellcheck="false"
              class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 font-mono text-sm outline-none focus:border-[var(--focus)]"
              :placeholder="t('workspace.proxyBasePlaceholder')"
            />
          </div>
        </div>
      </details>

      <p class="text-xs leading-relaxed text-[var(--muted)]">{{ t("workspace.privacy") }}</p>

      <div class="flex flex-wrap gap-3 pt-1">
        <button
          type="submit"
          class="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[#1a120c] hover:bg-[var(--accent-strong)]"
        >
          {{ saved ? t("workspace.saved") : t("workspace.save") }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--text)]"
          @click="resetModels"
        >
          {{ t("workspace.resetRecommended") }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--text)]"
          @click="clearKeys"
        >
          {{ t("workspace.clear") }}
        </button>
      </div>
    </form>

    <div class="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <div class="mb-2 flex items-center justify-between gap-3">
        <h2 class="text-sm font-medium">{{ t("workspace.usageTitle") }}</h2>
        <RouterLink to="/usage" class="text-xs text-[var(--accent)] hover:underline">
          {{ t("workspace.usageLink") }}
        </RouterLink>
      </div>
      <p v-if="today.total" class="text-sm text-[var(--muted)]">
        {{
          t("workspace.usageBody", {
            requests: today.total,
            tokens: formatTokens(today.tokens),
            cost: formatUsd(today.costUsd),
            avg: formatMs(today.avgMs),
          })
        }}
      </p>
      <p v-else class="text-sm text-[var(--muted)]">{{ t("workspace.usageEmpty") }}</p>
    </div>
  </section>
</template>
