// Configurable provider wrapper. Configure IMAGE_TO_VIDEO_ENDPOINT and IMAGE_TO_VIDEO_API_KEY in Vercel.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const endpoint = process.env.IMAGE_TO_VIDEO_ENDPOINT, key = process.env.IMAGE_TO_VIDEO_API_KEY
  if (!endpoint || !key) return res.status(501).json({ error: 'AI server chưa cấu hình. Đặt IMAGE_TO_VIDEO_ENDPOINT và IMAGE_TO_VIDEO_API_KEY trong Vercel; Canvas mode vẫn dùng được.' })
  try {
    const contentType = String(req.headers['content-type'] || '')
    const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.slice(1).find(Boolean)
    if (!boundary) return res.status(400).json({ error: 'Thiếu multipart boundary.' })
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const raw = Buffer.concat(chunks).toString('latin1')
    const fields: Record<string,string> = {}
    let image: { data: Buffer; filename: string; mime: string } | null = null
    for (const part of raw.split('--' + boundary)) {
      const split = part.indexOf('\r\n\r\n')
      if (split < 0) continue
      const headers = part.slice(0, split)
      let payload = part.slice(split + 4)
      if (payload.endsWith('\r\n')) payload = payload.slice(0, -2)
      const name = headers.match(/name="([^"]+)"/i)?.[1]
      if (!name) continue
      const filename = headers.match(/filename="([^"]*)"/i)?.[1]
      if (filename !== undefined && name === 'image') {
        const mime = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'image/jpeg'
        image = { data: Buffer.from(payload, 'latin1'), filename: filename || 'image.jpg', mime }
      } else fields[name] = payload
    }
    if (!image?.data.length) return res.status(400).json({ error: 'Thiếu ảnh nguồn.' })
    if (image.data.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'Ảnh tối đa 20MB.' })
    const form = new FormData()
    form.append('image', new Blob([image.data], { type: image.mime }), image.filename)
    form.append('prompt', fields.prompt || 'Animate image with cinematic movement')
    form.append('preset', fields.preset || 'zoom-in')
    form.append('duration', fields.duration || '4')
    const upstream = await fetch(endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form })
    const body = await upstream.json().catch(() => ({}))
    if (!upstream.ok) return res.status(502).json({ error: body.error || body.message || 'Nhà cung cấp AI từ chối yêu cầu.' })
    if (!body.url) return res.status(502).json({ error: 'Provider cần trả JSON { url } của video đã tạo.' })
    return res.status(200).json({ url: body.url })
  } catch (e: any) { return res.status(500).json({ error: e?.message || 'Lỗi máy chủ AI.' }) }
}
