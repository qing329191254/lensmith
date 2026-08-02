import { defineStore } from "pinia"
import { computed, ref } from "vue"
import {
  changePasswordRequest,
  deleteAvatarRequest,
  fetchMe,
  loginRequest,
  registerRequest,
  updateProfileRequest,
  uploadAvatarRequest,
  type AuthUser,
} from "@/api/auth"

const STORAGE_KEY = "lensmith-auth-token"

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string>(localStorage.getItem(STORAGE_KEY) || "")
  const user = ref<AuthUser | null>(null)
  const bootstrapped = ref(false)

  const isLoggedIn = computed(() => Boolean(token.value && user.value))
  const displayName = computed(() => user.value?.username || "")

  function persistToken(value: string) {
    token.value = value
    if (value) localStorage.setItem(STORAGE_KEY, value)
    else localStorage.removeItem(STORAGE_KEY)
  }

  function applySession(accessToken: string, nextUser: AuthUser) {
    persistToken(accessToken)
    user.value = nextUser
  }

  function setUser(next: AuthUser) {
    user.value = next
  }

  async function bootstrap() {
    if (!token.value) {
      user.value = null
      bootstrapped.value = true
      return
    }
    try {
      user.value = await fetchMe(token.value)
    } catch {
      persistToken("")
      user.value = null
    } finally {
      bootstrapped.value = true
    }
  }

  async function login(
    username: string,
    password: string,
    captchaToken: string,
    captchaCode: string,
  ) {
    const data = await loginRequest(username, password, captchaToken, captchaCode)
    applySession(data.access_token, data.user)
    const { syncUserCloudData } = await import("@/lib/cloud-sync")
    await syncUserCloudData()
  }

  async function register(
    username: string,
    password: string,
    captchaToken: string,
    captchaCode: string,
  ) {
    const data = await registerRequest(username, password, captchaToken, captchaCode)
    applySession(data.access_token, data.user)
    const { syncUserCloudData } = await import("@/lib/cloud-sync")
    await syncUserCloudData()
  }

  async function updateProfile(username: string) {
    const next = await updateProfileRequest(username)
    setUser(next)
    return next
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await changePasswordRequest(currentPassword, newPassword)
  }

  async function uploadAvatar(file: Blob, filename?: string) {
    const next = await uploadAvatarRequest(file, filename)
    setUser(next)
    return next
  }

  async function removeAvatar() {
    const next = await deleteAvatarRequest()
    setUser(next)
    return next
  }

  function logout() {
    persistToken("")
    user.value = null
  }

  return {
    token,
    user,
    bootstrapped,
    isLoggedIn,
    displayName,
    bootstrap,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    uploadAvatar,
    removeAvatar,
    setUser,
  }
})
