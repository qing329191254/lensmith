<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import { RouterLink } from "vue-router"
import { useI18n } from "vue-i18n"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
let ctx: gsap.Context | null = null

const quickActions = [
  { to: "/storyboard", titleKey: "landing.quickStoryboard", descKey: "landing.quickStoryboardDesc", accent: true },
  { to: "/image-playground", titleKey: "landing.quickImages", descKey: "landing.quickImagesDesc", accent: false },
  { to: "/timeline", titleKey: "landing.quickTimeline", descKey: "landing.quickTimelineDesc", accent: false },
]

const pipelineSteps = [
  { num: "01", labelKey: "landing.stepGenerate", color: "rgba(139,92,246,0.2)", text: "#a78bfa" },
  { num: "02", labelKey: "landing.stepTransitions", color: "rgba(168,85,247,0.2)", text: "#c084fc" },
  { num: "03", labelKey: "landing.stepSelect", color: "rgba(16,185,129,0.2)", text: "#34d399" },
  { num: "04", labelKey: "landing.stepProcess", color: "rgba(245,158,11,0.2)", text: "#fbbf24" },
  { num: "05", labelKey: "landing.stepProduce", color: "rgba(244,63,94,0.2)", text: "#fb7185" },
]

const heroShots = [
  { src: "/hero/sunset.jpg", altKey: "landing.cardShotSunset" },
  { src: "/hero/forest.jpg", altKey: "landing.cardShotForest" },
  { src: "/hero/city.jpg", altKey: "landing.cardShotCity" },
  { src: "/hero/ocean.jpg", altKey: "landing.cardShotOcean" },
]

const heroVideo = {
  src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/git-blob/prj_y6denQY7uSeu9lM3GpnpQCz5KYdE/fbU5DYKN4uclkGtJg_2gXP/public/demo.mp4",
  poster: "/demo-poster.png",
  altKey: "landing.cardShotVideo",
}

onMounted(() => {
  if (!root.value) return

  requestAnimationFrame(() => {
    if (!root.value) return
    const scroller = document.querySelector(".app-main") as HTMLElement | null

    ctx = gsap.context(() => {
      const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } })
      heroTl
        .from(".hero-eyebrow", { y: 24, autoAlpha: 0, duration: 0.6 })
        .from(".hero-title", { y: 40, autoAlpha: 0, duration: 0.8 }, "-=0.35")
        .from(".hero-sub", { y: 28, autoAlpha: 0, duration: 0.7 }, "-=0.45")
        .from(".hero-cta", { y: 20, autoAlpha: 0, duration: 0.55, stagger: 0.08 }, "-=0.4")
        .from(".hero-visual", { x: 48, autoAlpha: 0, scale: 0.96, duration: 1 }, "-=0.75")

      gsap.to(".hero-visual-glow", {
        yPercent: 12,
        ease: "none",
        scrollTrigger: {
          scroller: scroller || undefined,
          trigger: ".hero-section",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      })

      const scrollIn = {
        scroller: scroller || undefined,
        start: "top 85%",
        // play on enter; reverse only when scrolling back up past the section
        toggleActions: "play none none reverse",
      } as const

      gsap.from(".quick-card", {
        y: 52,
        opacity: 0,
        duration: 1,
        stagger: 0.14,
        ease: "power3.out",
        scrollTrigger: { trigger: ".quick-grid", ...scrollIn },
      })

      gsap.from(".pipeline-card", {
        y: 44,
        opacity: 0,
        scale: 0.94,
        duration: 0.95,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: { trigger: ".pipeline-grid", ...scrollIn },
      })

      ScrollTrigger.refresh()
    }, root.value)
  })
})

onUnmounted(() => {
  ctx?.revert()
  ctx = null
})
</script>

