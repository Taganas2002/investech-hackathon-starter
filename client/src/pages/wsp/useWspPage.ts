import { useEffect, useState } from "react"
import { fetchWspPage } from "../../services/wspApi.ts"

const cache = new Map<string, unknown>()

export function useWspPage<T>(path: string, offline: boolean) {
  const key = `${path}:${offline ? "off" : "live"}`
  const [data, setData] = useState<T | null>(() => (cache.get(key) as T) ?? null)
  const [loading, setLoading] = useState(!cache.has(key))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (cache.has(key)) {
      setData(cache.get(key) as T)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    void fetchWspPage<T>(path, offline)
      .then((payload) => {
        if (cancelled) return
        cache.set(key, payload)
        setData(payload)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Could not load this page.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [key, offline, path])

  return { data, loading, error }
}

export function clearWspCache() {
  cache.clear()
}
