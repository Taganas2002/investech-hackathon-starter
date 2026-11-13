import axios from "axios"

const http = axios.create({ timeout: 120000 })

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
