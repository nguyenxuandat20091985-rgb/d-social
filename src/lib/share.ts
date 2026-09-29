export function postPublicUrl(postId: string, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origin}/p/${postId}`
}

export async function sharePost(opts: {
  postId: string
  text?: string | null
  author?: string | null
}) {
  const url = postPublicUrl(opts.postId)
  const title = opts.author ? `${opts.author} trên D Social` : 'D Social'
  const text = (opts.text || '').trim().slice(0, 120) || 'Xem bài viết trên D Social'

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url })
      return { ok: true as const, method: 'native' as const }
    } catch {
      // cancelled
    }
  }
  return { ok: false as const, method: 'fallback' as const, url }
}

export function facebookShareUrl(postId: string) {
  const u = encodeURIComponent(postPublicUrl(postId))
  return `https://www.facebook.com/sharer/sharer.php?u=${u}`
}

export function zaloShareUrl(postId: string) {
  const u = encodeURIComponent(postPublicUrl(postId))
  return `https://zalo.me/share?u=${u}`
}

export async function copyLink(postId: string) {
  const url = postPublicUrl(postId)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      return true
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = url
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch {
    return false
  }
}
