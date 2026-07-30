<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { useI18n } from "vue-i18n"
import { useAuthStore } from "@/stores/auth"
import { useToastStore } from "@/stores/toast"

const USERNAME_RE = /^[\u4e00-\u9fffa-zA-Z0-9_]{3,20}$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{6,32}$/

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()
const router = useRouter()

const username = ref("")
const saving = ref(false)
const uploading = ref(false)
const error = ref("")
const fileInput = ref<HTMLInputElement | null>(null)

const currentPassword = ref("")
const newPassword = ref("")
const confirmPassword = ref("")
const showCurrent = ref(false)
const showNew = ref(false)

const initial = computed(() => {
  const name = auth.user?.username || "?"
  return name.slice(0, 1).toUpperCase()
})

const createdLabel = computed(() => {
  const raw = auth.user?.created_at
  if (!raw) return ""
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString()
})

function leaveProfile() {
  if (window.history.length > 1) router.back()
  else router.replace({ name: "landing" })
}

onMounted(() => {
  if (!auth.isLoggedIn) {
    router.replace({ name: "login", query: { redirect: "/profile" } })
    return
  }
  username.value = auth.user?.username || ""
})

async function saveProfile() {
  error.value = ""
  const name = username.value.trim()
  if (!USERNAME_RE.test(name)) {
    error.value = t("profile.errorUsername")
    return
  }

  const current = currentPassword.value
  const next = newPassword.value
  const confirm = confirmPassword.value
  const touchingPassword = Boolean(current || next || confirm)

  if (touchingPassword) {
    if (!current || !next || !confirm) {
      error.value = t("profile.errorPasswordIncomplete")
      return
    }
    if (!PASSWORD_RE.test(next)) {
      error.value = t("profile.errorPasswordRule")
      return
    }
    if (next !== confirm) {
      error.value = t("profile.errorPasswordMismatch")
      return
    }
    if (next === current) {
      error.value = t("profile.errorPasswordSame")
      return
    }
  }

  saving.value = true
  try {
    const usernameChanged = name !== (auth.user?.username || "")
    if (usernameChanged) await auth.updateProfile(name)
    if (touchingPassword) await auth.changePassword(current, next)
    if (!usernameChanged && !touchingPassword) {
      leaveProfile()
      return
    }
    toast.success(t("profile.toastSaved"))
    leaveProfile()
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("profile.errorGeneric")
  } finally {
    saving.value = false
  }
}

function pickAvatar() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""
  if (!file) return
  error.value = ""
  uploading.value = true
  try {
    const blob = await resizeImage(file, 256)
    await auth.uploadAvatar(blob, "avatar.jpg")
    toast.success(t("profile.toastAvatar"))
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("profile.errorGeneric")
  } finally {
    uploading.value = false
  }
}

async function removeAvatar() {
  error.value = ""
  uploading.value = true
  try {
    await auth.removeAvatar()
    toast.success(t("profile.toastAvatarRemoved"))
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("profile.errorGeneric")
  } finally {
    uploading.value = false
  }
}

/** 压缩为正方形 JPEG，减小上传体积 */
function resizeImage(file: File, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(t("profile.errorImageType")))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error(t("profile.errorGeneric")))
        return
      }
      const min = Math.min(img.width, img.height)
      const sx = (img.width - min) / 2
      const sy = (img.height - min) / 2
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error(t("profile.errorGeneric")))
          else resolve(blob)
        },
        "image/jpeg",
        0.88,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(t("profile.errorImageType")))
    }
    img.src = url
  })
}
</script>

