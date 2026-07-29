<script setup lang="ts">
import { useI18n } from "vue-i18n"

defineProps<{
  projectName: string
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  save: []
  load: []
  export: []
  undo: []
  redo: []
}>()

const { t } = useI18n()
</script>

<template>
  <header class="editor-header">
    <div class="flex min-w-0 items-center gap-3">
      <h1 class="display truncate text-lg">{{ projectName }}</h1>
      <span class="hidden text-xs uppercase tracking-wider text-[var(--muted)] sm:inline">{{ t("timeline.eyebrow") }}</span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="btn-ghost" :disabled="!canUndo" @click="emit('undo')">{{ t("timeline.undo") }}</button>
      <button type="button" class="btn-ghost" :disabled="!canRedo" @click="emit('redo')">{{ t("timeline.redo") }}</button>
      <span class="mx-1 h-5 w-px bg-[var(--border)]" />
      <button type="button" class="btn-ghost" @click="emit('load')">{{ t("timeline.load") }}</button>
      <button type="button" class="btn-primary" @click="emit('save')">{{ t("timeline.save") }}</button>
      <button type="button" class="btn-accent" @click="emit('export')">{{ t("timeline.export") }}</button>
    </div>
  </header>
</template>

<style scoped>
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.65rem;
  padding: 0.55rem 0;
  border-bottom: none;
  background: transparent;
}

.btn-ghost,
.btn-primary,
.btn-accent {
  border-radius: 0.5rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.8125rem;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.btn-ghost {
  color: var(--muted);
  background: transparent;
}
.btn-ghost:hover:not(:disabled) {
  color: var(--text);
  background: rgba(255, 255, 255, 0.05);
}
.btn-ghost:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-primary {
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
}
.btn-primary:hover {
  background: var(--bg-elevated);
}

.btn-accent {
  color: #1a120c;
  background: var(--accent);
  font-weight: 600;
}
.btn-accent:hover {
  background: var(--accent-strong);
}
</style>
