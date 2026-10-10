import React, { useEffect, useRef, useState } from 'react'
import { inspectMediaOnDevice, type MediaInspection } from '../lib/mediaProcessingClient'
import { cleanupCornerTextFromImage, type ClientImageCleanupResult } from '../lib/media-processing/logoCleanup'

type ResultState = {
  inspection?: MediaInspection
  cleanup?: ClientImageCleanupResult
  error?: string
}

export function MediaProcessingTestPage() {
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('Chọn ảnh hoặc video để bắt đầu kiểm tra trên thiết bị.')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResultState | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const outputUrlRef = useRef<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  useEffect(() => () => {
    controllerRef.current?.abort()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current)
  }, [])

  async function handleFile(file?: File) {
    if (!file) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    setProgress(0)
    setResult(null)
    setStage('Đang khởi tạo bộ xử lý trên điện thoại…')
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current)
      outputUrlRef.current = null
    }
    const localPreview = URL.createObjectURL(file)
    previewUrlRef.current = localPreview
    setPreviewUrl(localPreview)

    try {
      const inspection = await inspectMediaOnDevice(file, {
        signal: controller.signal,
        onProgress: ({ progress: p, stage: s }) => {
          setProgress(Math.min(40, Math.round(p * 0.4)))
          setStage(s)
        },
      })
      if (controller.signal.aborted) return
      if (inspection.mediaType === 'image') {
        setStage('Đã kiểm tra tệp. Đang thử phát hiện và che chữ/logo ở góc ảnh…')
        const cleanup = await cleanupCornerTextFromImage(file, {
          signal: controller.signal,
          onProgress: (p, s) => {
            setProgress(40 + Math.round(p * 0.6))
            setStage(s)
          },
        })
        if (controller.signal.aborted) return
        const outputUrl = URL.createObjectURL(cleanup.blob)
        outputUrlRef.current = outputUrl
        previewUrlRef.current = outputUrl
        setResult({ inspection, cleanup })
        setPreviewUrl(outputUrl)
        setProgress(100)
        setStage('Hoàn tất xử lý thử nghiệm ảnh. Hãy tự kiểm tra ảnh đầu ra kỹ.')
      } else {
        setResult({ inspection })
        setProgress(100)
        setStage('Đã kiểm tra tệp video. Bản thử nghiệm này chưa xóa logo trong video.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStage('Đã hủy xử lý.')
      } else {
        setResult({ error: error instanceof Error ? error.message : 'Xử lý thất bại.' })
        setStage('Không thể xác nhận media đã được xử lý sạch.')
      }
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    controllerRef.current?.abort()
    setBusy(false)
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6" style={{ background: '#f4f7fb', color: '#172033' }}>
      <div className="mx-auto max-w-xl space-y-5">
        <header className="rounded-2xl p-5 text-white shadow-sm" style={{ background: 'linear-gradient(135deg,#173fc7,#126fcb)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80">D-Social · Bản test riêng</p>
          <h1 className="mt-2 text-2xl font-bold">Kiểm tra xử lý media</h1>
          <p className="mt-2 text-sm opacity-90">Chọn ảnh/video ngay trên điện thoại để xem tiến độ xử lý phía trình duyệt.</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label htmlFor="media-file" className="mb-2 block text-sm font-semibold">Chọn ảnh hoặc video</label>
          <input
            id="media-file"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,video/x-m4v"
            disabled={busy}
            onChange={event => { void handleFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }}
            className="block w-full rounded-xl border border-slate-300 p-3 text-sm"
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">Ảnh: JPEG/PNG/WebP tối đa 8 MB. Video: MP4/MOV/WebM tối đa 30 MB. Tệp được xử lý thử nghiệm trên thiết bị này.</p>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Tiến độ</span>
              <span className="font-bold tabular-nums">{progress}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: progress + '%', background: '#2454d7' }} />
            </div>
            <p className="mt-3 min-h-10 text-sm leading-5 text-slate-600" aria-live="polite">{stage}</p>
          </div>
          {busy && <button type="button" onClick={cancel} className="mt-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Hủy xử lý</button>}
        </section>

        {previewUrl && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold">Xem trước</h2>
            {result?.inspection?.mediaType === 'video' ? (
              <video src={previewUrl} controls playsInline className="max-h-96 w-full rounded-xl bg-black" />
            ) : (
              <img src={previewUrl} alt="Ảnh xem trước hoặc ảnh đầu ra thử nghiệm" className="max-h-96 w-full rounded-xl object-contain" />
            )}
            <p className="mt-2 text-xs text-slate-500">Ảnh hiển thị là kết quả thử nghiệm nếu xử lý ảnh thành công; nếu không, đây là ảnh đầu vào để đối chiếu.</p>
          </section>
        )}

        {result?.inspection && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Thông tin kiểm tra tệp</h2>
            <dl className="mt-3 space-y-2 break-words text-sm">
              <div><dt className="inline text-slate-500">Tên tệp: </dt><dd className="inline font-medium">{result.inspection.name}</dd></div>
              <div><dt className="inline text-slate-500">Loại: </dt><dd className="inline">{result.inspection.mimeType || 'Không xác định'}</dd></div>
              <div><dt className="inline text-slate-500">Dung lượng: </dt><dd className="inline">{(result.inspection.sizeBytes / 1024 / 1024).toFixed(2)} MB</dd></div>
              {result.inspection.width && <div><dt className="inline text-slate-500">Kích thước: </dt><dd className="inline">{result.inspection.width} × {result.inspection.height} px</dd></div>}
              <div><dt className="inline text-slate-500">SHA-256: </dt><dd className="inline font-mono text-xs">{result.inspection.sha256}</dd></div>
            </dl>
            {result.cleanup && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                Bộ dò tìm thấy {result.cleanup.candidates.length} vùng chữ ở góc ảnh và đã thử làm mờ các vùng đó. Đây không phải bảo đảm xóa mọi logo; hãy phóng to kiểm tra ảnh đầu ra.
              </div>
            )}
            {result.inspection.mediaType === 'video' && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                Video mới được kiểm tra tệp và mã SHA-256. Chưa có bước xóa logo video trong trang thử nghiệm này.
              </div>
            )}
          </section>
        )}

        {result?.error && (
          <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
            <strong>Chưa xử lý thành công.</strong><p className="mt-1">{result.error}</p>
            <p className="mt-2">Không coi tệp này là đã làm sạch. Hãy thử một ảnh khác hoặc quay lại sau.</p>
          </section>
        )}

        <footer className="text-center text-xs leading-5 text-slate-500">
          Trang thử nghiệm độc lập, không đăng bài và không thay đổi dữ liệu trên D-Social production.
          <div className="mt-2"><a href="/" className="font-semibold text-blue-700 underline">Quay lại D-Social</a></div>
        </footer>
      </div>
    </main>
  )
}
