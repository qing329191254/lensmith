/** 认证相关 API：`/api/auth/*` */

export type AuthUser = {
  id: number
  username: string
  avatar_url?: string | null
  created_at?: string | null
}

export type CaptchaResponse = {
  captcha_token: string
  image: string
}

export type TokenResponse = {
  access_token: string
  token_type: string
  user: AuthUser
}

async function parseAuthJson(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      (data as { detail?: string | Array<{ msg?: string }> }).detail ||
      (data as { error?: string }).error ||
      res.statusText
    if (typeof message === "string") throw new Error(message)
    if (Array.isArray(message)) {
      throw new Error(message.map((m) => m.msg || JSON.stringify(m)).join("; ") || "Request failed")
    }
    throw new Error("Request failed")
  }
  return data
}

function authHeaders(token?: string): Headers {
  const headers = new Headers()
  const auth = token || localStorage.getItem("lensmith-auth-token") || ""
  if (auth) headers.set("Authorization", `Bearer ${auth}`)
  return headers
}

export async function fetchCaptcha(): Promise<CaptchaResponse> {
  const res = await fetch("/api/auth/captcha")
  return (await parseAuthJson(res)) as CaptchaResponse
}

export async function registerRequest(
  username: string,
  password: string,
  captchaToken: string,
  captchaCode: string,
): Promise<TokenResponse> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      captcha_token: captchaToken,
      captcha_code: captchaCode,
    }),
  })
  return (await parseAuthJson(res)) as TokenResponse
}

export async function loginRequest(
  username: string,
  password: string,
  captchaToken: string,
  captchaCode: string,
): Promise<TokenResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      captcha_token: captchaToken,
      captcha_code: captchaCode,
    }),
  })
  return (await parseAuthJson(res)) as TokenResponse
}

export async function fetchMe(token?: string): Promise<AuthUser> {
  const res = await fetch("/api/auth/me", { headers: authHeaders(token) })
  return (await parseAuthJson(res)) as AuthUser
}

export async function updateProfileRequest(username: string): Promise<AuthUser> {
  const headers = authHeaders()
  headers.set("Content-Type", "application/json")
  const res = await fetch("/api/auth/profile", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ username }),
  })
  return (await parseAuthJson(res)) as AuthUser
}

export async function changePasswordRequest(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const headers = authHeaders()
  headers.set("Content-Type", "application/json")
  const res = await fetch("/api/auth/password", {
    method: "POST",
    headers,
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  })
  await parseAuthJson(res)
}

export async function uploadAvatarRequest(file: Blob, filename = "avatar.jpg"): Promise<AuthUser> {
  const form = new FormData()
  form.append("file", file, filename)
  const res = await fetch("/api/auth/avatar", {
    method: "POST",
    headers: authHeaders(),
    body: form,
  })
  return (await parseAuthJson(res)) as AuthUser
}

export async function deleteAvatarRequest(): Promise<AuthUser> {
  const res = await fetch("/api/auth/avatar", {
    method: "DELETE",
    headers: authHeaders(),
  })
  return (await parseAuthJson(res)) as AuthUser
}
