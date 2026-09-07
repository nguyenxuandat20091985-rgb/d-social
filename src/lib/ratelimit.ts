type Entry = { count: number; windowStarted: number }
const store = new Map<string, Entry>()

export function allowAction(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const current = store.get(key)
  if (!current || now - current.windowStarted >= windowMs) {
    store.set(key, { count: 1, windowStarted: now })
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}

export const postRateLimit = (userId: string) => allowAction(`post:${userId}`, 5, 60_000)
export const commentRateLimit = (userId: string) => allowAction(`comment:${userId}`, 20, 60_000)
export const messageRateLimit = (userId: string) => allowAction(`message:${userId}`, 40, 60_000)
