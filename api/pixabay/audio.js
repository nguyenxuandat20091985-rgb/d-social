// Server-side Pixabay proxy. Never expose PIXABAY_API_KEY to the browser.
// Pixabay's currently published public API docs cover images and videos, not audio.
// Set PIXABAY_AUDIO_API_URL only if Pixabay has enabled a documented audio endpoint for this account.
const CACHE_TTL = 24 * 60 * 60 * 1000
let cache = { expiresAt: 0, key: '', value: null }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')
  res.setHeader('Vary', 'Accept')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.PIXABAY_API_KEY
  const endpoint = process.env.PIXABAY_AUDIO_API_URL
  if (!apiKey) return res.status(503).json({ error: 'Thiếu biến môi trường PIXABAY_API_KEY trên Vercel.' })
  if (!endpoint) {
    return res.status(501).json({
      error: 'Pixabay chưa công bố Audio API trong tài liệu API công khai hiện tại. Chỉ cấu hình PIXABAY_AUDIO_API_URL khi tài khoản của anh có endpoint Audio được Pixabay xác nhận.',
      docs: 'https://pixabay.com/api/docs/'
    })
  }

  const q = String(req.query.q || '').trim().slice(0, 100)
  const page = Math.max(1, Math.min(50, Number.parseInt(req.query.page || '1', 10) || 1))
  const order = req.query.order === 'latest' ? 'latest' : 'popular'
  const cacheKey = [q.toLocaleLowerCase(), page, order].join('|')
  if (cache.value && cache.key === cacheKey && cache.expiresAt > Date.now()) return res.status(200).json(cache.value)

  try {
    const url = new URL(endpoint)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('q', q)
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', '20')
    url.searchParams.set('order', order)
    const upstream = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502
      return res.status(status).json({ error: upstream.status === 404
        ? 'Endpoint Audio không tồn tại hoặc chưa được cấp quyền cho tài khoản Pixabay này.'
        : 'Không lấy được thư viện âm thanh Pixabay. Vui lòng thử lại sau.' })
    }
    const body = await upstream.json()
    const hits = Array.isArray(body.hits) ? body.hits : Array.isArray(body.tracks) ? body.tracks : []
    const result = {
      total: Number(body.totalHits ?? body.total ?? hits.length),
      hits: hits.slice(0, 20).map(hit => ({
        id: String(hit.id ?? hit.audio_id ?? ''),
        title: String(hit.title ?? hit.name ?? hit.tags ?? 'Pixabay audio').slice(0, 160),
        artist: String(hit.user ?? hit.artist ?? 'Pixabay contributor').slice(0, 100),
        duration: Number(hit.duration ?? 0),
        previewUrl: hit.previewURL ?? hit.preview_url ?? hit.audio ?? hit.url ?? null,
        pageUrl: hit.pageURL ?? hit.page_url ?? 'https://pixabay.com/'
      })).filter(hit => hit.id && hit.previewUrl)
    }
    cache = { key: cacheKey, value: result, expiresAt: Date.now() + CACHE_TTL }
    return res.status(200).json(result)
  } catch (error) {
    return res.status(502).json({ error: 'Không kết nối được Pixabay Audio API.' })
  }
}
