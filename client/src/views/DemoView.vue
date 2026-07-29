<script setup lang="ts">
import { RouterLink } from "vue-router"
import { useI18n } from "vue-i18n"

const { t } = useI18n()

const DEMO_VIDEO =
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/git-blob/prj_y6denQY7uSeu9lM3GpnpQCz5KYdE/fbU5DYKN4uclkGtJg_2gXP/public/demo.mp4"
</script>

<template>
  <div class="min-h-[calc(100vh-3.5rem)]">
    <!-- Page header -->
    <div class="border-b border-[var(--border)] bg-[rgba(12,17,24,0.6)]">
      <div class="page-container mx-auto flex max-w-5xl items-center justify-between gap-3 py-3 sm:gap-4 sm:py-4">
        <div>
          <h1 class="text-base font-semibold">{{ t("demo.title") }}</h1>
          <p class="hidden text-xs text-[var(--muted)] sm:block">{{ t("demo.subtitle") }}</p>
        </div>
        <div class="flex items-center gap-2">
          <RouterLink
            to="/storyboard"
            class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:border-[var(--accent)]"
          >
            {{ t("demo.tryStoryboard") }}
          </RouterLink>
          <RouterLink
            to="/timeline"
            class="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[#1a120c] transition hover:bg-[var(--accent-strong)]"
          >
            {{ t("demo.openEditor") }}
          </RouterLink>
        </div>
      </div>
    </div>

    <main class="page-container max-w-5xl py-8 sm:py-12">
      <!-- Hero -->
      <div class="mb-10 text-center">
        <span
          class="mb-6 inline-flex items-center gap-2 rounded-full border border-[rgba(232,168,124,0.25)] bg-[rgba(232,168,124,0.1)] px-3 py-1 text-xs font-medium text-[var(--accent)]"
        >
          <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          {{ t("demo.badge") }}
        </span>
        <h2 class="display mb-4 text-3xl md:text-4xl">{{ t("demo.heroTitle") }}</h2>
        <p class="mx-auto max-w-2xl text-[var(--muted)]">{{ t("demo.heroBody") }}</p>
      </div>

      <!-- Video -->
      <div class="group relative mb-12">
        <div
          class="absolute -inset-1 rounded-2xl bg-gradient-to-b from-[rgba(232,168,124,0.2)] to-transparent opacity-50 blur-lg transition group-hover:opacity-75"
        />
        <div class="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
          <video
            :src="DEMO_VIDEO"
            controls
            class="aspect-video w-full bg-black"
            poster="/demo-poster.png"
          />
        </div>
      </div>

      <!-- How it was made -->
      <div class="space-y-8">
        <div class="text-center">
          <h3 class="text-xl font-semibold">{{ t("demo.howTitle") }}</h3>
          <p class="mt-1 text-sm text-[var(--muted)]">{{ t("demo.howSubtitle") }}</p>
        </div>

        <div class="grid gap-6 md:grid-cols-2">
          <RouterLink
            to="/storyboard"
            class="block rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-6 transition hover:border-[rgba(232,168,124,0.35)]"
          >
            <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[rgba(232,168,124,0.15)] text-[var(--accent)]">
              <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <h4 class="mb-2 font-semibold">{{ t("demo.storyboardTitle") }}</h4>
            <p class="mb-4 text-sm leading-relaxed text-[var(--muted)]">{{ t("demo.storyboardBody") }}</p>
            <span class="text-xs text-[var(--accent)]">{{ t("demo.tryStoryboard") }} →</span>
          </RouterLink>

          <RouterLink
            to="/timeline"
            class="block rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-6 transition hover:border-[rgba(126,184,201,0.35)]"
          >
            <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[rgba(126,184,201,0.15)] text-[var(--focus)]">
              <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h4 class="mb-2 font-semibold">{{ t("demo.timelineTitle") }}</h4>
            <p class="mb-4 text-sm leading-relaxed text-[var(--muted)]">{{ t("demo.timelineBody") }}</p>
            <span class="text-xs text-[var(--focus)]">{{ t("demo.openEditor") }} →</span>
          </RouterLink>
        </div>

        <div class="border-t border-[var(--border)] pt-8 text-center">
          <p class="mb-3 text-xs text-[var(--muted)]">{{ t("demo.poweredBy") }}</p>
          <div class="flex flex-wrap items-center justify-center gap-6 text-sm text-[var(--muted)]">
            <span class="flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-[var(--accent)]" />
              Gemini 3 Pro
            </span>
            <span class="flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-[var(--focus)]" />
              Veo 3.1
            </span>
            <span class="flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-emerald-500" />
              Wan 2.5
            </span>
          </div>
        </div>
      </div>
    </main>

    <!-- Footer CTA -->
    <footer class="border-t border-[var(--border)] bg-[var(--bg-elevated)]/50 py-12">
      <div class="page-container max-w-5xl text-center">
        <h3 class="mb-3 text-xl font-semibold">{{ t("demo.footerTitle") }}</h3>
        <p class="mx-auto mb-6 max-w-lg text-sm text-[var(--muted)]">{{ t("demo.footerBody") }}</p>
        <RouterLink
          to="/storyboard"
          class="inline-block rounded-lg bg-[var(--accent)] px-8 py-2.5 text-sm font-semibold text-[#1a120c] transition hover:bg-[var(--accent-strong)]"
        >
          {{ t("demo.startCreating") }}
        </RouterLink>
      </div>
    </footer>
  </div>
</template>
