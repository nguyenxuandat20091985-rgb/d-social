import React, { useEffect, useRef, useState } from 'react'
import { detectHardwareProfile, type HardwareProfile } from '../lib/media-processing/hardwareAdaptive'

type Props = { file: File; onProcessed: (blob: Blob) => void; onStatus?: (message: string) => void }
type WorkerReply = { id: string; type?: 'progress' | 'complete' | 'error'; progress?: number; stage?: string; pixels?: ArrayBuffer; message?: string }
export function ManualMediaEditor({ file, onProcessed, onStatus }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const maskRef = useRef<HTMLCanvasElement | null>(null)
  const lamaWorkerRef = useRef<Worker | null>(null)
  const drawingRef = useRef(false)
  const [brush, setBrush] = useState(28)
  const [working, setWorking] = useState(false)
  const [ready, setReady] = useState(false)
  const [hardware, setHardware] = useState<HardwareProfile | null>(null)
  const [lamaProgress, setLamaProgress] = useState(0)
  const [lamaStage, setLamaStage] = useState('Chưa chạy LaMa')
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus

  useEffect(() => {
    let active = true
    void detectHardwareProfile().then(profile => { if (active) setHardware(profile) }).catch(() => { if (active) setHardware(null) })
    setReady(false)
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      if (!active) return
      if (image.naturalWidth * image.naturalHeight > 8_000_000) {
        onStatusRef.current?.('Ảnh vượt giới hạn 8 megapixel để giảm nguy cơ tràn RAM trên điện thoại.')
        URL.revokeObjectURL(url)
        return
      }
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const mask = document.createElement('canvas')
      mask.width = canvas.width; mask.height = canvas.height
      maskRef.current = mask
      imageRef.current = image
      setReady(true)
    }
    image.onerror = () => onStatusRef.current?.('Không đọc được ảnh để chọn vùng logo.')
    image.src = url
    return () => {
      active = false
      URL.revokeObjectURL(url)
      imageRef.current = null
      maskRef.current = null
      lamaWorkerRef.current?.terminate()
      lamaWorkerRef.current = null
    }
  }, [file])

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }
  }
  function paint(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !canvasRef.current || !maskRef.current) return
    const { x, y } = point(event)
    const radius = brush * canvasRef.current.width / canvasRef.current.clientWidth / 2
    const mask = maskRef.current.getContext('2d')!
    mask.fillStyle = '#fff'
    mask.beginPath(); mask.arc(x, y, radius, 0, Math.PI * 2); mask.fill()
    const overlay = canvasRef.current.getContext('2d')!
    overlay.fillStyle = 'rgba(255,40,60,.48)'
    overlay.beginPath(); overlay.arc(x, y, radius, 0, Math.PI * 2); overlay.fill()
  }
  function resetMask() {
    const image = imageRef.current, canvas = canvasRef.current, mask = maskRef.current
    if (!image || !canvas || !mask) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    mask.getContext('2d')!.clearRect(0, 0, mask.width, mask.height)
    setLamaProgress(0); setLamaStage('Chưa chạy LaMa')
  }
  function buildInput() {
    const canvas = canvasRef.current, maskCanvas = maskRef.current, image = imageRef.current
    if (!canvas || !maskCanvas || !image) throw new Error('Ảnh chưa sẵn sàng.')
    const maskPixels = maskCanvas.getContext('2d')!.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
    const mask = new Uint8Array(maskCanvas.width * maskCanvas.height)
    let painted = 0
    for (let i = 0, j = 0; i < maskPixels.data.length; i += 4, j++) {
      if (maskPixels.data[i + 3] > 0) { mask[j] = 1; painted++ }
    }
    if (!painted) throw new Error('Anh hãy tô đỏ vùng logo cần xóa trước.')
    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = canvas.width; sourceCanvas.height = canvas.height
    const context = sourceCanvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Không tạo được ảnh nguồn.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    return { canvas, mask, pixels }
  }
  function buildLamaInput() {
    const canvas = canvasRef.current, maskCanvas = maskRef.current, image = imageRef.current
    if (!canvas || !maskCanvas || !image) throw new Error('Ảnh chưa sẵn sàng.')
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
    if (!maskContext) throw new Error('Không đọc được mask.')
    const maskPixels = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
    let minX = maskCanvas.width, minY = maskCanvas.height, maxX = -1, maxY = -1, painted = 0
    for (let y = 0; y < maskCanvas.height; y++) for (let x = 0; x < maskCanvas.width; x++) {
      if (!maskPixels.data[(y * maskCanvas.width + x) * 4 + 3]) continue
      painted++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
    if (!painted) throw new Error('Anh hãy tô đỏ vùng logo cần xóa trước.')
    if (painted > maskCanvas.width * maskCanvas.height * 0.15) throw new Error('Vùng tô vượt 15% ảnh. Hãy chỉ tô sát logo để tránh tốn RAM.')
    const pad = Math.max(64, Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.8))
    const originX = Math.max(0, minX - pad), originY = Math.max(0, minY - pad)
    const right = Math.min(canvas.width, maxX + pad + 1), bottom = Math.min(canvas.height, maxY + pad + 1)
    const patchWidth = right - originX, patchHeight = bottom - originY
    if (patchWidth * patchHeight > 8_000_000) throw new Error('Vùng logo quá lớn để xử lý an toàn trên điện thoại.')
    const patchCanvas = document.createElement('canvas')
    patchCanvas.width = patchWidth; patchCanvas.height = patchHeight
    const patchContext = patchCanvas.getContext('2d', { willReadFrequently: true })
    if (!patchContext) throw new Error('Không tạo được vùng ảnh cho LaMa.')
    patchContext.drawImage(image, originX, originY, patchWidth, patchHeight, 0, 0, patchWidth, patchHeight)
    const patchMask = maskContext.getImageData(originX, originY, patchWidth, patchHeight)
    const mask = new Uint8Array(patchWidth * patchHeight)
    for (let i = 0, j = 0; i < patchMask.data.length; i += 4, j++) if (patchMask.data[i + 3]) mask[j] = 1
    return { canvas, originX, originY, mask, pixels: patchContext.getImageData(0, 0, patchWidth, patchHeight) }
  }

  async function saveOutput(result: ArrayBuffer, width: number, height: number, method: 'LaMa AI' | 'nội suy nhanh', origin?: { x: number; y: number }) {
    const canvas = canvasRef.current
    if (!canvas) throw new Error('Canvas đã bị đóng.')
    const context = canvas.getContext('2d')!
    if (origin) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(imageRef.current!, 0, 0, canvas.width, canvas.height)
      context.putImageData(new ImageData(new Uint8ClampedArray(result), width, height), origin.x, origin.y)
    } else {
      context.putImageData(new ImageData(new Uint8ClampedArray(result), width, height), 0, 0)
    }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Không xuất được ảnh đầu ra.')), 'image/png'))
    if (!blob.size) throw new Error('Ảnh đầu ra rỗng.')
    onProcessed(blob)
    onStatusRef.current?.('Đã xử lý bằng ' + method + '. Hãy phóng to kiểm tra kỹ trước khi đăng.')
  }
  async function processLama() {
    if (working) return
    setWorking(true); setLamaProgress(1); setLamaStage('Đang chuẩn bị mask và ảnh nguồn…')
    try {
      const { canvas, mask, pixels, originX, originY } = buildLamaInput()
      if (hardware?.tier !== 'strong') throw new Error('Thiết bị này đang ở chế độ nội suy nhanh để tránh tải model 208 MB. Hãy dùng nút Nội suy nhanh.')
      onStatusRef.current?.('Đang chạy LaMa Inpainting trên thiết bị. Lần đầu cần tải mô hình từ Internet.')
      const worker = lamaWorkerRef.current ?? new Worker(new URL('../lib/media-processing/lama.worker.ts', import.meta.url), { type: 'module', name: 'dsocial-lama-inpainting' })
      lamaWorkerRef.current = worker
      const id = crypto.randomUUID()
      const result = await new Promise<ArrayBuffer>((resolve, reject) => {
        const cleanup = () => { worker.onmessage = null; worker.onerror = null }
        worker.onmessage = (event: MessageEvent<WorkerReply>) => {
          const message = event.data
          if (message?.id !== id) return
          if (message.type === 'progress') {
            setLamaProgress(message.progress ?? 0); setLamaStage(message.stage ?? 'Đang xử lý…')
            onStatusRef.current?.(message.stage ?? 'LaMa đang xử lý ảnh…')
          } else if (message.type === 'complete' && message.pixels) {
            cleanup(); resolve(message.pixels)
          } else if (message.type === 'error') {
            cleanup(); reject(new Error(message.message || 'LaMa không xử lý được ảnh.'))
          }
        }
        worker.onerror = () => { cleanup(); reject(new Error('Web Worker LaMa gặp lỗi.')) }
        worker.postMessage({ id, width: pixels.width, height: pixels.height, pixels: pixels.data.buffer, mask: mask.buffer, patchMode: true }, [pixels.data.buffer, mask.buffer])
      })
      await saveOutput(result, pixels.width, pixels.height, 'LaMa AI', { x: originX, y: originY })
      setLamaProgress(100); setLamaStage('LaMa hoàn tất — cần kiểm tra bằng mắt')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LaMa không xử lý được ảnh.'
      setLamaStage('LaMa thất bại')
      onStatusRef.current?.('LaMa chưa hoàn tất: ' + message + ' Anh có thể chọn “Nội suy nhanh” hoặc sửa mask.')
    } finally { setWorking(false) }
  }
  async function processFast() {
    if (working) return
    setWorking(true); onStatusRef.current?.('Đang chạy nội suy nhanh trên Web Worker…')
    try {
      const { canvas, mask, pixels } = buildInput()
      const worker = new Worker(new URL('../lib/media-processing/inpaint.worker.ts', import.meta.url), { type: 'module', name: 'dsocial-inpainting-fast' })
      const id = crypto.randomUUID()
      const result = await new Promise<ArrayBuffer>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<{ id: string; pixels?: ArrayBuffer; error?: string }>) => {
          if (event.data.id !== id) return
          worker.terminate()
          if (event.data.error || !event.data.pixels) reject(new Error(event.data.error || 'Nội suy ảnh thất bại.'))
          else resolve(event.data.pixels)
        }
        worker.onerror = () => { worker.terminate(); reject(new Error('Web Worker nội suy gặp lỗi.')) }
        worker.postMessage({ id, width: canvas.width, height: canvas.height, pixels: pixels.data.buffer, mask: mask.buffer }, [pixels.data.buffer, mask.buffer])
      })
      await saveOutput(result, canvas.width, canvas.height, 'nội suy nhanh')
    } catch (error) { onStatusRef.current?.(error instanceof Error ? error.message : 'Không xử lý được ảnh.') }
    finally { setWorking(false) }
  }

  return <section className="ds-clean-manual">
    <div className="ds-clean-manual-head">
      <strong>Tô lên watermark</strong>
      <button type="button" onClick={resetMask} disabled={!ready || working} aria-label="Xóa nét tô">Làm lại</button>
    </div>
    <p className="ds-clean-hint">Tô đỏ sát logo hoặc chữ cần xóa.</p>
    <canvas ref={canvasRef} className="ds-clean-mask-canvas touch-none" style={{ maxHeight: '48svh', objectFit: 'contain' }}
      onPointerDown={event => { drawingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); paint(event) }}
      onPointerMove={paint} onPointerUp={() => { drawingRef.current = false }} onPointerCancel={() => { drawingRef.current = false }} />
    <div className="ds-clean-brush">
      <label htmlFor="mask-brush">Nét</label>
      <input id="mask-brush" type="range" min="8" max="72" value={brush} onChange={event => setBrush(Number(event.currentTarget.value))} />
      <span>{brush}</span>
    </div>
    <button type="button" className="ds-clean-primary" disabled={!ready || working} onClick={() => void (hardware?.tier === 'strong' ? processLama() : processFast())}>
      {working ? <><span className="ds-clean-spinner" />Đang xóa…</> : 'Xóa vùng đã tô'}
    </button>
  </section>
}
