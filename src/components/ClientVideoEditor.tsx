import React, { useEffect, useRef, useState } from 'react'
import { cleanupCornerTextFromImage, type LogoCandidate } from '../lib/media-processing/logoCleanup'
import { cropVideoCornersOnDevice } from '../lib/media-processing/videoCleanup'

type Props = { file: File; onProcessed: (blob: Blob) => void; onStatus?: (message: string) => void }
type LogoRegion = { x: number; y: number; width: number; height: number }
type TimedCandidate = LogoCandidate & { sampleTime: number }

function waitForEvent(target: EventTarget, eventName: string, timeoutMs: number, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error(message)), timeoutMs)
    const onEvent = () => finish()
    const onError = () => finish(new Error(message))
    function finish(error?: Error) {
      window.clearTimeout(timer)
      target.removeEventListener(eventName, onEvent)
      target.removeEventListener('error', onError)
      error ? reject(error) : resolve()
    }
    target.addEventListener(eventName, onEvent, { once: true })
    target.addEventListener('error', onError, { once: true })
  })
}

async function captureFrame(video: HTMLVideoElement, seconds: number): Promise<Blob> {
  const seeked = waitForEvent(video, 'seeked', 7000, 'Không trích xuất được khung hình ở mốc này.')
  video.currentTime = Math.max(0, Math.min(seconds, Math.max(0, video.duration - 0.05)))
  await seeked
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  if (!canvas.width || !canvas.height || canvas.width * canvas.height > 8_000_000) {
    throw new Error('Video vượt giới hạn 8 megapixel mỗi khung hình trong bản thử nghiệm.')
  }
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Không tạo được khung hình để phân tích.')
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không xuất được khung hình phân tích.')), 'image/jpeg', 0.92)
  })
}

function mergeCandidates(items: TimedCandidate[]): TimedCandidate[] {
  const merged: TimedCandidate[] = []
  for (const item of items) {
    const match = merged.find(existing =>
      existing.region === item.region &&
      existing.text.trim().toLowerCase() === item.text.trim().toLowerCase() &&
      Math.abs(existing.x - item.x) < Math.max(18, item.width * 0.6) &&
      Math.abs(existing.y - item.y) < Math.max(18, item.height * 0.6),
    )
    if (!match) {
      merged.push({ ...item })
      continue
    }
    const left = Math.min(match.x, item.x)
    const top = Math.min(match.y, item.y)
    const right = Math.max(match.x + match.width, item.x + item.width)
    const bottom = Math.max(match.y + match.height, item.y + item.height)
    match.x = left
    match.y = top
    match.width = right - left
    match.height = bottom - top
    match.confidence = Math.max(match.confidence, item.confidence)
  }
  return merged
}

