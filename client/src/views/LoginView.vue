<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useI18n } from "vue-i18n"
import { useAuthStore } from "@/stores/auth"
import { useToastStore } from "@/stores/toast"

/** 与后端一致：用户名 3–20 位，中文/字母/数字/下划线 */
const USERNAME_RE = /^[\u4e00-\u9fffa-zA-Z0-9_]{3,20}$/
/** 密码 6–32 位，至少含字母和数字 */
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{6,32}$/

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()
const router = useRouter()
const route = useRoute()

const mode = ref<"login" | "register">("login")
const username = ref("")
const password = ref("")
const confirm = ref("")
const showPassword = ref(false)
const showConfirm = ref(false)
const loading = ref(false)
const error = ref("")

const redirectTo = computed(() => {
  const raw = route.query.redirect
  return typeof raw === "string" && raw.startsWith("/") ? raw : "/"
})

watch(mode, () => {
  error.value = ""
  showPassword.value = false
  showConfirm.value = false
})

function validate(): boolean {
  const name = username.value.trim()
  const pass = password.value
  if (!USERNAME_RE.test(name)) {
    error.value = t("auth.errorUsernameFormat")
    return false
  }
  if (!PASSWORD_RE.test(pass)) {
    error.value = t("auth.errorPasswordFormat")
    return false
  }
  if (mode.value === "register" && pass !== confirm.value) {
    error.value = t("auth.errorConfirm")
    return false
  }
  return true
}

async function submit() {
  error.value = ""
  if (!validate()) return

  const name = username.value.trim()
  const pass = password.value
  loading.value = true
  try {
    if (mode.value === "login") {
      await auth.login(name, pass)
      toast.success(t("auth.toastLoginSuccess", { name }))
    } else {
      await auth.register(name, pass)
      toast.success(t("auth.toastRegisterSuccess", { name }))
    }
    await router.replace(redirectTo.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("auth.errorGeneric")
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <p class="eyebrow">{{ t("auth.eyebrow") }}</p>
      <h1 class="display title">{{ mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle") }}</h1>
      <p class="hint">{{ mode === "login" ? t("auth.loginHint") : t("auth.registerHint") }}</p>

      <div class="tabs">
        <button type="button" class="tab" :class="{ active: mode === 'login' }" @click="mode = 'login'">
          {{ t("auth.tabLogin") }}
        </button>
        <button type="button" class="tab" :class="{ active: mode === 'register' }" @click="mode = 'register'">
          {{ t("auth.tabRegister") }}
        </button>
      </div>

      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span>{{ t("auth.username") }}</span>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            required
            minlength="3"
            maxlength="20"
            :placeholder="t('auth.usernamePlaceholder')"
          />
          <span class="rule">{{ t("auth.usernameRule") }}</span>
        </label>

        <label class="field">
          <span>{{ t("auth.password") }}</span>
          <div class="password-wrap">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              required
              minlength="6"
              maxlength="32"
              :placeholder="t('auth.passwordPlaceholder')"
            />
            <button
              type="button"
              class="eye-btn"
              :aria-label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <!-- eye / eye-off -->
              <svg v-if="!showPassword" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                <circle cx="12" cy="12" r="2.75" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.5 10.6a2.75 2.75 0 0 0 3.9 3.9M7 7.4C4.6 8.8 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.4 0 2.7-.3 3.8-.8M14.1 6.3A10 10 0 0 1 12 5.5C6 5.5 2.5 12 2.5 12" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12a4.5 4.5 0 0 0-.4-1.8" />
              </svg>
            </button>
          </div>
          <span class="rule">{{ t("auth.passwordRule") }}</span>
        </label>

        <label v-if="mode === 'register'" class="field">
          <span>{{ t("auth.confirmPassword") }}</span>
          <div class="password-wrap">
            <input
              v-model="confirm"
              :type="showConfirm ? 'text' : 'password'"
              autocomplete="new-password"
              required
              minlength="6"
              maxlength="32"
            />
            <button
              type="button"
              class="eye-btn"
              :aria-label="showConfirm ? t('auth.hidePassword') : t('auth.showPassword')"
              :aria-pressed="showConfirm"
              @click="showConfirm = !showConfirm"
            >
              <svg v-if="!showConfirm" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                <circle cx="12" cy="12" r="2.75" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.5 10.6a2.75 2.75 0 0 0 3.9 3.9M7 7.4C4.6 8.8 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.4 0 2.7-.3 3.8-.8M14.1 6.3A10 10 0 0 1 12 5.5C6 5.5 2.5 12 2.5 12" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12a4.5 4.5 0 0 0-.4-1.8" />
              </svg>
            </button>
          </div>
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" class="submit" :disabled="loading">
          {{ loading ? t("auth.submitting") : mode === "login" ? t("auth.submitLogin") : t("auth.submitRegister") }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: calc(100vh - 4rem);
  display: grid;
  place-items: center;
  padding: 2rem var(--page-pad);
}
.auth-card {
  width: min(100%, 26rem);
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: rgba(18, 24, 34, 0.88);
  padding: 1.75rem 1.5rem 1.5rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
}
.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
}
.title {
  margin: 0.55rem 0 0;
  font-size: 1.75rem;
}
.hint {
  margin: 0.45rem 0 0;
  font-size: 0.875rem;
  color: var(--muted);
  line-height: 1.5;
}
.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  margin-top: 1.25rem;
  padding: 0.25rem;
  border-radius: 0.65rem;
  background: rgba(255, 255, 255, 0.04);
}
.tab {
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--muted);
  padding: 0.55rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.tab.active {
  background: rgba(232, 168, 124, 0.16);
  color: var(--text);
}
.form {
  display: grid;
  gap: 0.9rem;
  margin-top: 1.15rem;
}
.field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: var(--muted);
}
.field input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 0.55rem;
  background: rgba(0, 0, 0, 0.25);
  color: var(--text);
  padding: 0.65rem 0.75rem;
  font-size: 0.95rem;
  box-sizing: border-box;
}
.field input:focus {
  outline: none;
  border-color: rgba(232, 168, 124, 0.55);
}
.password-wrap {
  position: relative;
}
.password-wrap input {
  padding-right: 2.6rem;
}
.eye-btn {
  position: absolute;
  top: 50%;
  right: 0.35rem;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--muted);
  padding: 0;
  cursor: pointer;
}
.eye-btn:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
}
.rule {
  font-size: 0.72rem;
  color: rgba(148, 163, 184, 0.9);
  line-height: 1.35;
}
.error {
  margin: 0;
  font-size: 0.85rem;
  color: #f0a0a0;
}
.submit {
  margin-top: 0.25rem;
  border: 0;
  border-radius: 0.55rem;
  background: linear-gradient(145deg, var(--accent), var(--accent-strong));
  color: #1a120c;
  font-weight: 650;
  padding: 0.7rem 1rem;
  cursor: pointer;
}
.submit:disabled {
  opacity: 0.65;
  cursor: wait;
}
</style>
