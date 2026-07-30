<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue"
import { RouterLink, useRoute } from "vue-router"
import { useI18n } from "vue-i18n"
import LocaleSwitch from "@/components/LocaleSwitch.vue"
import UserMenu from "@/components/UserMenu.vue"
import BrandLogo from "@/components/BrandLogo.vue"
import ApiKeyBanner from "@/components/ApiKeyBanner.vue"
import AppToast from "@/components/AppToast.vue"

const { t } = useI18n()
const route = useRoute()
const menuOpen = ref(false)

/** Soft projector dust / ember flecks — not snow. */
const motes = Array.from({ length: 28 }, (_, i) => {
  const tone = i % 3 === 0 ? "warm" : i % 3 === 1 ? "cool" : "soft"
  return {
    id: i,
    tone,
    left: `${(i * 37) % 100}%`,
    size: `${1.5 + ((i * 17) % 25) / 10}px`,
    duration: `${14 + (i % 12) * 1.6}s`,
    delay: `${-((i * 1.3) % 18)}s`,
    drift: `${(((i * 13) % 40) - 20) / 10}vw`,
    opacity: 0.22 + ((i * 11) % 35) / 100,
  }
})

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") menuOpen.value = false
}

onMounted(() => window.addEventListener("keydown", onKey))
onUnmounted(() => window.removeEventListener("keydown", onKey))
</script>

<template>
  <div class="app-shell">
    <div class="app-ambient" aria-hidden="true">
      <span class="app-ambient__orb app-ambient__orb--warm" />
      <span class="app-ambient__orb app-ambient__orb--cool" />
      <span class="app-ambient__orb app-ambient__orb--soft" />
      <span class="app-ambient__motes">
        <span
          v-for="mote in motes"
          :key="mote.id"
          class="app-ambient__mote"
          :class="`app-ambient__mote--${mote.tone}`"
          :style="{
            left: mote.left,
            width: mote.size,
            height: mote.size,
            '--mote-duration': mote.duration,
            '--mote-delay': mote.delay,
            '--mote-drift': mote.drift,
            '--mote-opacity': mote.opacity,
          }"
        />
      </span>
      <span class="app-ambient__grain" />
      <span class="app-ambient__vignette" />
    </div>

    <header class="app-header z-40 border-b border-[var(--border)] bg-[rgba(12,17,24,0.88)] backdrop-blur-md">
      <div class="app-header-inner flex h-14 items-center justify-between gap-3 sm:h-16">
        <RouterLink to="/" class="inline-flex h-full shrink-0 items-center" aria-label="Lensmith home">
          <BrandLogo />
        </RouterLink>

        <div class="hidden items-center gap-2 md:flex">
          <nav class="flex items-center gap-0.5 text-sm text-[var(--muted)]">
            <RouterLink class="nav-link" to="/storyboard">{{ t("nav.storyboard") }}</RouterLink>
            <RouterLink class="nav-link" to="/image-playground">{{ t("nav.images") }}</RouterLink>
            <RouterLink class="nav-link" to="/timeline">{{ t("nav.timeline") }}</RouterLink>
            <RouterLink class="nav-link" to="/demo">{{ t("nav.demo") }}</RouterLink>
          </nav>
          <LocaleSwitch />
          <UserMenu />
        </div>

        <div class="flex items-center gap-2 md:hidden">
          <LocaleSwitch />
          <UserMenu />
          <button
            type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text)]"
            :aria-expanded="menuOpen"
            :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
            @click="menuOpen = !menuOpen"
          >
            <span class="sr-only">Menu</span>
            <svg v-if="!menuOpen" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <nav
        v-if="menuOpen"
        class="border-t border-[var(--border)] bg-[var(--bg-elevated)] py-3 md:hidden"
        style="padding-inline: var(--page-pad)"
      >
        <div class="flex flex-col gap-1 text-sm text-[var(--muted)]">
          <RouterLink class="nav-link nav-link-mobile" to="/storyboard">{{ t("nav.storyboard") }}</RouterLink>
          <RouterLink class="nav-link nav-link-mobile" to="/image-playground">{{ t("nav.images") }}</RouterLink>
          <RouterLink class="nav-link nav-link-mobile" to="/timeline">{{ t("nav.timeline") }}</RouterLink>
          <RouterLink class="nav-link nav-link-mobile" to="/demo">{{ t("nav.demo") }}</RouterLink>
        </div>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
    <ApiKeyBanner />
    <AppToast />
  </div>
</template>

<style scoped>
.app-header-inner {
  width: 100%;
  padding-inline: var(--page-pad);
  box-sizing: border-box;
}
.nav-link {
  border-radius: 0.5rem;
  padding: 0.4rem 0.75rem;
  transition: color 0.15s ease, background 0.15s ease;
  white-space: nowrap;
}
.nav-link-mobile {
  display: block;
  padding: 0.7rem 0.85rem;
}
.nav-link:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
}
.nav-link.router-link-active {
  color: var(--text);
  background: rgba(232, 168, 124, 0.12);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
