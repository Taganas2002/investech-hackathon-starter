import axios from "axios"

/** Optional production API host (e.g. Render). Leave empty in local Vite so /api is proxied. */
const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL?.trim() || undefined,
  timeout: 120000,
})

function offlineQuery(offline: boolean) {
  return offline ? "?offline=1" : ""
}

export async function getWspReady() {
  const response = await http.get("/api/wsp/ready")
  return response.data as { live: boolean; offlineAvailable: boolean }
}

export async function fetchWspPage<T>(path: string, offline: boolean): Promise<T> {
  const response = await http.get(`/api/wsp/${path}${offlineQuery(offline)}`)
  return response.data as T
}
