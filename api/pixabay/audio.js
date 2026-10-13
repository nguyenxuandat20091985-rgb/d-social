// Audio search proxy with built-in, openly licensed fallback tracks.
// Pixabay's public API documents images/videos, not audio; never require an undocumented endpoint.
// Keep attribution/license metadata visible in the editor for third-party tracks.
const CACHE_TTL = 24 * 60 * 60 * 1000
let cache = { expiresAt: 0, key: '', value: null }

const BUILT_IN_TRACKS = [
  { id: 'builtin-chill-beat', title: 'Chill Beat · Lo-fi', artist: 'Maddy · CC0 (Public Domain)', duration: 96, previewUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Chill_Beat.ogg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Chill_Beat.ogg', tags: 'chill lofi beat tiktok chillout' },
  { id: 'builtin-piano-beat', title: 'Piano and Beat · Chill', artist: 'Wiki Learning Tec de Monterrey · CC BY-SA 4.0', duration: 295, previewUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Piano_and_beat.ogg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Piano_and_beat.ogg', tags: 'piano chill beat lofi' },
  { id: 'builtin-night-piano', title: 'Night on the Docks · Piano Jazz', artist: 'Kevin MacLeod · CC BY 3.0', duration: 174, previewUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Night_on_the_Docks_-_Piano_%28ISRC_USUAN1100135%29.mp3', pageUrl: 'https://commons.wikimedia.org/wiki/File:Night_on_the_Docks_-_Piano_%28ISRC_USUAN1100135%29.mp3', tags: 'piano jazz chill relaxed' },
  { id: 'builtin-ambiment', title: 'Ambiment · Ambient Piano', artist: 'Kevin MacLeod · CC BY 3.0', duration: 1373, previewUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Ambiment_%28ISRC_USUAN1100630%29.mp3', pageUrl: 'https://commons.wikimedia.org/wiki/File:Ambiment_%28ISRC_USUAN1100630%29.mp3', tags: 'ambient piano calm chill meditation' },
  { id: 'builtin-emotional-piano', title: 'Emotional Piano · Piano Solo', artist: 'Kamil-b · CC0 (Public Domain)', duration: 16, previewUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Emotional_piano.wav', pageUrl: 'https://commons.wikimedia.org/wiki/File:Emotional_piano.wav', tags: 'piano emotional sad romantic' },
  { id: 'builtin-long-dark', title: 'The Long Dark · Ambient Piano', artist: 'Scott Buckley · CC BY 4.0', duration: 440, previewUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Scott_Buckley_%E2%80%93_The_Long_Dark_%28Ambient_Neoclassical_Piano%29.ogg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Scott_Buckley_%E2%80%93_The_Long_Dark_%28Ambient_Neoclassical_Piano%29.ogg', tags: 'ambient piano cinematic calm chill' }
]

function getBuiltInTracks(q = '') {
  const query = String(q).trim().toLocaleLowerCase()
  const tracks = BUILT_IN_TRACKS.filter(track =>
    !query || (track.title + ' ' + track.artist + ' ' + track.tags).toLocaleLowerCase().includes(query)
  )
  return { source: 'built-in', total: tracks.length, hits: tracks.map(({ tags, ...track }) => track) }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')
  res.setHeader('Vary', 'Accept')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const q = String(req.query.q || '').trim().slice(0, 100)
  const page = Math.max(1, Math.min(50, Number.parseInt(req.query.page || '1', 10) || 1))
  const order = req.query.order === 'latest' ? 'latest' : 'popular'
  const cacheKey = [q.toLocaleLowerCase(), page, order].join('|')
  if (cache.value && cache.key === cacheKey && cache.expiresAt > Date.now()) return res.status(200).json(cache.value)

  const apiKey = process.env.PIXABAY_API_KEY
  const endpoint = process.env.PIXABAY_AUDIO_API_URL

  // Do not block music selection on an undocumented Pixabay Audio API.
  // Built-in tracks remain available even if no API key/endpoint is configured.
  if (!apiKey || !endpoint) {
    const result = getBuiltInTracks(q)
    cache = { key: cacheKey, value: result, expiresAt: Date.now() + CACHE_TTL }
    return res.status(200).json(result)
  }

  try {
    const url = new URL(endpoint)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('q', q)
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', '20')
    url.searchParams.set('order', order)
    const upstream = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
    if (!upstream.ok) {
      const result = getBuiltInTracks(q)
      cache = { key: cacheKey, value: result, expiresAt: Date.now() + CACHE_TTL }
      return res.status(200).json(result)
    }
    const body = await upstream.json()
    const hits = Array.isArray(body.hits) ? body.hits : Array.isArray(body.tracks) ? body.tracks : []
    const normalized = hits.slice(0, 20).map(hit => ({
      id: String(hit.id ?? hit.audio_id ?? ''),
      title: String(hit.title ?? hit.name ?? hit.tags ?? 'Audio track').slice(0, 160),
      artist: String(hit.user ?? hit.artist ?? 'Audio contributor').slice(0, 100),
      duration: Number(hit.duration ?? 0),
      previewUrl: hit.previewURL ?? hit.preview_url ?? hit.audio ?? hit.url ?? null,
      pageUrl: hit.pageURL ?? hit.page_url ?? 'https://pixabay.com/'
    })).filter(hit => hit.id && hit.previewUrl)
    const result = normalized.length
      ? { source: 'pixabay', total: Number(body.totalHits ?? body.total ?? normalized.length), hits: normalized }
      : getBuiltInTracks(q)
    cache = { key: cacheKey, value: result, expiresAt: Date.now() + CACHE_TTL }
    return res.status(200).json(result)
  } catch {
    const result = getBuiltInTracks(q)
    cache = { key: cacheKey, value: result, expiresAt: Date.now() + CACHE_TTL }
    return res.status(200).json(result)
  }
}
