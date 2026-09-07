const blockedTerms = ['fuck', 'shit', 'địt', 'đụ', 'đm', 'dm', 'lồn', 'cặc']

export function moderateText(value: string) {
  const normalized = value.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const hit = blockedTerms.find(term => normalized.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
  return hit ? { allowed: false, reason: 'Nội dung chứa từ ngữ không phù hợp.' } : { allowed: true as const }
}
