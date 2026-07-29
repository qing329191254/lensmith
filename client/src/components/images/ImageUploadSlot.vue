<script setup lang="ts">
import { ref } from "vue"
import { useI18n } from "vue-i18n"

const props = defineProps<{
  slotNumber: 1 | 2
  preview: string
  label: string
}>()

const emit = defineEmits<{
  select: [file: File]
  clear: []
}>()

const { t } = useI18n()
const dragging = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

function pickFile() {
  inputRef.value?.click()
}

function onInputChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit("select", file)
  ;(event.target as HTMLInputElement).value = ""
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file?.type.startsWith("image/")) emit("select", file)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  dragging.value = true
}

function onDragLeave() {
  dragging.value = false
}
</script>

<template>
  <div class="space-y-1">
    <span class="text-sm text-[var(--muted)]">{{ label }}</span>
    <div
      class="relative flex min-h-[120px] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed transition-colors"
      :class="
        dragging
          ? 'border-[var(--accent)] bg-[rgba(232,168,124,0.08)]'
          : preview
            ? 'border-[var(--accent)] bg-[var(--surface)]'
            : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]'
      "
      role="button"
      tabindex="0"
      @click="pickFile"
      @keydown.enter.prevent="pickFile"
      @keydown.space.prevent="pickFile"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
    >
      <input
        ref="inputRef"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onInputChange"
      />

      <button
        v-if="preview"
        type="button"
        class="absolute right-2 top-2 z-10 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 text-[var(--muted)] transition hover:border-red-400/50 hover:text-red-200"
        :aria-label="t('images.clearSlot', { n: slotNumber })"
        @click.stop="emit('clear')"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <img
        v-if="preview"
        :src="preview"
        :alt="label"
        class="max-h-[160px] w-full object-contain p-2"
      />
      <div v-else class="px-4 py-6 text-center text-[var(--muted)]">
        <svg class="mx-auto mb-2 h-8 w-8 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p class="text-sm">{{ t("images.dropHint") }}</p>
        <p class="mt-1 text-xs opacity-70">{{ t("images.pasteHint") }}</p>
      </div>
    </div>
  </div>
</template>