<template>
  <div ref="root" class="overflow-x-clip">
    <section class="hero-section relative">
      <div
        class="page-container grid items-center gap-8 py-10 sm:gap-10 sm:py-14 lg:min-h-[calc(100vh-3.75rem)] lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:py-16"
      >
        <div class="order-1 space-y-5 sm:space-y-6">
          <p class="hero-eyebrow text-sm uppercase tracking-[0.22em] text-[var(--accent)]">{{ t("landing.brand") }}</p>
          <h1 class="hero-title display max-w-xl text-4xl leading-[1.08] text-[var(--text)] sm:text-5xl md:text-6xl">
            {{ t("landing.title") }}
          </h1>
          <p class="hero-sub max-w-lg text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            {{ t("landing.subtitle") }}
          </p>
          <div class="flex flex-wrap items-center gap-2.5 pt-1 sm:gap-3 sm:pt-2">
            <RouterLink
              to="/storyboard"
              class="hero-cta rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[#1a120c] transition hover:bg-[var(--accent-strong)]"
            >
              {{ t("landing.ctaPrimary") }}
            </RouterLink>
            <RouterLink
              to="/demo"
              class="hero-cta rounded-lg border border-[var(--border)] bg-transparent px-5 py-2.5 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:bg-[var(--surface)]"
            >
              {{ t("landing.ctaSecondary") }}
            </RouterLink>
            <RouterLink
              to="/workspace"
              class="hero-cta text-sm text-[var(--muted)] underline-offset-4 transition hover:text-[var(--text)] hover:underline"
            >
              {{ t("landing.ctaWorkspace") }}
            </RouterLink>
          </div>
        </div>
        <div
          class="hero-visual order-2 relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:max-w-lg lg:mx-0 lg:max-w-none"
        >
          <div
            class="hero-visual-glow absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(232,168,124,0.28),transparent_45%),radial-gradient(circle_at_70%_70%,rgba(126,184,201,0.18),transparent_40%)]"
          />
          <div class="absolute inset-0 flex flex-col p-5 sm:p-6">
            <div class="mb-3 flex shrink-0 items-center justify-between sm:mb-4">
              <span
                class="rounded-full border border-[var(--border)] bg-[rgba(12,17,24,0.45)] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]"
              >
                {{ t("landing.cardBadge") }}
              </span>
              <span class="font-mono text-[10px] text-[var(--muted)]">01 — 05</span>
            </div>

            <div class="grid shrink-0 grid-cols-2 gap-2">
              <div
                v-for="(shot, i) in heroShots"
                :key="i"
                class="group/shot relative aspect-video overflow-hidden rounded-lg border border-[var(--border)] bg-[rgba(12,17,24,0.55)]"
              >
                <img
                  :src="shot.src"
                  :alt="t(shot.altKey)"
                  class="h-full w-full object-cover transition duration-500 group-hover/shot:scale-[1.03]"
                  loading="lazy"
                />
                <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
              </div>
            </div>

            <div
              class="group/feature relative mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--border)] bg-[rgba(12,17,24,0.55)]"
            >
              <video
                class="h-full w-full object-cover transition duration-500 group-hover/feature:scale-[1.02]"
                :src="heroVideo.src"
                :poster="heroVideo.poster"
                :aria-label="t(heroVideo.altKey)"
                muted
                loop
                playsinline
                autoplay
              />
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            </div>

            <div class="mt-3 shrink-0 space-y-1 sm:mt-3.5">
              <p class="display text-xl sm:text-2xl">{{ t("landing.cardTitle") }}</p>
              <p class="text-sm text-[var(--muted)]">{{ t("landing.cardSub") }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="quick-section border-y border-[var(--border)] bg-[var(--bg-elevated)]/50 py-10 sm:py-14">
      <div class="page-container">
        <div class="mb-6 text-center sm:mb-8">
          <h2 class="display text-2xl md:text-3xl">{{ t("landing.quickTitle") }}</h2>
          <p class="mx-auto mt-2 max-w-xl text-sm text-[var(--muted)]">{{ t("landing.quickSubtitle") }}</p>
        </div>
        <div class="quick-grid grid gap-3 sm:grid-cols-3 sm:gap-4">
          <div v-for="action in quickActions" :key="action.to" class="quick-card">
            <RouterLink
              :to="action.to"
              class="group block h-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition duration-300 ease-out hover:-translate-y-[10px] hover:border-[var(--accent)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.25)] sm:p-5"
            >
              <h3
                class="mb-2 font-semibold"
                :class="action.accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'"
              >
                {{ t(action.titleKey) }}
              </h3>
              <p class="text-sm leading-relaxed text-[var(--muted)]">{{ t(action.descKey) }}</p>
              <span class="mt-3 inline-block text-xs text-[var(--accent)] opacity-0 transition group-hover:opacity-100">
                {{ t("landing.open") }} →
              </span>
            </RouterLink>
          </div>
        </div>
      </div>
    </section>

    <section class="pipeline-section py-12 sm:py-16">
      <div class="page-container">
        <div class="mb-8 text-center sm:mb-12">
          <span
            class="mb-4 inline-flex items-center gap-2 rounded-full border border-[rgba(232,168,124,0.25)] bg-[rgba(232,168,124,0.1)] px-3 py-1 text-xs font-medium text-[var(--accent)]"
          >
            {{ t("landing.pipelineBadge") }}
          </span>
          <h2 class="display text-2xl md:text-3xl">{{ t("landing.pipelineTitle") }}</h2>
          <p class="mx-auto mt-3 max-w-lg text-sm text-[var(--muted)]">{{ t("landing.pipelineSubtitle") }}</p>
        </div>
        <div class="pipeline-grid grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div v-for="step in pipelineSteps" :key="step.num" class="pipeline-card">
            <div
              class="group relative rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 transition duration-300 ease-out hover:-translate-y-[10px] hover:border-[rgba(232,168,124,0.35)] hover:shadow-[0_14px_32px_rgba(0,0,0,0.28)] sm:p-4"
            >
              <span class="absolute right-2 top-2 font-mono text-[10px] text-[var(--muted)]">{{ step.num }}</span>
              <div
                class="mb-3 flex h-8 w-8 items-center justify-center rounded-lg transition group-hover:scale-110"
                :style="{ background: step.color, color: step.text }"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span class="text-sm font-medium">{{ t(step.labelKey) }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
