import React, { useEffect, useRef, useState } from 'react'

type Props = { file: File; onProcessed: (blob: Blob) => void; onStatus?: (message: string) => void }
export function ManualMediaEditor({ file, onProcessed, onStatus }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const maskRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const [brush, setBrush] = useState(24)
  const [working, setWorking] = useState(false)
  const [ready, setReady] = useState(false)
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus

  useEffect(() => {
    let active = true
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      if (!active) return
      if (image.naturalWidth * image.naturalHeight > 16_000_000) {
        onStatusRef.current?.('Ảnh vượt giới hạn 16 megapixel.')
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
    return () => { active = false; URL.revokeObjectURL(url); imageRef.current = null; maskRef.current = null }
  }, [file])

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }
  }
  function paint(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !canvasRef.current || !maskRef.current) return
    const { x, y } = point(event)
    const mask = maskRef.current.getContext('2d')!
    mask.fillStyle = '#fff'
    mask.beginPath(); mask.arc(x, y, brush * canvasRef.current.width / canvasRef.current.clientWidth / 2, 0, Math.PI * 2); mask.fill()
    const overlay = canvasRef.current.getContext('2d')!
    overlay.fillStyle = 'rgba(255,40,60,.48)'
    overlay.beginPath(); overlay.arc(x, y, brush * canvasRef.current.width / canvasRef.current.clientWidth / 2, 0, Math.PI * 2); overlay.fill()
  }
  function resetMask() {
    const image = imageRef.current, canvas = canvasRef.current, mask = maskRef.current
    if (!image || !canvas || !mask) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height)
    mask.getContext('2d')!.clearRect(0,0,mask.width,mask.height)
  }
  async function process() {
    const canvas = canvasRef.current, maskCanvas = maskRef.current
    if (!canvas || !maskCanvas || working) return
    const maskCtx = maskCanvas.getContext('2d')!
    const maskPixels = maskCtx.getImageData(0,0,maskCanvas.width,maskCanvas.height)
    const mask = new Uint8Array(maskCanvas.width * maskCanvas.height)
    let painted = 0
    for (let i=0,j=0;i<maskPixels.data.length;i+=4,j++) if (maskPixels.data[i+3] > 0) { mask[j]=1; painted++ }
    if (!painted) { onStatusRef.current?.('Anh hãy tô đỏ vùng logo cần xóa trước.'); return }
    setWorking(true); onStatusRef.current?.('Đang nội suy vùng đã chọn trên thiết bị…')
    try {
      const sourceCanvas = document.createElement('canvas')
      sourceCanvas.width = canvas.width; sourceCanvas.height = canvas.height
      sourceCanvas.getContext('2d')!.drawImage(imageRef.current!, 0, 0, canvas.width, canvas.height)
      const pixels = sourceCanvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height)
      const ctx = canvas.getContext('2d')!
      const worker = new Worker(new URL('../lib/media-processing/inpaint.worker.ts', import.meta.url), { type: 'module', name: 'dsocial-inpainting' })
      const id = crypto.randomUUID()
      const result = await new Promise<ArrayBuffer>((resolve,reject) => {
        worker.onmessage = (event: MessageEvent<{id:string;pixels?:ArrayBuffer;error?:string}>) => {
          if (event.data.id !== id) return
          worker.terminate()
          if (event.data.error || !event.data.pixels) reject(new Error(event.data.error || 'Xử lý ảnh thất bại.'))
          else resolve(event.data.pixels)
        }
        worker.onerror = () => { worker.terminate(); reject(new Error('Web Worker xử lý ảnh gặp lỗi.')) }
        worker.postMessage({ id, width: canvas.width, height: canvas.height, pixels: pixels.data.buffer, mask: mask.buffer }, [pixels.data.buffer, mask.buffer])
      })
      const output = new ImageData(new Uint8ClampedArray(result), canvas.width, canvas.height)
      ctx.putImageData(output,0,0)
      const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Không xuất được ảnh.')), 'image/png'))
      onProcessed(blob); onStatusRef.current?.('Đã nội suy vùng đã tô. Hãy phóng to kiểm tra và tô thêm nếu còn dấu vết.')
    } catch (error) { onStatusRef.current?.(error instanceof Error ? error.message : 'Không xử lý được ảnh.') }
    finally { setWorking(false) }
  }

  return <section className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
    <h2 className="font-semibold">Chọn vùng logo thủ công (xử lý trên máy)</h2>
    <p className="mt-1 text-sm text-slate-600">Dùng ngón tay tô đỏ lên logo/chữ cần xóa. Đây là nội suy ảnh nhẹ, không phải AI tạo nền; vùng phức tạp có thể để lại vết.</p>
    <canvas ref={canvasRef} className="mt-3 w-full rounded-xl border border-slate-200 touch-none" style={{ maxHeight: 520, objectFit: 'contain' }}
      onPointerDown={event => { drawingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); paint(event) }}
      onPointerMove={paint} onPointerUp={() => { drawingRef.current = false }} onPointerCancel={() => { drawingRef.current = false }} />
    <div className="mt-3 flex items-center gap-3 text-sm"><label htmlFor="mask-brush">Cỡ nét</label><input id="mask-brush" type="range" min="8" max="72" value={brush} onChange={event => setBrush(Number(event.currentTarget.value))}/><span>{brush}px</span></div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={!ready || working} onClick={resetMask} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold">Làm lại vùng chọn</button>
      <button type="button" disabled={!ready || working} onClick={() => void process()} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{working ? 'Đang nội suy…' : 'Xóa vùng đã tô'}</button>
    </div>
  </section>
}
