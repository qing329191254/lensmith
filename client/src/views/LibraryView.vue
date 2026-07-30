<script setup lang="ts">
import { computed, ref } from "vue"
import { RouterLink } from "vue-router"
import { useI18n } from "vue-i18n"
import { useAssetsStore, type AssetKind, type AssetSource, type MediaAsset } from "@/stores/assets"

const { t } = useI18n()
const assets = useAssetsStore()

type Filter = "all" | AssetKind
const filter = ref<Filter>("all")
const sourceFilter = ref<"all" | AssetSource>("all")
const selected = ref<MediaAsset | null>(null)

const filtered = computed(() => {
  return assets.items.filter((item) => {
    if (filter.value !== "all" && item.kind !== filter.value) return false
    if (sourceFilter.value !== "all" && item.source !== sourceFilter.value) return false
    return true
  })
})

const filters: { id: Filter; labelKey: string }[] = [
  { id: "all", labelKey: "library.filterAll" },
  { id: "image", labelKey: "library.filterImage" },
  { id: "video", labelKey: "library.filterVideo" },
]

const sources: { id: "all" | AssetSource; labelKey: string }[] = [
  { id: "all", labelKey: "library.sourceAll" },
  { id: "image-playground", labelKey: "library.sourceImages" },
  { id: "storyboard", labelKey: "library.sourceStoryboard" },
]

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function sourceLabel(source: AssetSource) {
  return t(`library.sources.${source}`)
}

function openAsset(item: MediaAsset) {
  selected.value = item
}

function closeViewer() {
  selected.value = null
}

function removeSelected() {
  if (!selected.value) return
  assets.remove(selected.value.id)
  selected.value = null
}

function clearAll() {
  if (confirm(t("library.confirmClear"))) assets.clear()
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <section class="page-container py-8 sm:py-10">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">{{ t("library.eyebrow") }}</p>
        <h1 class="display mt-3 text-3xl md:text-4xl">{{ t("library.title") }}</h1>
        <p class="mt-2 max-w-2xl text-sm text-[var(--muted)]">{{ t("library.subtitle") }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
          :disabled="!assets.items.length"
          @click="clearAll"
        >
          {{ t("library.clear") }}
        </button>
      </div>
    </div>

    <div class="mb-6 flex flex-wrap items-center gap-2">
      <div class="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
        <button
          v-for="item in filters"
          :key="item.id"
          type="button"
          class="rounded-md px-3 py-1.5 text-xs transition"
          :class="filter === item.id ? 'bg-[var(--accent)] font-semibold text-[#1a120c]' : 'text-[var(--muted)] hover:text-[var(--text)]'"
          @click="filter = item.id"
        >
          {{ t(item.labelKey) }}
        </button>
      </div>
      <div class="inline-flex flex-wrap rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
        <button
          v-for="item in sources"
          :key="item.id"
          type="button"
          class="rounded-md px-3 py-1.5 text-xs transition"
          :class="sourceFilter === item.id ? 'bg-[var(--bg-elevated)] text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]'"
          @click="sourceFilter = item.id"
        >
          {{ t(item.labelKey) }}
        </button>
      </div>
      <span class="text-xs text-[var(--muted)]">{{ t("library.count", { n: filtered.length }) }}</span>
    </div>

    <div
      v-if="!filtered.length"
      class="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/60 px-6 py-16 text-center"
    >
      <p class="display text-2xl">{{ t("library.emptyTitle") }}</p>
      <p class="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">{{ t("library.emptyBody") }}</p>
      <div class="mt-5 flex flex-wrap justify-center gap-2">
        <RouterLink to="/image-playground" class="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#1a120c]">
          {{ t("nav.images") }}
        </RouterLink>
        <RouterLink to="/storyboard" class="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">
          {{ t("nav.storyboard") }}
        </RouterLink>
      </div>
    </div>

    <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      <button
        v-for="item in filtered"
        :key="item.id"
        type="button"
        class="group relative aspect-square overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left transition hover:border-[var(--accent)]/50"
        @click="openAsset(item)"
      >
        <img
          v-if="item.kind === 'image'"
          :src="item.url"
          :alt="item.prompt || t('library.imageAlt')"
          class="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <template v-else>
          <img
            v-if="item.thumbUrl"
            :src="item.thumbUrl"
            alt=""
            class="h-full w-full object-cover opacity-90"
            loading="lazy"
            decoding="async"
          />
          <video
            v-else
            :src="item.url"
            class="h-full w-full object-cover"
            muted
            preload="metadata"
          />
          <span class="absolute inset-0 flex items-center justify-center">
            <span class="rounded-full bg-black/55 px-3 py-1 text-xs text-white backdrop-blur-sm">▶</span>
          </span>
        </template>
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-8">
          <p class="truncate text-[10px] text-white/90">{{ sourceLabel(item.source) }}</p>
          <p class="truncate text-[10px] text-white/60">{{ formatTime(item.createdAt) }}</p>
        </div>
      </button>
    </div>

    <p class="mt-8 text-center text-xs text-[var(--muted)]">{{ t("library.footer") }}</p>

    <!-- Viewer -->
    <div
      v-if="selected"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      @click.self="closeViewer"
    >
      <div class="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
        <div class="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ sourceLabel(selected.source) }} · {{ selected.kind === "video" ? t("library.filterVideo") : t("library.filterImage") }}</p>
            <p class="truncate text-xs text-[var(--muted)]">{{ formatTime(selected.createdAt) }}</p>
          </div>
          <button type="button" class="rounded-lg px-2 py-1 text-[var(--muted)] hover:text-[var(--text)]" @click="closeViewer">×</button>
        </div>
        <div class="max-h-[60vh] bg-black/40">
          <img
            v-if="selected.kind === 'image'"
            :src="selected.url"
            :alt="selected.prompt || ''"
            class="mx-auto max-h-[60vh] w-auto max-w-full object-contain"
          />
          <video
            v-else
            :src="selected.url"
            class="mx-auto max-h-[60vh] w-full object-contain"
            controls
            autoplay
          />
        </div>
        <div class="space-y-3 px-4 py-4">
          <p v-if="selected.prompt" class="text-sm text-[var(--muted)]">{{ selected.prompt }}</p>
          <p v-if="selected.model" class="text-xs text-[var(--muted)]">{{ selected.model }}</p>
          <div class="flex flex-wrap gap-2">
            <a
              :href="selected.url"
              target="_blank"
              rel="noopener"
              class="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#1a120c]"
            >
              {{ t("library.open") }}
            </a>
            <button
              type="button"
              class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              @click="copyUrl(selected.url)"
            >
              {{ t("library.copyUrl") }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-rose-500/30 px-3 py-1.5 text-sm text-rose-300"
              @click="removeSelected"
            >
              {{ t("library.delete") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
