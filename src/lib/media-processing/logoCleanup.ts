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
      const recognized = await worker.recognize(crop)
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
