/// <reference lib="webworker" />

type Candidate = { x: number; y: number; width: number; height: number; confidence: number; text: string; region: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }
type Request = { id: string; file: Blob; width: number; height: number }
type Reply = { id: string; type: 'progress'; progress: number; stage: string } | { id: string; type: 'complete'; candidates: Candidate[]; elapsedMs: number } | { id: string; type: 'error'; message: string }
const scope = self as DedicatedWorkerGlobalScope
let ocrPromise: Promise<any> | undefined
function send(reply: Reply) { scope.postMessage(reply) }

async function getOcr(id: string) {
  if (!ocrPromise) {
    ocrPromise = (async () => {
      send({ id, type: 'progress', progress: 5, stage: 'Đang tải bộ nhận diện PaddleOCR PP-OCRv5 lần đầu…' })
      const moduleUrl: string = 'https://esm.sh/@paddleocr/paddleocr-js?bundle'
      const module = await import(/* @vite-ignore */ moduleUrl) as { PaddleOCR: { create(options: Record<string, unknown>): Promise<{ predict(input: Blob): Promise<Array<{ items?: Array<{ text?: string; score?: number; poly?: number[][] }> }>>; dispose?: () => Promise<void> }> } }
      const instance = await module.PaddleOCR.create({
        lang: 'en',
        ocrVersion: 'PP-OCRv5',
        textDetectionBatchSize: 1,
        textRecognitionBatchSize: 2,
        ortOptions: {
          backend: 'wasm',
          wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/',
          numThreads: 1,
          simd: true,
        },
      })
      return instance
    })().catch(error => { ocrPromise = undefined; throw error })
  }
  return ocrPromise
}

function getRegion(x: number, y: number, width: number, height: number): Candidate['region'] | null {
  if (x < width * 0.38 && y < height * 0.34) return 'top-left'
  if (x + width > width * 0.62 && y < height * 0.34) return 'top-right'
  if (x < width * 0.38 && y + height > height * 0.66) return 'bottom-left'
  if (x + width > width * 0.62 && y + height > height * 0.66) return 'bottom-right'
  return null
}

const BRAND_TERMS = ['tiktok','tik tok','instagram','facebook','youtube','you tube','capcut','kwai','likee','snapchat','pinterest','douyin','weibo','threads','linkedin','vimeo','triller','twitch','telegram','whatsapp','twitter','x.com','lemon8','bilibili','kuaishou','抖音','快手','小红书']
scope.onmessage = event => {
  const request = event.data as Request
  void (async () => {
    const started = performance.now()
    try {
      send({ id: request.id, type: 'progress', progress: 2, stage: 'Đang chuẩn bị ảnh cho PaddleOCR…' })
      const ocr = await getOcr(request.id)
      send({ id: request.id, type: 'progress', progress: 25, stage: 'PaddleOCR đang phát hiện và đọc chữ trên ảnh…' })
      const [result] = await ocr.predict(request.file)
      const items = result?.items ?? []
      const candidates: Candidate[] = []
      for (const item of items) {
        const text = (item.text ?? '').trim()
        if (!text) continue
        const normalized = text.toLowerCase().replace(/\s+/g, '')
        const isBrand = BRAND_TERMS.some(brand => normalized.includes(brand.replace(/\s+/g, '')))
        const isHandle = /@[\w.]{3,}/.test(text)
        if (!isBrand && !isHandle) continue
        if (!Array.isArray(item.poly) || item.poly.length < 4) continue
        const xs = item.poly.map(point => Number(point[0])).filter(Number.isFinite)
        const ys = item.poly.map(point => Number(point[1])).filter(Number.isFinite)
        if (xs.length < 4 || ys.length < 4) continue
        const x0 = Math.max(0, Math.floor(Math.min(...xs)))
        const y0 = Math.max(0, Math.floor(Math.min(...ys)))
        const x1 = Math.min(request.width, Math.ceil(Math.max(...xs)))
        const y1 = Math.min(request.height, Math.ceil(Math.max(...ys)))
        const boxWidth = x1 - x0, boxHeight = y1 - y0
        if (boxWidth < 2 || boxHeight < 2 || boxWidth > request.width * 0.4 || boxHeight > request.height * 0.14) continue
        const region = getRegion(x0, y0, request.width, request.height)
        if (!region) continue
        candidates.push({ x: x0, y: y0, width: boxWidth, height: boxHeight, confidence: Math.round(Math.max(0, Math.min(1, Number(item.score ?? 0))) * 100), text, region })
      }
      send({ id: request.id, type: 'progress', progress: 90, stage: 'Đã tổng hợp các vùng chữ/logo có độ tin cậy…' })
      send({ id: request.id, type: 'complete', candidates, elapsedMs: Math.round(performance.now() - started) })
    } catch (error) {
      send({ id: request.id, type: 'error', message: error instanceof Error ? error.message : 'PaddleOCR không khởi chạy được trên trình duyệt này.' })
    }
  })()
}
export {}
