<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { setLocale, type LocaleCode } from "@/i18n"

const { locale, t } = useI18n()

const current = computed(() => locale.value as LocaleCode)

function switchTo(next: LocaleCode) {
  setLocale(next)
}
</script>

<template>
  <div
    class="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs"
    :aria-label="t('locale.switch')"
    role="group"
  >
    <button
      type="button"
      class="rounded-md px-2 py-1 transition"
      :class="current === 'zh' ? 'bg-[var(--accent)] font-semibold text-[#1a120c]' : 'text-[var(--muted)] hover:text-[var(--text)]'"
      @click="switchTo('zh')"
    >
      {{ t("locale.zh") }}
    </button>
    <button
      type="button"
      class="rounded-md px-2 py-1 transition"
      :class="current === 'en' ? 'bg-[var(--accent)] font-semibold text-[#1a120c]' : 'text-[var(--muted)] hover:text-[var(--text)]'"
      @click="switchTo('en')"
    >
      {{ t("locale.en") }}
    </button>
  </div>
</template>
