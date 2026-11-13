import axios from "axios"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const MAX_IN_FLIGHT = 3
const here = dirname(fileURLToPath(import.meta.url))
/** Vercel functions are read-only except /tmp; use that on deploy. */
const CACHE_DIR = process.env.VERCEL
  ? join("/tmp", "onesheet-cache")
  : join(here, "../../.cache/onesheet")

type CacheEntry = { at: number; data: unknown }

const memory = new Map<string, CacheEntry>()
let active = 0
const queue: Array<() => void> = []

function apiKey(): string {
  return (process.env.ONESHEET_API_KEY || process.env.ORGANIZER_API_KEY || "").trim()
}

function baseUrl(): string {
  return (process.env.ORGANIZER_API_URL || "https://api.onesheet.pro/v1").replace(/\/$/, "")
}

export function onesheetConfigured(): boolean {
  return Boolean(apiKey())
}

export async function onesheetGet<T>(path: string, options?: { bypassCache?: boolean }): Promise<T> {
  const key = path
  if (!options?.bypassCache) {
    const cached = readCache(key)
    if (cached !== undefined) return cached as T
  }

  return limit(async () => {
    if (!options?.bypassCache) {
      const cached = readCache(key)
      if (cached !== undefined) return cached as T
    }
    const data = await requestWithRetry(path)
    writeCache(key, data)
    return data as T
  })
}

async function requestWithRetry(path: string): Promise<unknown> {
  const key = apiKey()
  if (!key) throw Object.assign(new Error("ONESHEET_API_KEY is not set"), { status: 503 })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await axios.get(`${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`, {
        headers: { "X-API-Key": key, Accept: "application/json" },
        timeout: 45000,
      })
      const body = response.data
      if (body && typeof body === "object" && "success" in body && body.success === false) {
        const message =
          body.error?.message ||
          (typeof body.error === "string" ? body.error : "Onesheet request failed")
        const status = body.error?.statusCode || 502
        throw Object.assign(new Error(message), { status })
      }
      return body && typeof body === "object" && "data" in body ? body.data : body
    } catch (error) {
      if (!axios.isAxiosError(error)) throw error
      const status = error.response?.status
      const retryAfter = Number(error.response?.headers?.["retry-after"])
      if ((status === 429 || status === 503) && attempt < 4) {
        await wait((Number.isFinite(retryAfter) ? retryAfter : attempt + 1) * 1000)
        continue
      }
      const payload = error.response?.data
      const message =
        payload?.error?.message ||
        (typeof payload?.error === "string" ? payload.error : error.message)
      throw Object.assign(new Error(message), { status: status || 502 })
    }
  }
  throw Object.assign(new Error("Onesheet request failed after retries"), { status: 502 })
}

function readCache(path: string): unknown | undefined {
  const mem = memory.get(path)
  if (mem && Date.now() - mem.at < CACHE_TTL_MS) return mem.data
  if (!ensureCacheDir()) return undefined
  const file = cacheFile(path)
  if (!existsSync(file)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CacheEntry
    if (Date.now() - parsed.at < CACHE_TTL_MS) {
      memory.set(path, parsed)
      return parsed.data
    }
  } catch {
    return undefined
  }
  return undefined
}

function writeCache(path: string, data: unknown) {
  const entry = { at: Date.now(), data }
  memory.set(path, entry)
  if (!ensureCacheDir()) return
  try {
    writeFileSync(cacheFile(path), JSON.stringify(entry))
  } catch {
    // Memory cache still works if disk is unavailable.
  }
}

function cacheFile(path: string) {
  const hash = createHash("sha1").update(path).digest("hex")
  return join(CACHE_DIR, `${hash}.json`)
}

function ensureCacheDir(): boolean {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
    return true
  } catch {
    return false
  }
}

function limit<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1
      work()
        .then(resolve, reject)
        .finally(() => {
          active -= 1
          queue.shift()?.()
        })
    }
    if (active < MAX_IN_FLIGHT) run()
    else queue.push(run)
  })
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function mapPool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => run()))
  return results
}
