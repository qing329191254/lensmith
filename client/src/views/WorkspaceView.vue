<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { RouterLink } from "vue-router"
import { useI18n } from "vue-i18n"
import { checkApiKey } from "@/api/seq"
import { formatUsd } from "@/lib/pricing"
import { useApiKeysStore } from "@/stores/apiKeys"
import {
  IMAGE_MODEL_OPTIONS,
  TEXT_MODEL_OPTIONS,
  VIDEO_MODEL_OPTIONS,
  useModelPrefsStore,
  type ModelOption,
  type ModelRole,
} from "@/stores/modelPrefs"
import { useUsageStore } from "@/stores/usage"

const { t } = useI18n()
const keys = useApiKeysStore()
const prefs = useModelPrefsStore()
const usage = useUsageStore()

const textApiKey = ref(keys.textApiKey)
const aiGatewayKey = ref(keys.aiGatewayKey)
const falKey = ref(keys.falKey)
const showText = ref(false)
const showGateway = ref(false)
const showFal = ref(false)
const saved = ref(false)
const showProxy = ref(Boolean(prefs.gatewayBaseUrl))
const serverStatus = ref<{
  configured: boolean
  textConfigured?: boolean
  falConfigured?: boolean
} | null>(null)
const checking = ref(false)

const textModel = ref(prefs.textModel)
const imageModel = ref(prefs.imageModel)
const videoModel = ref(prefs.videoModel)
const gatewayBaseUrl = ref(prefs.gatewayBaseUrl)
const editingCustom = ref({ text: false, image: false, video: false })

const today = computed(() => usage.summarize("1d"))

const selectedVideoOpt = computed(() => VIDEO_MODEL_OPTIONS.find((o) => o.id === videoModel.value))

const videoNeedsFal = computed(() => {
  const opt = selectedVideoOpt.value
  if (opt) return Boolean(opt.needsFal)
  return /^(veo|kling|wan|minimax|seedance|fal-ai\/|bytedance\/)/i.test(videoModel.value.trim())
})

const videoModelLabel = computed(() => selectedVideoOpt.value?.label || videoModel.value || "—")

function formatTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatMs(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`
  return `${n}ms`
}

function selectValue(current: string, options: ModelOption[], role: ModelRole): string {
  if (editingCustom.value[role]) return "__custom__"
  return options.some((o) => o.id === current) ? current : "__custom__"
}

function onSelect(role: ModelRole, value: string) {
  if (value === "__custom__") {
    editingCustom.value[role] = true
    return
  }
  editingCustom.value[role] = false
  if (role === "text") textModel.value = value
  else if (role === "image") imageModel.value = value
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

function saveAll() {
  keys.save({
    textApiKey: textApiKey.value,
    aiGatewayKey: aiGatewayKey.value,
    falKey: falKey.value,
  })
  prefs.save({
    textModel: textModel.value,
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
  prefs.resetToRecommended()
  textModel.value = prefs.textModel
  imageModel.value = prefs.imageModel
  videoModel.value = prefs.videoModel
  gatewayBaseUrl.value = prefs.gatewayBaseUrl
  editingCustom.value = { text: false, image: false, video: false }
  saveAll()
}

function clearKeys() {
  keys.clear()
  textApiKey.value = ""
  aiGatewayKey.value = ""
  falKey.value = ""
  void refreshStatus()
}

onMounted(() => {
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
          {{ t("workspace.sectionText") }}:
          <span :class="serverStatus?.textConfigured ? 'text-emerald-400' : 'text-amber-300'">
            {{ serverStatus?.textConfigured ? t("workspace.ready") : t("workspace.missing") }}
          </span>
        </li>
        <li>
          {{ t("workspace.sectionImage") }}:
          <span :class="serverStatus?.configured ? 'text-emerald-400' : 'text-amber-300'">
            {{ serverStatus?.configured ? t("workspace.ready") : t("workspace.missing") }}
          </span>
        </li>
        <li>
          {{ t("workspace.sectionVideo") }}:
          <span v-if="!videoNeedsFal" class="text-[var(--muted)]">
            {{ t("workspace.falNotNeededNow") }}
          </span>
          <span v-else :class="serverStatus?.falConfigured ? 'text-emerald-400' : 'text-amber-300'">
            {{ serverStatus?.falConfigured ? t("workspace.ready") : t("workspace.missing") }}
          </span>
        </li>
      </ul>
    </div>

    <form class="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6" @submit.prevent="saveAll">
      <div>
        <h2 class="text-base font-medium">{{ t("workspace.configTitle") }}</h2>
        <p class="mt-1 text-xs leading-relaxed text-[var(--muted)]">{{ t("workspace.configHint") }}</p>
        <p v-if="prefs.usingRecommended" class="mt-2 text-xs text-emerald-400/90">
          {{ t("workspace.modelsRecommendedActive") }}
        </p>
      </div>

      <!-- Text: model + key -->
      <section class="border-t border-[var(--border)] pt-5">
        <header class="mb-4">
          <h3 class="text-[15px] font-semibold tracking-tight text-[var(--text)]">
            {{ t("workspace.sectionText") }}
          </h3>
          <p class="mt-1 max-w-xl text-xs leading-relaxed text-[var(--muted)]">
            {{ t("workspace.textCapabilityHint") }}
          </p>
        </header>

        <div class="space-y-4 border-l border-[var(--border)] pl-4 sm:pl-5">
          <div class="space-y-1.5">
            <label class="block text-xs font-medium text-[var(--text)]/85" for="text-model">
              {{ t("workspace.textModel") }}
            </label>
            <select
              id="text-model"
              class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-4 text-sm outline-none focus:border-[var(--focus)]"
              :value="selectValue(textModel, TEXT_MODEL_OPTIONS, 'text')"
              @change="onSelect('text', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in TEXT_MODEL_OPTIONS" :key="opt.id" :value="opt.id">
                {{ optionLabel(opt) }}
              </option>
              <option value="__custom__">{{ t("workspace.customModel") }}</option>
            </select>
            <input
              v-if="selectValue(textModel, TEXT_MODEL_OPTIONS, 'text') === '__custom__'"
              v-model="textModel"
              type="text"
              class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm outline-none focus:border-[var(--focus)]"
              :placeholder="t('workspace.customModelPlaceholder')"
            />
          </div>

          <div class="space-y-1.5">
            <div class="space-y-0.5">
              <label class="block text-xs font-medium text-[var(--text)]/85" for="text-key">
                {{ t("workspace.textKeyLabel") }}
              </label>
              <p class="text-[11px] leading-relaxed text-[var(--muted)]">{{ t("workspace.textKeyHint") }}</p>
            </div>
            <div class="flex gap-2">
              <input
                id="text-key"
                v-model="textApiKey"
                :type="showText ? 'text' : 'password'"
                autocomplete="off"
                spellcheck="false"
                class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 font-mono text-sm outline-none focus:border-[var(--focus)]"
                :placeholder="t('workspace.textKeyPlaceholder')"
              />
              <button
                type="button"
                class="shrink-0 rounded-xl border border-[var(--border)] px-3 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                @click="showText = !showText"
              >
                {{ showText ? t("workspace.hide") : t("workspace.show") }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Image: model + key + proxy -->
      <section class="border-t border-[var(--border)] pt-5">
        <header class="mb-4">
          <h3 class="text-[15px] font-semibold tracking-tight text-[var(--text)]">
            {{ t("workspace.sectionImage") }}
          </h3>
          <p class="mt-1 max-w-xl text-xs leading-relaxed text-[var(--muted)]">
            {{ t("workspace.imageCapabilityHint") }}
          </p>
        </header>

        <div class="space-y-4 border-l border-[var(--border)] pl-4 sm:pl-5">
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
            <div class="space-y-0.5">
              <label class="block text-xs font-medium text-[var(--text)]/85" for="gateway-key">
                {{ t("workspace.gatewayLabel") }}
              </label>
              <p class="text-[11px] leading-relaxed text-[var(--muted)]">{{ t("workspace.gatewayHint") }}</p>
            </div>
            <div class="flex gap-2">
              <input
                id="gateway-key"
                v-model="aiGatewayKey"
                :type="showGateway ? 'text' : 'password'"
                autocomplete="off"
                spellcheck="false"
                class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 font-mono text-sm outline-none focus:border-[var(--focus)]"
                :placeholder="t('workspace.gatewayPlaceholder')"
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

          <div>
            <button
              type="button"
              class="text-xs text-[var(--focus)] hover:underline"
              @click="showProxy = !showProxy"
            >
              {{ showProxy ? t("workspace.hideProxy") : t("workspace.showProxy") }}
            </button>
            <div v-if="showProxy" class="mt-3 space-y-1.5">
              <div class="space-y-0.5">
                <label class="block text-xs font-medium text-[var(--text)]/85" for="proxy-base">
                  {{ t("workspace.proxyBase") }}
                </label>
                <p class="text-[11px] leading-relaxed text-[var(--muted)]">{{ t("workspace.proxyBaseHint") }}</p>
              </div>
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
        </div>
      </section>

      <!-- Video: model + fal key -->
      <section class="border-t border-[var(--border)] pt-5">
        <header class="mb-4">
          <h3 class="text-[15px] font-semibold tracking-tight text-[var(--text)]">
            {{ t("workspace.sectionVideo") }}
          </h3>
          <p class="mt-1 max-w-xl text-xs leading-relaxed text-[var(--muted)]">
            {{ t("workspace.videoCapabilityHint") }}
          </p>
        </header>

        <div class="space-y-4 border-l border-[var(--border)] pl-4 sm:pl-5">
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

          <p
            class="rounded-lg border px-3 py-2 text-xs leading-relaxed"
            :class="
              videoNeedsFal
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100/90'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100/90'
            "
          >
            <template v-if="videoNeedsFal">
              {{ t("workspace.videoKeyNeedFal", { model: videoModelLabel }) }}
            </template>
            <template v-else>
              {{ t("workspace.videoKeyNeedGateway", { model: videoModelLabel }) }}
            </template>
          </p>

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
        </div>
      </section>

      <p class="border-t border-[var(--border)] pt-4 text-xs leading-relaxed text-[var(--muted)]">
        {{ t("workspace.privacy") }}
      </p>
      <p class="text-xs leading-relaxed text-[var(--muted)]">{{ t("workspace.modelsDisclaimer") }}</p>

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
