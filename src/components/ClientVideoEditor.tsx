import React, { useEffect, useRef, useState } from 'react'
import { cleanupCornerTextFromImage } from '../lib/media-processing/logoCleanup'
import { cropVideoCornersOnDevice } from '../lib/media-processing/videoCleanup'

type Props = { file: File; onProcessed: (blob: Blob) => void; onStatus?: (message: string) => void }
type LogoRegion = { x: number; y: number; width: number; height: number }

async function detectLogoInVideoFrame(file: File): Promise<LogoRegion> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Đọc khung hình video quá lâu.')), 8000)
      video.onloadedmetadata = () => {
        if (!video.videoWidth || !video.videoHeight) {
          window.clearTimeout(timer)
          reject(new Error('Không đọc được kích thước video.'))
          return
        }
        video.currentTime = Math.min(0.5, Math.max(0, video.duration / 10))
        video.onseeked = () => { window.clearTimeout(timer); resolve({ width: video.videoWidth, height: video.videoHeight }) }
      }
      video.onerror = () => { window.clearTimeout(timer); reject(new Error('Trình duyệt không đọc được video này.')) }
      video.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    if (canvas.width * canvas.height > 8_000_000) throw new Error('Khung hình video vượt 8 megapixel; hãy dùng video có độ phân giải thấp hơn.')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Không tạo được khung hình để nhận diện logo.')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const frame = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không trích xuất được khung hình video.')), 'image/jpeg', 0.92))
    const frameFile = new File([frame], 'dsocial-video-frame.jpg', { type: 'image/jpeg' })
    const detection = await cleanupCornerTextFromImage(frameFile, { fastOnly: false })
    if (!detection.candidates.length) throw new Error('Chưa phát hiện được logo ở 4 góc của khung hình đầu. Video chưa được xuất để tránh báo xóa logo sai.')
    const left = Math.min(...detection.candidates.map(candidate => candidate.x))
    const top = Math.min(...detection.candidates.map(candidate => candidate.y))
    const right = Math.max(...detection.candidates.map(candidate => candidate.x + candidate.width))
    const bottom = Math.max(...detection.candidates.map(candidate => candidate.y + candidate.height))
    const pad = Math.max(8, Math.round(Math.max(right - left, bottom - top) * 0.22))
    const x = Math.max(0, left - pad), y = Math.max(0, top - pad)
    return {
      x, y,
      width: Math.min(dimensions.width - x, right - left + pad * 2),
      height: Math.min(dimensions.height - y, bottom - top + pad * 2),
    }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

export function ClientVideoEditor({ file, onProcessed, onStatus }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const autoStartedRef = useRef(false)

  async function process() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onStatus?.('Đang quét khung hình video để tìm logo ở góc…')
      const logoRegion = await detectLogoInVideoFrame(file)
      onStatus?.('Đã tìm vùng nghi là logo. Đang xử lý video và tái tạo vùng đó…')
      const output = await cropVideoCornersOnDevice(file, { logoRegion })
      onProcessed(output)
      onStatus?.('Đã xử lý video. Hãy kiểm tra toàn bộ video, đặc biệt các khung hình có chuyển động.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Không xử lý được video.'
      setError(message)
      onStatus?.(message)
    } finally { setBusy(false) }
  }

  useEffect(() => {
    if (autoStartedRef.current) return
    autoStartedRef.current = true
    void process()
  }, [file])

  return <section className="ds-clean-video-card">
    <p className="ds-clean-hint">Tự quét khung hình đầu để tìm logo ở góc rồi xử lý trực tiếp trên điện thoại. Logo thay đổi vị trí hoặc nằm giữa khung hình có thể chưa được phát hiện.</p>
    {error && <p className="ds-clean-notice ds-clean-error" role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void process()} className="ds-clean-primary">
      {busy ? <><span className="ds-clean-spinner" />Đang tìm và xử lý video…</> : 'Thử xử lý lại video'}
    </button>
  </section>
}
