/** 认证相关 API：`/api/auth/*` */

export type AuthUser = {
  id: number
  username: string
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

export async function registerRequest(username: string, password: string): Promise<TokenResponse> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  return (await parseAuthJson(res)) as TokenResponse
}

export async function loginRequest(username: string, password: string): Promise<TokenResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  return (await parseAuthJson(res)) as TokenResponse
}

export async function fetchMe(token?: string): Promise<AuthUser> {
  const headers = new Headers()
  const auth = token || localStorage.getItem("lensmith-auth-token") || ""
  if (auth) headers.set("Authorization", `Bearer ${auth}`)
  const res = await fetch("/api/auth/me", { headers })
  return (await parseAuthJson(res)) as AuthUser
}
