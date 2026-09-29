/** Client-side first-pass filter. Server RLS + admin AI is the second pass. */
const blockedTerms = [
  'fuck', 'shit', 'địt', 'đụ', 'đm', 'dm', 'lồn', 'cặc', 'đjt', 'djt',
  'lừa đảo', 'lua dao', 'hack acc', 'sex video', 'porn', 'xxx',
]

const spamPatterns = [
  /(.)\1{8,}/i,
  /(https?:\/\/\S+\s*){5,}/i,
  /(zalo|telegram|whatsapp)\s*[:.]?\s*\+?\d{8,}/i,
]

export function moderateText(value: string) {
  const raw = (value || '').trim()
  if (!raw) return { allowed: true as const }
  if (raw.length > 4000) return { allowed: false, reason: 'Nội dung quá dài.' }

  const normalized = raw
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const hit = blockedTerms.find(term =>
    normalized.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
  )
  if (hit) return { allowed: false, reason: 'Nội dung chứa từ ngữ không phù hợp với cộng đồng văn minh.' }

  for (const re of spamPatterns) {
    if (re.test(raw)) return { allowed: false, reason: 'Nội dung có dấu hiệu spam / quảng cáo lặp.' }
  }
  return { allowed: true as const }
}

export function scoreCivility(value: string): number {
  const mod = moderateText(value)
  if (!mod.allowed) return 0
  let score = 100
  if ((value.match(/https?:\/\//g) || []).length > 2) score -= 20
  if (value.length < 8) score -= 10
  return Math.max(0, score)
}
