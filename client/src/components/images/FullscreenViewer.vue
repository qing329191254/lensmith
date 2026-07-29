<script setup lang="ts">
import { onMounted, onUnmounted } from "vue"
import { useI18n } from "vue-i18n"

const props = defineProps<{
  imageUrl: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close")
}

onMounted(() => {
  document.body.style.overflow = "hidden"
  window.addEventListener("keydown", onKeydown)
})

onUnmounted(() => {
  document.body.style.overflow = ""
  window.removeEventListener("keydown", onKeydown)
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,12,18,0.95)] p-4 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    :aria-label="t('images.fullscreen')"
    @click="emit('close')"
  >
    <button
      type="button"
      class="absolute right-4 top-4 z-10 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
      :title="t('images.closeFullscreen')"
      @click.stop="emit('close')"
    >
      <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <img
      :src="imageUrl"
      :alt="t('images.altResult')"
      class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
      @click.stop
    />
  </div>
</template>
