/**
 * Best-effort per-instance rate limit (per IP + known action).
 * This is not a distributed limiter: serverless instances do not share buckets.
 * Use a shared store (for example, Redis) before relying on it for high traffic.
 */
const buckets = new Map()
let requestsSinceSweep = 0
const MAX_BUCKETS = 5000

const LIMITS = {
  post: { max: 8, windowMs: 60_000 },
  comment: { max: 30, windowMs: 60_000 },
  message: { max: 60, windowMs: 60_000 },
  default: { max: 40, windowMs: 60_000 },
}
const KNOWN_ACTIONS = new Set(['post', 'comment', 'message'])

function sweepExpired(now) {
  for (const [key, entry] of buckets) {
    if (now - entry.start >= entry.windowMs) buckets.delete(key)
  }
}

function allow(key, max, windowMs) {
  const now = Date.now()
  requestsSinceSweep += 1
  if (requestsSinceSweep >= 256 || buckets.size >= MAX_BUCKETS) {
    sweepExpired(now)
    requestsSinceSweep = 0
  }
  let entry = buckets.get(key)
  if (!entry || now - entry.start >= windowMs) {
    entry = { start: now, count: 0, windowMs }
    buckets.set(key, entry)
  }
  entry.count += 1
  return entry.count <= max
}

function clientIp(req) {
  // Vercel sets x-real-ip; prefer it over the client-supplied forwarding chain.
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.length) return realIp.trim()
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',').pop().trim()
  return req.socket?.remoteAddress || 'unknown'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const requestedAction = String((req.body && req.body.action) || 'default')
  const action = KNOWN_ACTIONS.has(requestedAction) ? requestedAction : 'default'
  const cfg = LIMITS[action]
  const ip = clientIp(req)
  const key = `${action}:${ip}`
  const ok = allow(key, cfg.max, cfg.windowMs)

  if (!ok) {
    return res.status(429).json({
      allowed: false,
      action,
      retry_after_ms: cfg.windowMs,
      message: 'Bạn thao tác quá nhanh, thử lại sau.',
    })
  }
  return res.status(200).json({ allowed: true, action })
}
