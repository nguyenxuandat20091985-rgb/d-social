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
  engine: 'tesseract-corner-text-v1'
}

export type CleanupOptions = {
  signal?: AbortSignal
  onProgress?: (progress: number, stage: string) => void
  minConfidence?: number
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
    let result
    let bottomRightResult
    try {
      // First pass: improve local contrast without changing the output image.
      const enhanced = document.createElement('canvas')
      enhanced.width = canvas.width
      enhanced.height = canvas.height
      const enhancedContext = enhanced.getContext('2d')
      if (!enhancedContext) throw new Error('Không tạo được ảnh tăng tương phản để OCR.')
      enhancedContext.filter = 'grayscale(1) contrast(1.8) brightness(1.08)'
      enhancedContext.drawImage(canvas, 0, 0)
      result = await worker.recognize(enhanced)

      // Second pass: enlarge only the bottom-right corner where small TikTok marks commonly sit.
      const cornerWidth = Math.max(1, Math.round(canvas.width * 0.32))
      const cornerHeight = Math.max(1, Math.round(canvas.height * 0.24))
      const scale = 2
      const corner = document.createElement('canvas')
      corner.width = cornerWidth * scale
      corner.height = cornerHeight * scale
      const cornerContext = corner.getContext('2d')
      if (!cornerContext) throw new Error('Không tạo được vùng góc ảnh để OCR.')
      cornerContext.filter = 'grayscale(1) contrast(2) brightness(1.12)'
      cornerContext.drawImage(
        canvas,
        canvas.width - cornerWidth, canvas.height - cornerHeight, cornerWidth, cornerHeight,
        0, 0, corner.width, corner.height,
      )
      bottomRightResult = await worker.recognize(corner)
      ;(bottomRightResult as { __cornerScale?: number; __cornerWidth?: number; __cornerHeight?: number }).__cornerScale = scale
    } finally {
      options.signal?.removeEventListener('abort', terminateOnAbort)
    }
    if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')
    const minConfidence = options.minConfidence ?? 40
    const edgeX = Math.max(1, Math.round(canvas.width * 0.32))
    const edgeY = Math.max(1, Math.round(canvas.height * 0.24))
    const candidates: LogoCandidate[] = []

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
    const words = extractWords(result.data)
    const scale = 2
    const cornerWidth = Math.max(1, Math.round(canvas.width * 0.32))
    const cornerHeight = Math.max(1, Math.round(canvas.height * 0.24))
    for (const word of words) {
      const text = word.text?.trim()
      const confidence = Number(word.confidence)
      if (!text || confidence < minConfidence) continue
      const { x0, y0, x1, y1 } = word.bbox
      const width = x1 - x0
      const height = y1 - y0
      if (width < 2 || height < 2) continue

      let region: LogoCandidate['region'] | undefined
      if (x0 <= edgeX && y0 <= edgeY) region = 'top-left'
      else if (x1 >= canvas.width - edgeX && y0 <= edgeY) region = 'top-right'
      else if (x0 <= edgeX && y1 >= canvas.height - edgeY) region = 'bottom-left'
      else if (x1 >= canvas.width - edgeX && y1 >= canvas.height - edgeY) region = 'bottom-right'
      if (!region) continue

      // Ignore long blocks: broad text is more likely a caption than a corner mark.
      if (width > canvas.width * 0.30 || height > canvas.height * 0.10) continue
      candidates.push({
        x: Math.max(0, x0),
        y: Math.max(0, y0),
        width: Math.min(canvas.width - x0, width),
        height: Math.min(canvas.height - y0, height),
        confidence,
        text,
        region,
      })
    }

    // Map the enlarged bottom-right OCR boxes back to the original image coordinates.
    for (const word of extractWords(bottomRightResult?.data)) {
      const text = word.text?.trim()
      const confidence = Number(word.confidence)
      if (!text || confidence < minConfidence) continue
      const x0 = canvas.width - cornerWidth + word.bbox.x0 / scale
      const y0 = canvas.height - cornerHeight + word.bbox.y0 / scale
      const x1 = canvas.width - cornerWidth + word.bbox.x1 / scale
      const y1 = canvas.height - cornerHeight + word.bbox.y1 / scale
      const width = x1 - x0
      const height = y1 - y0
      if (width < 2 || height < 2 || width > canvas.width * 0.30 || height > canvas.height * 0.10) continue
      if (!candidates.some(candidate => candidate.region === 'bottom-right' && candidate.text.toLowerCase() === text.toLowerCase() && Math.abs(candidate.x - x0) < 8 && Math.abs(candidate.y - y0) < 8)) {
        candidates.push({ x: Math.max(0, x0), y: Math.max(0, y0), width, height, confidence, text, region: 'bottom-right' })
      }
    }

    if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')
    if (candidates.length === 0) {
      throw new Error('Không xác định chắc chắn được logo dạng chữ ở góc ảnh. Ảnh chưa được xác nhận đã xử lý; hãy dùng bộ xử lý dự phòng.')
    }

    options.onProgress?.(68, 'Đang che các vùng chữ nghi là logo…')
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
      engine: 'tesseract-corner-text-v1',
    }
  } finally {
    bitmap?.close()
    if (worker) await worker.terminate()
  }
}
