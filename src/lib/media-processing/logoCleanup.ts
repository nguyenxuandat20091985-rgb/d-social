import { createWorker, type Worker as TesseractWorker } from 'tesseract.js'

export type LogoCandidate = {
  x: number
  y: number
  width: number
  height: number
  confidence: number
  text: string
  region: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

export type ClientImageCleanupResult = {
  blob: Blob
  width: number
  height: number
  candidates: LogoCandidate[]
  sha256: string
  engine: 'tesseract-corner-text-v1' | 'tesseract-plus-tiktok-color-v1'
}

export type CleanupOptions = {
  signal?: AbortSignal
  onProgress?: (progress: number, stage: string) => void
  minConfidence?: number
}

type CornerRegion = LogoCandidate['region']

/**
 * Lightweight TikTok-style watermark hint detector. It looks for compact cyan/red
 * chroma clusters in the four outer corners; it is a heuristic, not a general logo model.
 */
function detectTikTokColorMarks(canvas: HTMLCanvasElement): LogoCandidate[] {
  const regions: Array<{ region: CornerRegion; sx: number; sy: number }> = [
    { region: 'top-left', sx: 0, sy: 0 },
    { region: 'top-right', sx: 1, sy: 0 },
    { region: 'bottom-left', sx: 0, sy: 1 },
    { region: 'bottom-right', sx: 1, sy: 1 },
  ]
  const cornerWidth = Math.max(1, Math.round(canvas.width * 0.34))
  const cornerHeight = Math.max(1, Math.round(canvas.height * 0.26))
  const scale = Math.min(1, 480 / cornerWidth, 480 / cornerHeight)
  const sample = document.createElement('canvas')
  sample.width = Math.max(1, Math.round(cornerWidth * scale))
  sample.height = Math.max(1, Math.round(cornerHeight * scale))
  const ctx = sample.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  const output: LogoCandidate[] = []
  for (const corner of regions) {
    ctx.clearRect(0, 0, sample.width, sample.height)
    const x = corner.sx ? canvas.width - cornerWidth : 0
    const y = corner.sy ? canvas.height - cornerHeight : 0
    ctx.drawImage(canvas, x, y, cornerWidth, cornerHeight, 0, 0, sample.width, sample.height)
    const { data, width, height } = ctx.getImageData(0, 0, sample.width, sample.height)
    const active = new Uint8Array(width * height)
    let count = 0, minX = width, minY = height, maxX = -1, maxY = -1
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const i = (py * width + px) * 4
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const cyan = g > 105 && b > 115 && r < 135 && Math.max(g, b) - r > 45
        const red = r > 145 && r > g * 1.35 && r > b * 1.2 && g < 135
        if (!cyan && !red) continue
        active[py * width + px] = 1
        count++
        minX = Math.min(minX, px); minY = Math.min(minY, py)
        maxX = Math.max(maxX, px); maxY = Math.max(maxY, py)
      }
    }
    if (count < 7 || maxX < minX || maxY < minY) continue
    const bw = maxX - minX + 1, bh = maxY - minY + 1
    const area = bw * bh
    const density = count / area
    // Reject broad colorful scenery; watermark accents should form a compact cluster.
    if (bw > width * 0.30 || bh > height * 0.42 || area > width * height * 0.12 || density < 0.012) continue
    const originalX = x + minX / scale
    const originalY = y + minY / scale
    output.push({
      x: Math.max(0, Math.floor(originalX - 3 / scale)),
      y: Math.max(0, Math.floor(originalY - 3 / scale)),
      width: Math.min(canvas.width - Math.max(0, Math.floor(originalX - 3 / scale)), Math.ceil(bw / scale + 6 / scale)),
      height: Math.min(canvas.height - Math.max(0, Math.floor(originalY - 3 / scale)), Math.ceil(bh / scale + 6 / scale)),
      confidence: Math.min(72, 35 + Math.round(density * 100)),
      text: 'TikTok-style color mark (heuristic)',
      region: corner.region,
    })
  }
  return output
}

/**
 * Conservative client-side image cleanup for text-like marks in the four corners.
 *
 * This is not a universal logo detector: icon-only, animated, translucent and
 * centrally placed marks are outside its detection coverage. Callers must not
 * interpret zero candidates as proof that media is logo-free.
 */
