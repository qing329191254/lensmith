<script setup lang="ts">
import { RouterLink } from "vue-router"
import { useI18n } from "vue-i18n"
import { storeToRefs } from "pinia"
import { useApiKeyPromptStore } from "@/stores/apiKeyPrompt"

const { t } = useI18n()
const prompt = useApiKeyPromptStore()
const { visible, titleKey, bodyKey } = storeToRefs(prompt)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="api-key-banner"
      role="status"
    >
      <button
        type="button"
        class="api-key-banner__close"
        :aria-label="t('apiKeyPrompt.dismiss')"
        @click="prompt.dismiss()"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div class="flex gap-3 pr-6">
        <svg class="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div class="min-w-0">
          <h3 class="mb-1 text-sm font-semibold text-[var(--text)]">{{ t(titleKey) }}</h3>
          <p class="text-xs leading-relaxed text-[var(--muted)]">{{ t(bodyKey) }}</p>
          <RouterLink
            to="/workspace"
            class="mt-2 inline-block text-xs text-[var(--accent)] underline hover:text-[var(--accent-strong)]"
            @click="prompt.dismiss()"
          >
            {{ t("apiKeyPrompt.linkWorkspace") }}
          </RouterLink>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.api-key-banner {
  position: fixed;
  z-index: 80;
  right: max(1rem, env(safe-area-inset-right));
  bottom: max(1rem, env(safe-area-inset-bottom));
  left: auto;
  width: min(24rem, calc(100vw - 2rem));
  max-width: calc(100vw - 2rem);
  box-sizing: border-box;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  padding: 1rem;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
}

.api-key-banner__close {
  position: absolute;
  top: 0.625rem;
  right: 0.625rem;
  display: inline-flex;
  height: 1.75rem;
  width: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  color: var(--muted);
  transition: color 0.15s ease, background 0.15s ease;
}

.api-key-banner__close:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
}
</style>
