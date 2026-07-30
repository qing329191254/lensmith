<script setup lang="ts">
import { storeToRefs } from "pinia"
import { useToastStore } from "@/stores/toast"

const toast = useToastStore()
const { message, kind } = storeToRefs(toast)
</script>

<template>
  <Teleport to="body">
    <Transition name="app-toast">
      <div
        v-if="message"
        class="app-toast"
        :class="kind === 'error' ? 'app-toast--error' : 'app-toast--success'"
        role="status"
      >
        {{ message }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-toast {
  position: fixed;
  top: 5.25rem;
  left: 50%;
  z-index: 200;
  max-width: min(92vw, 28rem);
  transform: translateX(-50%);
  border-radius: 0.65rem;
  border: 1px solid transparent;
  padding: 0.7rem 1rem;
  font-size: 0.875rem;
  line-height: 1.4;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
  pointer-events: none;
}
.app-toast--success {
  border-color: rgba(52, 211, 153, 0.35);
  background: rgba(16, 50, 40, 0.92);
  color: #b7f7d8;
}
.app-toast--error {
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(60, 24, 28, 0.94);
  color: #fecaca;
}
.app-toast-enter-active,
.app-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-0.5rem);
}
</style>