export function ClientVideoEditor({ file, onProcessed, onStatus }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [analysisDone, setAnalysisDone] = useState(false)
  const [candidates, setCandidates] = useState<TimedCandidate[]>([])
  const [region, setRegion] = useState<LogoRegion | null>(null)
  const [duration, setDuration] = useState(0)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [draftRegion, setDraftRegion] = useState<LogoRegion | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  useEffect(() => () => {
    controllerRef.current?.abort()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !dimensions.width || !dimensions.height) return
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const candidate of candidates) {
      context.strokeStyle = '#facc15'
      context.lineWidth = Math.max(2, canvas.width / 500)
      context.setLineDash([8, 5])
      context.strokeRect(candidate.x, candidate.y, candidate.width, candidate.height)
    }
    context.setLineDash([])
    const shown = draftRegion ?? region
    if (shown) {
      context.strokeStyle = '#ef4444'
      context.lineWidth = Math.max(3, canvas.width / 350)
      context.strokeRect(shown.x, shown.y, shown.width, shown.height)
      context.fillStyle = 'rgba(239,68,68,0.14)'
      context.fillRect(shown.x, shown.y, shown.width, shown.height)
    }
  }, [candidates, region, draftRegion, dimensions])

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height))),
    }
  }

  async function analyze() {
    if (busy) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    setError('')
    setAnalysisDone(false)
    setCandidates([])
    setRegion(null)
    setDraftRegion(null)
    setPreviewUrl(null)
    imageRef.current = null
    try {
      onStatus?.('Đang đọc thông số video…')
      const objectUrl = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'metadata'
      try {
        const metadataReady = waitForEvent(video, 'loadedmetadata', 8000, 'Không đọc được thông số video trên trình duyệt này.')
        video.src = objectUrl
        await metadataReady
        if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
          throw new Error('Video không có kích thước hoặc thời lượng hợp lệ.')
        }
        if (video.videoWidth * video.videoHeight > 8_000_000) {
          throw new Error('Khung hình vượt 8 megapixel. Hãy dùng bản video có độ phân giải thấp hơn để thử nghiệm.')
        }
        setDimensions({ width: video.videoWidth, height: video.videoHeight })
        setDuration(video.duration)
        const sampleTimes = [...new Set([video.duration * 0.15, video.duration * 0.5, video.duration * 0.85])]
          .filter(value => Number.isFinite(value) && value >= 0 && value < video.duration)
        const found: TimedCandidate[] = []
        let middleFrame: Blob | null = null
        for (let index = 0; index < sampleTimes.length; index++) {
          if (controller.signal.aborted) throw new DOMException('Đã hủy phân tích video.', 'AbortError')
          const time = sampleTimes[index]
          onStatus?.(`Đang phân tích khung hình ${index + 1}/${sampleTimes.length} tại ${time.toFixed(1)} giây…`)
          const frame = await captureFrame(video, time)
          if (Math.abs(time - video.duration * 0.5) < 0.02 || !middleFrame) middleFrame = frame
          try {
            const frameFile = new File([frame], 'dsocial-frame-analysis.jpg', { type: 'image/jpeg' })
            const result = await cleanupCornerTextFromImage(frameFile, {
              signal: controller.signal,
              fastOnly: false,
              detectOnly: true,
              onProgress: (_progress, stage) => onStatus?.(stage),
            })
            found.push(...result.candidates.map(candidate => ({ ...candidate, sampleTime: time })))
          } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
            // A frame with no detectable text is not proof that the video has no logo.
          }
        }
        if (controller.signal.aborted) throw new DOMException('Đã hủy phân tích video.', 'AbortError')
        if (!middleFrame) throw new Error('Không trích xuất được khung hình xem trước.')
        const url = URL.createObjectURL(middleFrame)
        const previewImage = new Image()
        const imageReady = waitForEvent(previewImage, 'load', 5000, 'Không tải được khung hình xem trước.')
        previewImage.src = url
        await imageReady
        imageRef.current = previewImage
        previewUrlRef.current = url
        setPreviewUrl(url)
        const unique = mergeCandidates(found)
        setCandidates(unique)
        if (unique.length) {
          const best = [...unique].sort((a, b) => b.confidence - a.confidence)[0]
          const pad = Math.max(8, Math.round(Math.max(best.width, best.height) * 0.25))
          const x = Math.max(0, best.x - pad), y = Math.max(0, best.y - pad)
          setRegion({
            x, y,
            width: Math.min(video.videoWidth - x, best.width + pad * 2),
            height: Math.min(video.videoHeight - y, best.height + pad * 2),
          })
        }
        setAnalysisDone(true)
        onStatus?.(unique.length
          ? 'Đã tìm thấy vùng nghi logo ở một hoặc nhiều khung hình. Hãy kiểm tra khung hình và chỉnh vùng đỏ trước khi chạy.'
          : 'OCR chưa tìm được logo chắc chắn. Anh có thể tự khoanh vùng trên khung hình để thử.')
      } finally {
        video.removeAttribute('src')
        video.load()
        URL.revokeObjectURL(objectUrl)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Không phân tích được video.'
      setError(message)
      onStatus?.(message)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  async function process() {
    if (busy) return
    if (!analysisDone) {
      setError('Hãy phân tích video trước.')
      return
    }
    if (!region || region.width < 2 || region.height < 2) {
      setError('Hãy kéo khoanh vùng logo trên khung hình trước khi xử lý.')
      return
    }
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    setError('')
    try {
      onStatus?.('Đang xử lý vùng đã xác nhận. Đây vẫn là nội suy delogo tĩnh, có thể để lại dấu vết.')
      const output = await cropVideoCornersOnDevice(file, {
        signal: controller.signal,
        logoRegion: region,
        onProgress: (_progress, stage) => onStatus?.(stage),
      })
      if (controller.signal.aborted) return
      onProcessed(output)
      onStatus?.('Đã xuất bản thử. Hãy so sánh với tệp gốc và kiểm tra nhiều thời điểm cùng âm thanh trước khi sử dụng.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Không xử lý được video.'
      setError(message)
      onStatus?.(message)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function cancel() {
    controllerRef.current?.abort()
    setBusy(false)
    setError('Đã yêu cầu hủy. Nếu bộ mã hóa đang chạy, trình duyệt có thể cần vài giây để giải phóng tài nguyên.')
    onStatus?.('Đã yêu cầu hủy xử lý video.')
  }

  return <section className="ds-clean-video-card">
    <p className="ds-clean-hint">Bản thử nghiệm: phân tích 3 mốc thời gian, sau đó anh tự kiểm tra và khoanh vùng đỏ. Bộ lọc hiện tại chỉ nội suy một vùng cố định trên toàn video; logo di chuyển, cảnh nền phức tạp hoặc vùng quá lớn có thể để lại vết. Không dùng kết quả chưa kiểm tra để đăng.</p>
    <div className="ds-clean-tools">
      <button type="button" disabled={busy} onClick={() => void analyze()} className="ds-clean-primary">
        {busy && !analysisDone ? <><span className="ds-clean-spinner" />Đang phân tích…</> : '1. Phân tích nhiều khung hình'}
      </button>
      {analysisDone && <button type="button" disabled={busy} onClick={() => void process()} className="ds-clean-primary">
        {busy ? <><span className="ds-clean-spinner" />Đang xử lý…</> : '2. Xóa vùng đỏ đã xác nhận'}
      </button>}
    </div>
    {previewUrl && analysisDone && <div className="ds-clean-video-review">
      <p className="ds-clean-hint">Khung hình ${(duration / 2).toFixed(1)} giây · ${dimensions.width} × ${dimensions.height} px. Kéo trên ảnh để khoanh vùng logo (đỏ); các vùng OCR gợi ý hiện bằng nét vàng.</p>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="ds-clean-mask-canvas"
        style={{ width: '100%', height: 'auto', maxHeight: '360px', objectFit: 'contain', touchAction: 'none' }}
        onPointerDown={event => {
          const start = point(event)
          dragStartRef.current = start
          setDraftRegion({ x: start.x, y: start.y, width: 1, height: 1 })
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const start = dragStartRef.current
          if (!start) return
          const current = point(event)
          setDraftRegion({
            x: Math.min(start.x, current.x), y: Math.min(start.y, current.y),
            width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y),
          })
        }}
        onPointerUp={event => {
          const start = dragStartRef.current
          if (start) {
            const current = point(event)
            const next = {
              x: Math.floor(Math.min(start.x, current.x)), y: Math.floor(Math.min(start.y, current.y)),
              width: Math.floor(Math.abs(current.x - start.x)), height: Math.floor(Math.abs(current.y - start.y)),
            }
            if (next.width >= 4 && next.height >= 4) setRegion(next)
          }
          dragStartRef.current = null
          setDraftRegion(null)
        }}
        onPointerCancel={() => { dragStartRef.current = null; setDraftRegion(null) }}
        aria-label="Khoanh vùng logo trên khung hình video"
      />
      <p className="ds-clean-hint">Đã phát hiện ${candidates.length} vùng chữ nghi vấn từ 3 mốc. ${region ? `Vùng đang chọn: x=${Math.round(region.x)}, y=${Math.round(region.y)}, rộng ${Math.round(region.width)}, cao ${Math.round(region.height)} pixel.` : 'Chưa chọn vùng.'}</p>
      {candidates.length > 0 && <ul className="ds-clean-candidate-list">
        {candidates.slice(0, 8).map((candidate, index) => <li key={index}>{candidate.text} · {candidate.region} · {Math.round(candidate.confidence)}% · mốc {candidate.sampleTime.toFixed(1)} giây</li>)}
      </ul>}
    </div>}
    {error && <p className="ds-clean-notice ds-clean-error" role="alert">{error}</p>}
    {busy && <button type="button" disabled={false} onClick={cancel} className="ds-clean-cancel">Hủy</button>}
  </section>
}
