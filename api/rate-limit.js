/**
 * Lightweight edge rate limit (per IP + action).
 * In-memory on the function instance — good enough for small/medium traffic.
 * Upgrade to Upstash Redis when scaling.
 */
const buckets = new Map()

const LIMITS = {
  post: { max: 8, windowMs: 60_000 },
  comment: { max: 30, windowMs: 60_000 },
  message: { max: 60, windowMs: 60_000 },
  default: { max: 40, windowMs: 60_000 },
}

function allow(key, max, windowMs) {
  const now = Date.now()
  let e = buckets.get(key)
  if (!e || now - e.start >= windowMs) {
    e = { start: now, count: 0 }
    buckets.set(key, e)
  }
  e.count += 1
  return e.count <= max
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim()
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = (req.body && req.body.action) || 'default'
  const cfg = LIMITS[action] || LIMITS.default
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
