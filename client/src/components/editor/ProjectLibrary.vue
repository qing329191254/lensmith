<script setup lang="ts">
import { ref } from "vue"
import { useI18n } from "vue-i18n"
import type { MediaItem } from "@/editor/types"
import { formatDuration } from "@/editor/utils/time"

defineProps<{
  media: MediaItem[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  import: [file: File]
  addToTimeline: [item: MediaItem]
  remove: [item: MediaItem]
}>()

const { t } = useI18n()
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) emit("import", file)
  if (fileInputRef.value) fileInputRef.value.value = ""
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) emit("import", file)
}
</script>

<template>
  <aside class="library">
    <div class="library-header">
      <h2>{{ t("timeline.library") }}</h2>
      <button type="button" class="import-btn" @click="fileInputRef?.click()">{{ t("timeline.import") }}</button>
      <input ref="fileInputRef" type="file" accept="video/*,audio/*,image/*" hidden @change="onFileChange" />
    </div>

    <div
      class="drop-zone"
      :class="{ 'drop-zone--active': isDragOver }"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop="onDrop"
    >
      {{ t("timeline.dropHint") }}
    </div>

    <ul v-if="media.length" class="media-list">
      <li
        v-for="item in media"
        :key="item.id"
        class="media-item"
        :class="{ 'media-item--selected': selectedId === item.id }"
        @click="emit('select', item.id)"
      >
        <div class="thumb">
          <video v-if="item.type === 'video'" :src="item.url" muted preload="metadata" />
          <img v-else-if="item.type === 'image'" :src="item.url" :alt="item.prompt" />
          <div v-else class="audio-icon">♪</div>
        </div>
        <div class="meta">
          <p class="name">{{ item.prompt }}</p>
          <div class="row">
            <span>{{ formatDuration(item.duration) }}</span>
            <span class="type">{{ item.type }}</span>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="icon-btn danger" :title="t('timeline.remove')" @click.stop="emit('remove', item)">×</button>
          <button type="button" class="icon-btn add" :title="t('timeline.addToTimeline')" @click.stop="emit('addToTimeline', item)">+</button>
        </div>
      </li>
    </ul>
    <p v-else class="empty">{{ t("timeline.libraryEmpty") }}</p>
  </aside>
</template>

<style scoped>
.library {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--border);
  background: var(--bg-elevated);
}

.library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--border);
}

.library-header h2 {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.import-btn {
  border-radius: 0.4rem;
  padding: 0.35rem 0.6rem;
  font-size: 0.75rem;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
}
.import-btn:hover {
  background: rgba(232, 168, 124, 0.12);
}

.drop-zone {
  margin: 0.75rem;
  padding: 0.75rem;
  border: 1px dashed var(--border);
  border-radius: 0.5rem;
  font-size: 0.75rem;
  text-align: center;
  color: var(--muted);
}
.drop-zone--active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(232, 168, 124, 0.08);
}

.media-list {
  list-style: none;
  margin: 0;
  padding: 0 0.5rem 0.75rem;
  overflow-y: auto;
  flex: 1;
}

.media-item {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  padding: 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
  border: 1px solid transparent;
}
.media-item:hover {
  background: rgba(255, 255, 255, 0.03);
}
.media-item--selected {
  background: rgba(232, 168, 124, 0.1);
  border-color: rgba(232, 168, 124, 0.25);
}

.thumb {
  width: 64px;
  height: 36px;
  border-radius: 0.35rem;
  overflow: hidden;
  background: #000;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb video,
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.audio-icon {
  color: var(--accent);
  font-size: 1.1rem;
}

.meta {
  flex: 1;
  min-width: 0;
}
.name {
  margin: 0;
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.2rem;
  font-size: 0.65rem;
  color: var(--muted);
}
.type {
  text-transform: uppercase;
}

.actions {
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.15s;
}
.media-item:hover .actions {
  opacity: 1;
}

.icon-btn {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.35rem;
  font-size: 1rem;
  line-height: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
}
.icon-btn.add:hover {
  color: var(--text);
  background: rgba(232, 168, 124, 0.2);
}
.icon-btn.danger:hover {
  color: #f87171;
}

.empty {
  padding: 1rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--muted);
}
</style>
