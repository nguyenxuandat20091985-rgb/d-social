import { createWorker, type Worker as TesseractWorker } from 'tesseract.js'
import { detectHardwareProfile, type HardwareProfile } from './hardwareAdaptive'

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
  engine: 'paddleocr-ppocrv5-lama-v1' | 'tesseract-corner-text-lama-v1' | 'tesseract-plus-tiktok-color-lama-v1' | 'paddleocr-ppocrv5-fast-v1' | 'tesseract-corner-text-fast-v1' | 'weak-device-local-fallback-v1'
}

export type CleanupOptions = {
  signal?: AbortSignal
  onProgress?: (progress: number, stage: string) => void
  minConfidence?: number
  fastOnly?: boolean
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


async function detectWithPaddleOCR(file: File, width: number, height: number, options: CleanupOptions): Promise<LogoCandidate[]> {
  if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')
  options.onProgress?.(14, 'Đang khởi tạo PaddleOCR PP-OCRv5 trên Web Worker…')
  const worker = new Worker(new URL('./paddleocr.worker.ts', import.meta.url), { type: 'module', name: 'dsocial-paddleocr' })
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.terminate()
      options.signal?.removeEventListener('abort', abort)
    }
    const abort = () => { cleanup(); reject(new DOMException('Đã hủy xử lý ảnh.', 'AbortError')) }
    options.signal?.addEventListener('abort', abort, { once: true })
    worker.onerror = () => { cleanup(); reject(new Error('PaddleOCR Web Worker gặp lỗi.')) }
    worker.onmessage = (event: MessageEvent<{ id: string; type: string; progress?: number; stage?: string; candidates?: LogoCandidate[]; message?: string }>) => {
      const message = event.data
      if (!message || message.id !== id) return
      if (message.type === 'progress') {
        options.onProgress?.(Math.min(62, 14 + Math.round((message.progress ?? 0) * 0.48)), message.stage ?? 'PaddleOCR đang xử lý…')
      } else if (message.type === 'complete') {
        cleanup()
        resolve(message.candidates ?? [])
      } else if (message.type === 'error') {
        cleanup()
        reject(new Error(message.message || 'PaddleOCR không khởi chạy được.'))
      }
    }
    worker.postMessage({ id, file, width, height })
  })
}