export async function cleanupCornerTextFromImage(
  file: File,
  options: CleanupOptions = {},
): Promise<ClientImageCleanupResult> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    throw new Error('Bộ xử lý trên thiết bị hiện chỉ nhận ảnh JPEG, PNG hoặc WebP.')
  }
  if (file.size < 1 || file.size > 8 * 1024 * 1024) {
    throw new Error('Ảnh phải có dung lượng từ 1 byte đến 8 MB.')
  }
  if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')

  let worker: TesseractWorker | undefined
  let bitmap: ImageBitmap | undefined
  try {
    options.onProgress?.(5, 'Đang đọc ảnh trên thiết bị…')
    bitmap = await createImageBitmap(file)
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > 16_000_000) {
      throw new Error('Kích thước ảnh vượt giới hạn xử lý an toàn.')
    }
    if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')

    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: false })
    if (!context) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh trên thiết bị.')
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    bitmap = undefined

    options.onProgress?.(15, 'Đang khởi tạo bộ đọc chữ…')
    worker = await createWorker('eng+vie', 1, {
      logger: event => {
        if (event.status === 'recognizing text' && typeof event.progress === 'number') {
          options.onProgress?.(15 + Math.round(event.progress * 45), 'Đang tìm chữ/logo ở mép ảnh…')
        }
      },
    })
    if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')

    const terminateOnAbort = () => { void worker?.terminate() }
    options.signal?.addEventListener('abort', terminateOnAbort, { once: true })
    type OcrWord = { text?: string; confidence?: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
    type OcrPageShape = {
      words?: OcrWord[]
      blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: OcrWord[] }> }> }>
    }
    const extractWords = (value: unknown): OcrWord[] => {
      const page = value as OcrPageShape
      return page.words ?? page.blocks?.flatMap(block =>
        block.paragraphs?.flatMap(paragraph =>
          paragraph.lines?.flatMap(line => line.words ?? []) ?? [],
        ) ?? [],
      ) ?? []
    }

    // Crop and magnify all four corners: TikTok marks can be faint and blend into the background.
    const cornerWidth = Math.max(1, Math.round(canvas.width * 0.34))
    const cornerHeight = Math.max(1, Math.round(canvas.height * 0.26))
    const scale = 2.5
    const corners: Array<{ region: LogoCandidate['region']; x: number; y: number }> = [
      { region: 'top-left', x: 0, y: 0 },
      { region: 'top-right', x: canvas.width - cornerWidth, y: 0 },
      { region: 'bottom-left', x: 0, y: canvas.height - cornerHeight },
      { region: 'bottom-right', x: canvas.width - cornerWidth, y: canvas.height - cornerHeight },
    ]
    const candidates: LogoCandidate[] = []
    const minConfidence = options.minConfidence ?? 28

    for (let index = 0; index < corners.length; index++) {
      if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')
      const corner = corners[index]
      const crop = document.createElement('canvas')
      crop.width = Math.max(1, Math.round(cornerWidth * scale))
      crop.height = Math.max(1, Math.round(cornerHeight * scale))
      const cropContext = crop.getContext('2d', { willReadFrequently: true })
      if (!cropContext) throw new Error('Không tạo được vùng góc ảnh để OCR.')
      cropContext.filter = 'grayscale(1) contrast(2.2) brightness(1.12)'
      cropContext.drawImage(
        canvas,
        corner.x, corner.y, cornerWidth, cornerHeight,
        0, 0, crop.width, crop.height,
      )

      // Keep both the grayscale/contrast crop and a binary variant for OCR comparison.
      const enhancedCrop = document.createElement('canvas')
      enhancedCrop.width = crop.width
      enhancedCrop.height = crop.height
      const enhancedContext = enhancedCrop.getContext('2d')
      if (!enhancedContext) throw new Error('Không tạo được ảnh tăng tương phản để OCR.')
      enhancedContext.drawImage(crop, 0, 0)

      // Add a high-contrast binary variant for translucent text over busy backgrounds.
      const pixels = cropContext.getImageData(0, 0, crop.width, crop.height)
      for (let p = 0; p < pixels.data.length; p += 4) {
        const luminance = pixels.data[p] * 0.299 + pixels.data[p + 1] * 0.587 + pixels.data[p + 2] * 0.114
        const value = luminance > 158 ? 255 : 0
        pixels.data[p] = value
        pixels.data[p + 1] = value
        pixels.data[p + 2] = value
      }
      cropContext.putImageData(pixels, 0, 0)

      options.onProgress?.(20 + Math.round((index / corners.length) * 45), 'Đang quét OCR và tăng tương phản 4 góc ảnh…')
      const recognizedPasses = await Promise.all([
        worker.recognize(enhancedCrop),
        worker.recognize(crop),
      ])
      for (const recognized of recognizedPasses) {
      for (const word of extractWords(recognized.data)) {
        const text = word.text?.trim()
        const confidence = Number(word.confidence)
        if (!text || !Number.isFinite(confidence) || confidence < minConfidence) continue
        const x0 = corner.x + word.bbox.x0 / scale
        const y0 = corner.y + word.bbox.y0 / scale
        const x1 = corner.x + word.bbox.x1 / scale
        const y1 = corner.y + word.bbox.y1 / scale
        const width = x1 - x0
        const height = y1 - y0
        if (width < 2 || height < 2 || width > canvas.width * 0.30 || height > canvas.height * 0.10) continue
        if (candidates.some(candidate => candidate.region === corner.region && candidate.text.toLowerCase() === text.toLowerCase() && Math.abs(candidate.x - x0) < 8 && Math.abs(candidate.y - y0) < 8)) continue
        candidates.push({
          x: Math.max(0, Math.round(x0)),
          y: Math.max(0, Math.round(y0)),
          width: Math.min(canvas.width - Math.max(0, Math.round(x0)), Math.max(1, Math.round(width))),
          height: Math.min(canvas.height - Math.max(0, Math.round(y0)), Math.max(1, Math.round(height))),
          confidence,
          text,
          region: corner.region,
        })
      }
      }
    }

    if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')
    let usedColorHeuristic = false
    if (candidates.length === 0) {
      const colorCandidates = detectTikTokColorMarks(canvas)
      if (colorCandidates.length) {
        candidates.push(...colorCandidates)
        usedColorHeuristic = true
      }
    }
    if (candidates.length === 0) {
      throw new Error('OCR và bộ dò màu TikTok ở 4 góc chưa tìm được vùng đủ tin cậy. Đây không phải kết luận ảnh sạch; hãy tô vùng logo thủ công.')
    }

    options.onProgress?.(68, usedColorHeuristic ? 'Đã tìm thấy cụm màu giống dấu TikTok; đang xử lý vùng nghi vấn…' : 'Đang che các vùng chữ nghi là logo…')
    for (const candidate of candidates) {
      const pad = Math.max(3, Math.round(Math.max(candidate.width, candidate.height) * 0.22))
      const x = Math.max(0, candidate.x - pad)
      const y = Math.max(0, candidate.y - pad)
      const width = Math.min(canvas.width - x, candidate.width + pad * 2)
      const height = Math.min(canvas.height - y, candidate.height + pad * 2)
      // Blur only the bounded OCR box; do not claim semantic inpainting.
      const patch = document.createElement('canvas')
      patch.width = Math.max(1, width)
      patch.height = Math.max(1, height)
      const patchContext = patch.getContext('2d')
      if (!patchContext) throw new Error('Không tạo được vùng xử lý ảnh.')
      patchContext.filter = 'blur(7px)'
      patchContext.drawImage(canvas, x, y, width, height, 0, 0, width, height)
      context.save()
      context.filter = 'none'
      context.drawImage(patch, x, y)
      context.restore()
    }

    options.onProgress?.(88, 'Đang xuất và kiểm tra ảnh đã xử lý…')
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Không xuất được ảnh đã xử lý.')), outputType, 0.94)
    })
    if (!blob.size || blob.size > 12 * 1024 * 1024) {
      throw new Error('Kết quả ảnh không hợp lệ hoặc vượt giới hạn dung lượng.')
    }
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
    options.onProgress?.(100, 'Đã xử lý ảnh dạng chữ ở góc')
    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      candidates,
      sha256,
      engine: usedColorHeuristic ? 'tesseract-plus-tiktok-color-v1' : 'tesseract-corner-text-v1',
    }
  } finally {
    bitmap?.close()
    if (worker) await worker.terminate()
  }
}
