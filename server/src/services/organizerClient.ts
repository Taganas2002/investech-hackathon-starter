import axios from "axios"

/**
 * TONIGHT: set ORGANIZER_API_URL and ORGANIZER_API_KEY in server/.env.
 * Paths appended to that URL are defined in routes/organizer.ts.
 */
export function isProxyConfigured(): boolean {
  return Boolean(process.env.ORGANIZER_API_URL?.trim())
}

export async function fetchOrganizer(path: string): Promise<unknown> {
  const base = process.env.ORGANIZER_API_URL?.trim()
  if (!base) throw new Error("ORGANIZER_API_URL is not set")

  const url = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`)
  const key = process.env.ORGANIZER_API_KEY?.trim()
  const headerName = process.env.ORGANIZER_AUTH_HEADER?.trim() || "Authorization"
  const scheme = process.env.ORGANIZER_AUTH_SCHEME?.trim() ?? "Bearer"
  const headers: Record<string, string> = {}
  if (key) headers[headerName] = scheme ? `${scheme} ${key}` : key

  const response = await axios.get(url.toString(), {
    headers,
    timeout: 12000,
  })
  return response.data
}

export function publicError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : "Proxy request failed."
  }
  const status = error.response?.status
  const data = error.response?.data
  let detail = ""
  if (typeof data === "string") detail = data.slice(0, 300)
  else if (data && typeof data === "object" && "error" in data) {
    detail = String((data as { error: unknown }).error).slice(0, 300)
  }
  if (!status) return "Could not reach the organizer API."
  return detail ? `Organizer API returned ${status}. ${detail}` : `Organizer API returned ${status}.`
}