<template>
  <div class="profile-page">
    <div class="profile-card">
      <p class="eyebrow">{{ t("profile.eyebrow") }}</p>
      <h1 class="display title">{{ t("profile.title") }}</h1>
      <p class="hint">{{ t("profile.subtitle") }}</p>

      <div class="avatar-block">
        <div class="avatar-preview">
          <img v-if="auth.user?.avatar_url" :src="auth.user.avatar_url" :alt="auth.displayName" />
          <span v-else class="avatar-fallback">{{ initial }}</span>
        </div>
        <div class="avatar-actions">
          <button type="button" class="btn" :disabled="uploading" @click="pickAvatar">
            {{ uploading ? t("profile.uploading") : t("profile.changeAvatar") }}
          </button>
          <button
            v-if="auth.user?.avatar_url"
            type="button"
            class="btn btn-ghost"
            :disabled="uploading"
            @click="removeAvatar"
          >
            {{ t("profile.removeAvatar") }}
          </button>
          <p class="rule">{{ t("profile.avatarRule") }}</p>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          class="sr-only"
          @change="onFileChange"
        />
      </div>

      <form class="form" @submit.prevent="saveProfile">
        <label class="field">
          <span>{{ t("profile.username") }}</span>
          <input
            v-model="username"
            type="text"
            maxlength="20"
            required
            autocomplete="username"
            :placeholder="t('profile.usernamePlaceholder')"
          />
          <span class="rule">{{ t("profile.usernameRule") }}</span>
        </label>

        <label v-if="createdLabel" class="field">
          <span>{{ t("profile.createdAt") }}</span>
          <input :value="createdLabel" type="text" disabled />
        </label>

        <div class="password-block">
          <h2 class="section-title">{{ t("profile.passwordTitle") }}</h2>
          <p class="section-hint">{{ t("profile.passwordHint") }}</p>

          <label class="field">
            <span>{{ t("profile.currentPassword") }}</span>
            <div class="password-wrap">
              <input
                v-model="currentPassword"
                :type="showCurrent ? 'text' : 'password'"
                autocomplete="current-password"
                maxlength="32"
              />
              <button
                type="button"
                class="eye-btn"
                :aria-label="showCurrent ? t('auth.hidePassword') : t('auth.showPassword')"
                :aria-pressed="showCurrent"
                @click="showCurrent = !showCurrent"
              >
                <svg v-if="!showCurrent" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
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

          <label class="field">
            <span>{{ t("profile.newPassword") }}</span>
            <div class="password-wrap">
              <input
                v-model="newPassword"
                :type="showNew ? 'text' : 'password'"
                autocomplete="new-password"
                maxlength="32"
                :placeholder="t('auth.passwordPlaceholder')"
              />
              <button
                type="button"
                class="eye-btn"
                :aria-label="showNew ? t('auth.hidePassword') : t('auth.showPassword')"
                :aria-pressed="showNew"
                @click="showNew = !showNew"
              >
                <svg v-if="!showNew" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
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

          <label class="field">
            <span>{{ t("profile.confirmPassword") }}</span>
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              maxlength="32"
            />
          </label>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" class="submit" :disabled="saving">
          {{ saving ? t("profile.saving") : t("profile.save") }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  min-height: calc(100vh - 4rem);
  display: grid;
  place-items: start center;
  padding: 2rem var(--page-pad) 3rem;
}
.profile-card {
  width: min(100%, 32rem);
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
.avatar-block {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-top: 1.35rem;
  padding: 1rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.18);
}
.avatar-preview {
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid rgba(232, 168, 124, 0.35);
  flex-shrink: 0;
  background: linear-gradient(145deg, var(--accent), var(--accent-strong));
}
.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.avatar-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #1a120c;
  font-weight: 700;
  font-size: 1.4rem;
}
.avatar-actions {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
}
.btn {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: rgba(232, 168, 124, 0.12);
  color: var(--accent);
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  width: fit-content;
}
.btn:hover:not(:disabled) {
  background: rgba(232, 168, 124, 0.2);
  color: var(--text);
}
.btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.btn-ghost {
  background: transparent;
  color: var(--muted);
  font-weight: 500;
}
.form {
  display: grid;
  gap: 0.9rem;
  margin-top: 1.25rem;
}
.password-block {
  display: grid;
  gap: 0.9rem;
  margin-top: 0.35rem;
  padding-top: 1.15rem;
  border-top: 1px solid var(--border);
}
.section-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
  color: var(--text);
}
.section-hint {
  margin: -0.35rem 0 0;
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.45;
}
.field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: var(--muted);
}
.field input {
  border: 1px solid var(--border);
  border-radius: 0.55rem;
  background: rgba(0, 0, 0, 0.25);
  color: var(--text);
  padding: 0.65rem 0.75rem;
  font-size: 0.95rem;
  width: 100%;
}
.field input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.field input:focus {
  outline: none;
  border-color: rgba(232, 168, 124, 0.55);
}
.password-wrap {
  position: relative;
  display: grid;
}
.password-wrap input {
  padding-right: 2.6rem;
}
.eye-btn {
  position: absolute;
  right: 0.45rem;
  top: 50%;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: var(--muted);
  padding: 0.25rem;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.eye-btn:hover {
  color: var(--text);
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
