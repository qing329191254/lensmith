<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { RouterLink } from "vue-router"
import { useI18n } from "vue-i18n"
import { formatUsd, modelLabel } from "@/lib/pricing"
import { useUsageStore, type UsageRange, type UsageRoute } from "@/stores/usage"

const { t } = useI18n()
const usage = useUsageStore()
const range = ref<UsageRange>("7d")

const summary = computed(() => usage.summarize(range.value))

const maxDayCount = computed(() => Math.max(1, ...summary.value.days.map((d) => d.count)))
const maxRouteCost = computed(() => Math.max(0.0001, ...summary.value.byRoute.map((r) => r.costUsd)))

const ranges: { id: UsageRange; labelKey: string }[] = [
  { id: "1d", labelKey: "usage.range1d" },
  { id: "7d", labelKey: "usage.range7d" },
  { id: "30d", labelKey: "usage.range30d" },
]

function routeLabel(route: UsageRoute) {
  return t(`usage.routes.${route}`)
}

function formatTokens(n: number) {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`
  return String(n)
}

function formatMs(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`
  return `${n}ms`
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function formatPct(n: number) {
  return `${Math.round(n * 100)}%`
}

onMounted(() => {
  if (usage.events.length === 0) usage.seedSample()
})
</script>

<template>
  <section class="page-container py-8 sm:py-10">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">{{ t("usage.eyebrow") }}</p>
        <h1 class="display mt-3 text-3xl md:text-4xl">{{ t("usage.title") }}</h1>
        <p class="mt-2 max-w-2xl text-sm text-[var(--muted)]">{{ t("usage.subtitle") }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
          <button
            v-for="item in ranges"
            :key="item.id"
            type="button"
            class="rounded-md px-3 py-1.5 text-xs transition"
            :class="range === item.id ? 'bg-[var(--accent)] font-semibold text-[#1a120c]' : 'text-[var(--muted)] hover:text-[var(--text)]'"
            @click="range = item.id"
          >
            {{ t(item.labelKey) }}
          </button>
        </div>
        <button
          type="button"
          class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
          @click="usage.seedSample()"
        >
          {{ t("usage.loadSample") }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
          @click="usage.clear()"
        >
          {{ t("usage.clear") }}
        </button>
      </div>
    </div>

    <div
      v-if="summary.hasSample"
      class="mb-6 rounded-xl border border-[rgba(232,168,124,0.25)] bg-[rgba(232,168,124,0.08)] px-4 py-3 text-sm text-[var(--muted)]"
    >
      {{ t("usage.sampleHint") }}
    </div>

    <div v-if="summary.isEmpty" class="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/60 px-6 py-16 text-center">
      <p class="display text-2xl">{{ t("usage.emptyTitle") }}</p>
      <p class="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">{{ t("usage.emptyBody") }}</p>
      <button
        type="button"
        class="mt-5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#1a120c]"
        @click="usage.seedSample()"
      >
        {{ t("usage.loadSample") }}
      </button>
    </div>

    <template v-else>
      <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div class="stat-card">
          <p class="stat-label">{{ t("usage.statRequests") }}</p>
          <p class="stat-value">{{ summary.total }}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">{{ t("usage.statTokens") }}</p>
          <p class="stat-value">{{ formatTokens(summary.tokens) }}</p>
          <p class="stat-sub">{{ t("usage.tokensNote") }}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">{{ t("usage.statCache") }}</p>
          <p class="stat-value">{{ formatPct(summary.cacheRate) }}</p>
          <p class="stat-sub">
            {{ t("usage.cacheNote", { cached: formatTokens(summary.cachedTokens), prompt: formatTokens(summary.promptTokens) }) }}
          </p>
        </div>
        <div class="stat-card">
          <p class="stat-label">{{ t("usage.statCost") }}</p>
          <p class="stat-value">{{ formatUsd(summary.costUsd) }}</p>
          <p class="stat-sub">{{ t("usage.costNote") }}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">{{ t("usage.statAvg") }}</p>
          <p class="stat-value">{{ formatMs(summary.avgMs) }}</p>
          <p class="stat-sub">P95 {{ formatMs(summary.p95Ms) }}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">{{ t("usage.statSuccess") }}</p>
          <p class="stat-value">{{ formatPct(summary.successRate) }}</p>
        </div>
      </div>

      <div class="mb-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div class="panel">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-sm font-semibold">{{ t("usage.chartTitle") }}</h2>
            <span class="text-xs text-[var(--muted)]">{{ t("usage.chartSubtitle") }}</span>
          </div>
          <div class="flex h-44 items-end gap-1.5 sm:gap-2">
            <div
              v-for="day in summary.days"
              :key="day.key"
              class="group flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <div class="relative flex h-36 w-full items-end justify-center">
                <div
                  class="w-full max-w-[2.2rem] rounded-t-md bg-gradient-to-t from-[rgba(232,168,124,0.25)] to-[rgba(232,168,124,0.85)] transition group-hover:to-[var(--accent)]"
                  :style="{ height: `${Math.max(6, (day.count / maxDayCount) * 100)}%` }"
                  :title="`${day.count} · ${formatTokens(day.tokens)} · ${formatUsd(day.costUsd)} · cache ${formatPct(day.cacheRate)}`"
                />
              </div>
              <span class="truncate text-[10px] text-[var(--muted)]">{{ day.label }}</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <h2 class="mb-4 text-sm font-semibold">{{ t("usage.byRouteTitle") }}</h2>
          <div class="space-y-3">
            <div v-for="row in summary.byRoute" :key="row.route">
              <div class="mb-1 flex items-center justify-between gap-2 text-xs">
                <span class="truncate text-[var(--text)]">{{ routeLabel(row.route) }}</span>
                <span class="shrink-0 text-[var(--muted)]">
                  {{ formatUsd(row.costUsd) }} · {{ formatPct(row.cacheRate) }} · {{ row.count }}
                </span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                <div
                  class="h-full rounded-full bg-[var(--focus)]"
                  :style="{ width: `${(row.costUsd / maxRouteCost) * 100}%` }"
                />
              </div>
            </div>
            <p v-if="!summary.byRoute.length" class="text-xs text-[var(--muted)]">{{ t("usage.noRoutes") }}</p>
          </div>
        </div>
      </div>

      <div class="panel overflow-x-auto">
        <h2 class="mb-4 text-sm font-semibold">{{ t("usage.recentTitle") }}</h2>
        <table class="w-full min-w-[40rem] text-left text-sm">
          <thead class="text-xs text-[var(--muted)]">
            <tr class="border-b border-[var(--border)]">
              <th class="pb-2 pr-3 font-medium">{{ t("usage.colTime") }}</th>
              <th class="pb-2 pr-3 font-medium">{{ t("usage.colRoute") }}</th>
              <th class="pb-2 pr-3 font-medium">{{ t("usage.colModel") }}</th>
              <th class="pb-2 pr-3 font-medium">{{ t("usage.colLatency") }}</th>
              <th class="pb-2 pr-3 font-medium">{{ t("usage.colTokens") }}</th>
              <th class="pb-2 pr-3 font-medium">{{ t("usage.colCache") }}</th>
              <th class="pb-2 pr-3 font-medium">{{ t("usage.colCost") }}</th>
              <th class="pb-2 font-medium">{{ t("usage.colStatus") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in summary.recent"
              :key="item.id"
              class="border-b border-[var(--border)]/60 text-[var(--text)] last:border-0"
            >
              <td class="py-2.5 pr-3 text-xs text-[var(--muted)]">{{ formatTime(item.ts) }}</td>
              <td class="py-2.5 pr-3">{{ routeLabel(item.route) }}</td>
              <td class="py-2.5 pr-3 text-xs text-[var(--muted)]">
                {{ modelLabel(item.modelId) }}
                <span v-if="item.costFallback" class="text-[var(--muted)]/70">~</span>
              </td>
              <td class="py-2.5 pr-3 font-mono text-xs">{{ formatMs(item.durationMs) }}</td>
              <td class="py-2.5 pr-3 font-mono text-xs">
                {{ formatTokens(item.tokens) }}
                <span v-if="item.estimated" class="text-[var(--muted)]">~</span>
              </td>
              <td class="py-2.5 pr-3 font-mono text-xs">
                <template v-if="item.promptTokens > 0">{{ formatPct(item.cacheRate) }}</template>
                <span v-else class="text-[var(--muted)]">—</span>
              </td>
              <td class="py-2.5 pr-3 font-mono text-xs">{{ formatUsd(item.costUsd) }}</td>
              <td class="py-2.5">
                <span
                  class="rounded-full px-2 py-0.5 text-[10px]"
                  :class="item.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'"
                >
                  {{ item.ok ? t("usage.ok") : t("usage.fail") }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <p class="mt-8 text-center text-xs text-[var(--muted)]">
      {{ t("usage.footer") }}
      <RouterLink to="/workspace" class="text-[var(--accent)] hover:underline">{{ t("nav.workspace") }}</RouterLink>
    </p>
  </section>
</template>

<style scoped>
.stat-card,
.panel {
  border-radius: 1rem;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  padding: 1rem 1.1rem;
}
.stat-label {
  font-size: 0.75rem;
  color: var(--muted);
}
.stat-value {
  margin-top: 0.35rem;
  font-family: "Newsreader", Georgia, serif;
  font-size: 1.85rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.stat-sub {
  margin-top: 0.25rem;
  font-size: 0.7rem;
  color: var(--muted);
}
</style>
