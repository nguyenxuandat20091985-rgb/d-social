import { createClient } from '@supabase/supabase-js'

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function isBot(ua) {
  return /bot|crawl|spider|slurp|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegram|zalo|discordbot|preview|embed|pinterest|bingpreview|googlebot|slackbot|redditbot|applebot/i.test(ua || '')
}

export default async function handler(req, res) {
  try {
    const postId = String(req.query?.id || '').trim()
    const origin = process.env.APP_URL || `https://${req.headers.host}`
    const ua = String(req.headers['user-agent'] || '')
    if (!/^[0-9a-f-]{36}$/i.test(postId)) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.end('<!doctype html><html><body>Not found</body></html>')
    }
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) {
      res.statusCode = 503
      return res.end('<!doctype html><html><body>Backend not configured</body></html>')
    }
    const admin = createClient(url, key)
    const { data: post, error } = await admin
      .from('posts')
      .select('id,content,media_url,media_type,is_published,profiles(username,full_name,avatar_url)')
      .eq('id', postId)
      .eq('is_published', true)
      .maybeSingle()
    if (error || !post) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.end('<!doctype html><html><body>Post not found</body></html>')
    }
    const author = post.profiles?.full_name || post.profiles?.username || 'D User'
    const title = `${author} trên D Social`
    const description = (post.content || '').trim().slice(0, 160) || (post.media_type === 'video' ? 'Video trên D Social' : 'Ảnh trên D Social')
    const image = (post.media_type === 'image' && post.media_url) ? post.media_url : (post.profiles?.avatar_url || `${origin}/favicon.ico`)
    const pageUrl = `${origin}/p/${post.id}`
    const meta = `<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<meta property="og:type" content="article"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:image" content="${esc(image)}"/>
<meta property="og:url" content="${esc(pageUrl)}"/>
<meta property="og:site_name" content="D Social Network"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(description)}"/>
<meta name="twitter:image" content="${esc(image)}"/>
<link rel="canonical" href="${esc(pageUrl)}"/>`
    if (isBot(ua)) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
      return res.end(`<!doctype html><html lang="vi"><head>${meta}</head><body><h1>${esc(title)}</h1><p>${esc(description)}</p><a href="${esc(pageUrl)}">Xem trên D Social</a></body></html>`)
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.end(`<!doctype html><html lang="vi"><head>${meta}<meta name="theme-color" content="#111827"/></head>
<body class="bg-slate-950 text-white">
<div id="root"></div>
<script>history.replaceState(null,'','/p/${post.id}');</script>
<script type="module">
(async()=>{try{const r=await fetch('/');const t=await r.text();const m=t.match(/src="(\\/assets\\/index-[^"]+\\.js)"/);if(m){const s=document.createElement('script');s.type='module';s.src=m[1];document.body.appendChild(s);return}}catch(e){}location.replace('/#/p/${post.id}');})();
</script>
<p style="padding:2rem;font-family:system-ui;color:#94a3b8">Đang mở bài viết…</p>
</body></html>`)
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.end('<!doctype html><html><body>Error</body></html>')
  }
}
