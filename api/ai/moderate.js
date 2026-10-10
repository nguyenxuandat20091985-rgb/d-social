/**
 * AI moderation endpoint. Deterministic rules run first; Groq is optional.
 * The in-memory limiter is best-effort per serverless instance, not distributed.
 */
const BLOCKED = ['fuck', 'shit', 'địt', 'đụ', 'lồn', 'cặc', 'lừa đảo', 'porn', 'xxx']
const SPAM = [/(.)\1{8,}/i, /(https?:\/\/\S+\s*){5,}/i]
const MAX_TEXT_LENGTH = 4000
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 20
const MAX_BUCKETS = 5000
const buckets = new Map()
let requestsSinceSweep = 0

function requestIp(req) {
  const realIp = req.headers?.['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()
  const forwarded = req.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',').pop().trim()
  return req.socket?.remoteAddress || 'unknown'
}

function isRateLimited(ip) {
  const now = Date.now()
  requestsSinceSweep += 1
  if (requestsSinceSweep >= 256 || buckets.size >= MAX_BUCKETS) {
    for (const [key, entry] of buckets) {
      if (now - entry.start >= RATE_WINDOW_MS) buckets.delete(key)
    }
    requestsSinceSweep = 0
  }
  let entry = buckets.get(ip)
  if (!entry || now - entry.start >= RATE_WINDOW_MS) {
    entry = { start: now, count: 0 }
    buckets.set(ip, entry)
  }
  entry.count += 1
  return entry.count > RATE_MAX
}

function ruleScore(text = '') {
  const t = String(text).toLowerCase()
  const hits = BLOCKED.filter(w => t.includes(w))
  const spam = SPAM.some(re => re.test(text))
  let score = 100
  if (hits.length) score -= 60
  if (spam) score -= 40
  if (text.length > 3000) score -= 15
  const action = score < 40 ? 'hide' : score < 70 ? 'review' : 'allow'
  return {
    score: Math.max(0, score),
    action,
    reasons: [
      ...hits.map(h => `blocked_term:${h}`),
      ...(spam ? ['spam_pattern'] : []),
    ],
    engine: 'rules-v1',
  }
}

async function groqOpinion(text) {
  const key = process.env.GROQ_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'Bạn là AI admin mạng xã hội Việt Nam văn minh. Trả JSON: {"action":"allow|review|hide","reason":"..."} — không giải thích thêm.',
          },
          { role: 'user', content: text.slice(0, 1500) },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content || ''
    const m = raw.match(/\{[\s\S]*\}/)
    const parsed = m ? JSON.parse(m[0]) : null
    if (!parsed || !['allow', 'review', 'hide'].includes(parsed.action)) return null
    return { action: parsed.action, reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '' }
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ip = requestIp(req)
  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', String(RATE_WINDOW_MS / 1000))
    return res.status(429).json({ error: 'Too many moderation requests; try again later.' })
  }

  const text = req.body?.text
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text required' })
  if (text.length > MAX_TEXT_LENGTH) return res.status(413).json({ error: 'text too long', max_length: MAX_TEXT_LENGTH })

  const base = ruleScore(text)
  // Deterministic hard blocks need no external request and cannot be overridden by the LLM.
  if (base.action === 'hide') return res.status(200).json(base)

  const llm = await groqOpinion(text)
  const result = llm
    ? {
        ...base,
        llm,
        action: llm.action === 'hide' ? 'hide' : llm.action === 'review' ? 'review' : base.action,
        engine: process.env.GROQ_API_KEY ? 'rules+groq' : base.engine,
      }
    : base

  return res.status(200).json(result)
}
