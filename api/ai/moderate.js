/**
 * AI Admin assistant — first layer is deterministic civility rules.
 * Optional GROQ_API_KEY enables LLM second opinion (AgentFlow-compatible).
 */
const BLOCKED = ['fuck', 'shit', 'địt', 'đụ', 'lồn', 'cặc', 'lừa đảo', 'porn', 'xxx']
const SPAM = [/(.)\1{8,}/i, /(https?:\/\/\S+\s*){5,}/i]

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
    return m ? JSON.parse(m[0]) : null
  } catch {
    return null
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const text = (req.body && req.body.text) || ''
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' })

  const base = ruleScore(text)
  const llm = await groqOpinion(text)
  const result = llm
    ? {
        ...base,
        llm,
        action: base.action === 'hide' || llm.action === 'hide' ? 'hide' : llm.action || base.action,
        engine: process.env.GROQ_API_KEY ? 'rules+groq' : base.engine,
      }
    : base

  return res.status(200).json(result)
}
