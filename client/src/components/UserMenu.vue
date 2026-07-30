<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { RouterLink, useRouter } from "vue-router"
import { useI18n } from "vue-i18n"
import { useAuthStore } from "@/stores/auth"
import { useToastStore } from "@/stores/toast"

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()
const router = useRouter()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const initial = computed(() => {
  const name = auth.user?.username?.trim()
  if (!name) return "?"
  return name.slice(0, 1).toUpperCase()
})

watch(
  () => auth.isLoggedIn,
  (loggedIn) => {
    if (!loggedIn) open.value = false
  },
)

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (!root.value?.contains(e.target as Node)) close()
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") close()
}

function goLogin() {
  router.push({ name: "login" })
}

function logout() {
  auth.logout()
  close()
  toast.success(t("auth.toastLogoutSuccess"))
}

onMounted(() => {
  document.addEventListener("click", onDocClick)
  window.addEventListener("keydown", onKey)
})

onUnmounted(() => {
  document.removeEventListener("click", onDocClick)
  window.removeEventListener("keydown", onKey)
})
</script>

<template>
  <!-- 未登录：只显示登录按钮 -->
  <button
    v-if="!auth.isLoggedIn"
    type="button"
    class="login-btn"
    :aria-label="t('userMenu.login')"
    @click="goLogin"
  >
    {{ t("userMenu.loginShort") }}
  </button>

  <!-- 已登录：头像 + 下拉菜单 -->
  <div v-else ref="root" class="relative">
    <button
      type="button"
      class="avatar-btn"
      :aria-expanded="open"
      :aria-label="t('userMenu.open')"
      @click.stop="toggle"
    >
      <span class="avatar-mark">{{ initial }}</span>
    </button>

    <div v-if="open" class="menu" role="menu" @click.stop>
      <div class="menu-head">
        <div class="avatar-mark avatar-mark-lg">{{ initial }}</div>
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-[var(--text)]">{{ auth.user?.username }}</p>
          <p class="truncate text-xs text-[var(--muted)]">{{ t("userMenu.signedInHint") }}</p>
        </div>
      </div>

      <div class="menu-sep" />

      <RouterLink class="menu-item" to="/library" role="menuitem" @click="close">
        {{ t("nav.library") }}
      </RouterLink>
      <RouterLink class="menu-item" to="/workspace" role="menuitem" @click="close">
        {{ t("nav.workspace") }}
      </RouterLink>
      <RouterLink class="menu-item" to="/usage" role="menuitem" @click="close">
        {{ t("nav.usage") }}
      </RouterLink>

      <div class="menu-sep" />

      <button type="button" class="menu-item" role="menuitem" @click="logout">
        {{ t("userMenu.logout") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.login-btn {
  display: inline-flex;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.55rem;
  border: 1px solid var(--border);
  background: rgba(232, 168, 124, 0.1);
  padding: 0 0.85rem;
  color: var(--accent);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.login-btn:hover {
  border-color: rgba(232, 168, 124, 0.45);
  background: rgba(232, 168, 124, 0.18);
  color: var(--text);
}
.avatar-btn {
  display: inline-flex;
  height: 2.25rem;
  width: 2.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  padding: 0;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.avatar-btn:hover {
  border-color: rgba(232, 168, 124, 0.4);
  background: rgba(232, 168, 124, 0.08);
}
.avatar-mark {
  display: inline-flex;
  height: 1.55rem;
  width: 1.55rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: linear-gradient(145deg, var(--accent), var(--accent-strong));
  color: #1a120c;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.avatar-mark-lg {
  height: 2rem;
  width: 2rem;
  font-size: 0.8rem;
  flex-shrink: 0;
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.4rem);
  z-index: 100;
  width: 15.5rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: rgba(20, 27, 38, 0.96);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  padding: 0.5rem;
}
.menu-head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.5rem 0.65rem;
}
.menu-sep {
  height: 1px;
  margin: 0.15rem 0.35rem 0.35rem;
  background: var(--border);
}
.menu-item {
  display: block;
  width: 100%;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  padding: 0.55rem 0.65rem;
  text-align: left;
  font-size: 0.875rem;
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s ease;
}
.menu-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
}
</style>
