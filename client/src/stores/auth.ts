import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { fetchMe, loginRequest, registerRequest, type AuthUser } from "@/api/auth"

const STORAGE_KEY = "lensmith-auth-token"

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string>(localStorage.getItem(STORAGE_KEY) || "")
  const user = ref<AuthUser | null>(null)
  const bootstrapped = ref(false)

  const isLoggedIn = computed(() => Boolean(token.value && user.value))

  function persistToken(value: string) {
    token.value = value
    if (value) localStorage.setItem(STORAGE_KEY, value)
    else localStorage.removeItem(STORAGE_KEY)
  }

  function applySession(accessToken: string, nextUser: AuthUser) {
    persistToken(accessToken)
    user.value = nextUser
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

  async function login(username: string, password: string) {
    const data = await loginRequest(username, password)
    applySession(data.access_token, data.user)
  }

  async function register(username: string, password: string) {
    const data = await registerRequest(username, password)
    applySession(data.access_token, data.user)
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
    bootstrap,
    login,
    register,
    logout,
  }
})