async function inpaintCandidateBoxesWithLama(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  candidates: LogoCandidate[],
  options: CleanupOptions,
): Promise<void> {
  const worker = new Worker(new URL('./lama.worker.ts', import.meta.url), { type: 'module', name: 'dsocial-lama-auto-inpaint' })
  const signal = options.signal
  const abort = () => worker.terminate()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    for (let index = 0; index < candidates.length; index++) {
      if (signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')
      const candidate = candidates[index]
      const pad = Math.max(6, Math.round(Math.max(candidate.width, candidate.height) * 0.24))
      const x = Math.max(0, candidate.x - pad)
      const y = Math.max(0, candidate.y - pad)
      const right = Math.min(canvas.width, candidate.x + candidate.width + pad)
      const bottom = Math.min(canvas.height, candidate.y + candidate.height + pad)
      const outerPad = Math.max(48, Math.round(Math.max(right - x, bottom - y) * 0.85))
      const outerX = Math.max(0, x - outerPad)
      const outerY = Math.max(0, y - outerPad)
      const outerRight = Math.min(canvas.width, right + outerPad)
      const outerBottom = Math.min(canvas.height, bottom + outerPad)
      const patchWidth = outerRight - outerX
      const patchHeight = outerBottom - outerY
      if (patchWidth * patchHeight > 8_000_000) throw new Error('Vùng logo quá lớn để xử lý an toàn trên điện thoại.')
      const patchCanvas = document.createElement('canvas')
      patchCanvas.width = patchWidth
      patchCanvas.height = patchHeight
      const patchContext = patchCanvas.getContext('2d', { willReadFrequently: true })
      if (!patchContext) throw new Error('Không tạo được vùng ảnh cho LaMa.')
      patchContext.drawImage(canvas, outerX, outerY, patchWidth, patchHeight, 0, 0, patchWidth, patchHeight)
      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = patchWidth
      maskCanvas.height = patchHeight
      const maskContext = maskCanvas.getContext('2d')
      if (!maskContext) throw new Error('Không tạo được mask cho LaMa.')
      maskContext.fillStyle = '#fff'
      maskContext.fillRect(x - outerX, y - outerY, right - x, bottom - y)
      const maskPixels = maskContext.getImageData(0, 0, patchWidth, patchHeight)
      const mask = new Uint8Array(patchWidth * patchHeight)
      for (let i = 0, j = 0; i < maskPixels.data.length; i += 4, j++) if (maskPixels.data[i + 3] > 0) mask[j] = 1
      const pixels = patchContext.getImageData(0, 0, patchWidth, patchHeight)
      const id = crypto.randomUUID()
      const result = await new Promise<ArrayBuffer>((resolve, reject) => {
        const abortOne = () => reject(new DOMException('Đã hủy xử lý ảnh.', 'AbortError'))
        signal?.addEventListener('abort', abortOne, { once: true })
        worker.onmessage = (event: MessageEvent<{ id: string; type?: string; progress?: number; stage?: string; pixels?: ArrayBuffer; message?: string }>) => {
          const message = event.data
          if (message?.id !== id) return
          if (message.type === 'progress') {
            const overall = Math.round(((index + (message.progress ?? 0) / 100) / candidates.length) * 100)
            options.onProgress?.(68 + Math.round(overall * 0.29), 'LaMa ' + (index + 1) + '/' + candidates.length + ': ' + (message.stage ?? 'đang tái tạo nền…'))
          } else if (message.type === 'complete' && message.pixels) {
            signal?.removeEventListener('abort', abortOne)
            resolve(message.pixels)
          } else if (message.type === 'error') {
            signal?.removeEventListener('abort', abortOne)
            reject(new Error(message.message || 'LaMa không xử lý được vùng phát hiện.'))
          }
        }
        worker.onerror = () => {
          signal?.removeEventListener('abort', abortOne)
          reject(new Error('Web Worker LaMa gặp lỗi.'))
        }
        worker.postMessage({ id, width: patchWidth, height: patchHeight, pixels: pixels.data.buffer, mask: mask.buffer, patchMode: true }, [pixels.data.buffer, mask.buffer])
      })
      if (signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')
      context.putImageData(new ImageData(new Uint8ClampedArray(result), patchWidth, patchHeight), outerX, outerY)
    }
  } finally {
    signal?.removeEventListener('abort', abort)
    worker.terminate()
  }
}


async function inpaintCandidateBoxesFast(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  candidates: LogoCandidate[],
  options: CleanupOptions,
): Promise<void> {
  for (const candidate of candidates) {
    if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')
    const pad = Math.max(12, Math.round(Math.max(candidate.width, candidate.height) * 0.55))
    const x = Math.max(0, candidate.x - pad), y = Math.max(0, candidate.y - pad)
    const right = Math.min(canvas.width, candidate.x + candidate.width + pad)
    const bottom = Math.min(canvas.height, candidate.y + candidate.height + pad)
    const width = right - x, height = bottom - y
    if (width * height > 2_000_000) throw new Error('Vùng logo quá lớn cho chế độ nội suy nhanh; hãy tô vùng nhỏ hơn.')
    const patch = document.createElement('canvas')
    patch.width = width; patch.height = height
    const patchContext = patch.getContext('2d', { willReadFrequently: true })
    if (!patchContext) throw new Error('Không tạo được vùng ảnh nội suy.')
    patchContext.drawImage(canvas, x, y, width, height, 0, 0, width, height)
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = width; maskCanvas.height = height
    const maskContext = maskCanvas.getContext('2d')
    if (!maskContext) throw new Error('Không tạo được mask nội suy.')
    maskContext.fillStyle = '#fff'
    maskContext.fillRect(candidate.x - x, candidate.y - y, candidate.width, candidate.height)
    const maskPixels = maskContext.getImageData(0, 0, width, height)
    const mask = new Uint8Array(width * height)
    for (let i = 0, j = 0; i < maskPixels.data.length; i += 4, j++) if (maskPixels.data[i + 3]) mask[j] = 1
    const pixels = patchContext.getImageData(0, 0, width, height)
    const worker = new Worker(new URL('./inpaint.worker.ts', import.meta.url), { type: 'module', name: 'dsocial-fast-inpaint' })
    const id = crypto.randomUUID()
    try {
      const result = await new Promise<ArrayBuffer>((resolve, reject) => {
        let settled = false
        const finish = (error?: Error, pixels?: ArrayBuffer) => {
          if (settled) return
          settled = true
          clearTimeout(watchdog)
          options.signal?.removeEventListener('abort', abort)
          worker.terminate()
          if (error) reject(error)
          else if (pixels) resolve(pixels)
          else reject(new Error('Nội suy ảnh không trả kết quả.'))
        }
        const abort = () => finish(new DOMException('Đã hủy xử lý ảnh.', 'AbortError'))
        const watchdog = setTimeout(() => finish(new Error('Xử lý vùng ảnh quá lâu; hãy tô vùng nhỏ hơn hoặc thử ảnh nhẹ hơn.')), 5000)
        options.signal?.addEventListener('abort', abort, { once: true })
        worker.onmessage = (event: MessageEvent<{ id: string; pixels?: ArrayBuffer; error?: string }>) => {
          if (event.data?.id !== id) return
          if (event.data.error || !event.data.pixels) finish(new Error(event.data.error || 'Nội suy nhanh thất bại.'))
          else finish(undefined, event.data.pixels)
        }
        worker.onerror = () => finish(new Error('Worker nội suy nhanh gặp lỗi.'))
        worker.postMessage({ id, width, height, pixels: pixels.data.buffer, mask: mask.buffer }, [pixels.data.buffer, mask.buffer])
      })
      if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')
      context.putImageData(new ImageData(new Uint8ClampedArray(result), width, height), x, y)
      options.onProgress?.(Math.min(96, 72 + Math.round(24 / candidates.length)), 'Đã nội suy nhanh vùng logo; đang kiểm tra ảnh…')
    } finally {
      worker.terminate()
    }
  }
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
  let hardware: HardwareProfile | undefined
  try {
    options.onProgress?.(5, 'Đang đọc ảnh trên thiết bị…')
    bitmap = await createImageBitmap(file)
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > 8_000_000) {
      throw new Error('Ảnh vượt giới hạn 8 megapixel để giảm nguy cơ tràn RAM trên điện thoại.')
    }
    if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')

    hardware = options.fastOnly
      ? { tier: 'medium', deviceMemoryGB: null, hardwareConcurrency: 1, webgpu: false, webgl: false, label: 'Chế độ nhanh', reason: 'Không tải mô hình AI hoặc khởi tạo bộ nhận diện nặng.' }
      : await detectHardwareProfile()
    options.onProgress?.(7, hardware.label + ' — ' + hardware.reason)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: false })
    if (!context) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh trên thiết bị.')
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    bitmap = undefined

    let paddleCandidates: LogoCandidate[] = []
    // One-touch mode deliberately avoids loading OCR/WASM models in the background.
    // It runs only a bounded, cheap color heuristic; uncertain images go to manual mode.
    if (!options.fastOnly) {
      try {
        paddleCandidates = await detectWithPaddleOCR(file, canvas.width, canvas.height, options)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        options.onProgress?.(18, 'PaddleOCR chưa khởi chạy được; chuyển sang Tesseract dự phòng…')
      }
    }
    if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý ảnh.', 'AbortError')
    if (!options.fastOnly && !paddleCandidates.length) {
      options.onProgress?.(18, 'Đang khởi tạo Tesseract dự phòng…')
      worker = await createWorker('eng+vie', 1, {
        logger: event => {
          if (event.status === 'recognizing text' && typeof event.progress === 'number') {
            options.onProgress?.(18 + Math.round(event.progress * 40), 'Đang tìm chữ/logo ở mép ảnh…')
          }
        },
      })
    }

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
    const candidates: LogoCandidate[] = [...paddleCandidates]
    const minConfidence = options.minConfidence ?? 28

    for (let index = 0; index < corners.length && candidates.length === 0; index++) {
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
        worker!.recognize(enhancedCrop),
        worker!.recognize(crop),
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

    if (hardware?.tier === 'strong') {
      options.onProgress?.(68, 'Thiết bị mạnh: đang chạy LaMa AI cục bộ…')
      await inpaintCandidateBoxesWithLama(canvas, context, candidates, options)
    } else {
      options.onProgress?.(68, hardware?.tier === 'weak' ? 'Thiết bị cấu hình thấp: bỏ qua model 208 MB, chạy nội suy cục bộ nhẹ. Server fallback chỉ bật khi có endpoint xác thực nhận mask nhỏ.' : 'Thiết bị trung bình: bỏ qua model 208 MB, đang nội suy nhanh trên Web Worker…')
      await inpaintCandidateBoxesFast(canvas, context, candidates, options)
    }

    options.onProgress?.(98, 'Đang xuất và kiểm tra ảnh đã xử lý…')
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
      engine: hardware?.tier !== 'strong' ? (hardware?.tier === 'weak' ? 'weak-device-local-fallback-v1' : paddleCandidates.length ? 'paddleocr-ppocrv5-fast-v1' : 'tesseract-corner-text-fast-v1') : usedColorHeuristic ? 'tesseract-plus-tiktok-color-lama-v1' : paddleCandidates.length ? 'paddleocr-ppocrv5-lama-v1' : 'tesseract-corner-text-lama-v1',
    }
  } finally {
    bitmap?.close()
    if (worker) await worker.terminate()
  }
}
