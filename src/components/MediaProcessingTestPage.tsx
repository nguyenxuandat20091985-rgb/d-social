import React, { useEffect, useRef, useState } from 'react'
import { inspectMediaOnDevice, type MediaInspection } from '../lib/mediaProcessingClient'
import { cleanupCornerTextFromImage, type ClientImageCleanupResult } from '../lib/media-processing/logoCleanup'
import { ManualMediaEditor } from './ManualMediaEditor'
import { ClientVideoEditor } from './ClientVideoEditor'

type ResultState = { inspection?: MediaInspection; cleanup?: ClientImageCleanupResult; error?: string }
export function MediaProcessingTestPage() {
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('Chọn ảnh hoặc video để bắt đầu xử lý trên thiết bị.')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResultState | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const urlsRef = useRef<string[]>([])
  const stageText = stage.toLowerCase()
  const activePipelineStep = /lama|inpainting|tái tạo nền|ghép kết quả/.test(stageText) ? 3
    : /mask|tô vùng|vùng chọn|vùng đã chọn/.test(stageText) ? 2
    : /ocr|đọc chữ|quét chữ|phát hiện/.test(stageText) ? 1
    : /xuất|kiểm tra ảnh|đã xử lý|hoàn tất/.test(stageText) ? 4 : 0
  const pipelineSteps = [
    'Đọc và kiểm tra tệp ảnh',
    'Phát hiện chữ/logo bằng PaddleOCR PP-OCRv5 (Tesseract dự phòng)',
    'Tạo mask từ vùng phát hiện hoặc tô tay',
    'LaMa Inpainting (chạy khi chọn xóa bằng AI)',
    'Xuất tệp và người dùng kiểm tra kết quả',
  ]
  useEffect(() => () => { controllerRef.current?.abort(); urlsRef.current.forEach(url => URL.revokeObjectURL(url)) }, [])
  function keepUrl(url: string) { urlsRef.current.push(url); return url }
  function acceptOutput(blob: Blob) {
    const url = keepUrl(URL.createObjectURL(blob))
    setPreviewUrl(url); setDownloadUrl(url)
    setResult(previous => ({ ...(previous ?? {}), error: undefined }))
    setProgress(100)
    setStage('Đã tạo tệp đầu ra trên thiết bị. Hãy kiểm tra kỹ trước khi sử dụng.')
  }
  async function handleFile(file?: File) {
    if (!file) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setSelectedFile(file); setBusy(true); setProgress(0); setResult(null); setDownloadUrl(null)
    setStage('Đang khởi tạo bộ xử lý trên điện thoại…')
    const originalUrl = keepUrl(URL.createObjectURL(file))
    setPreviewUrl(originalUrl)
    try {
      const inspection = await inspectMediaOnDevice(file, {
        signal: controller.signal,
        onProgress: ({ progress: value, stage: message }) => { setProgress(Math.min(35, Math.round(value * .35))); setStage(message) },
      })
      if (controller.signal.aborted) return
      setResult({ inspection })
      if (inspection.mediaType === 'image') {
        try {
          setStage('Đang thử OCR và xử lý tự động các góc ảnh…')
          const cleanup = await cleanupCornerTextFromImage(file, {
            signal: controller.signal,
            onProgress: (value, message) => { setProgress(35 + Math.round(value * .45)); setStage(message) },
          })
          if (controller.signal.aborted) return
          const url = keepUrl(URL.createObjectURL(cleanup.blob))
          setPreviewUrl(url); setDownloadUrl(url); setResult({ inspection, cleanup })
          setProgress(80); setStage('Đã chạy xử lý tự động. Nếu còn logo, dùng công cụ tô vùng thủ công bên dưới.')
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error
          setResult({ inspection, error: error instanceof Error ? error.message : 'OCR không nhận diện chắc chắn logo.' })
          setStage('OCR chưa đủ tin cậy. Anh có thể tự tô vùng logo để xử lý ngay trên máy.')
        }
      } else {
        setProgress(35); setStage('Đã kiểm tra video. Có thể chạy crop nhẹ ngay trên thiết bị.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setStage('Đã hủy xử lý.')
      else { setResult(previous => ({ ...(previous ?? {}), error: error instanceof Error ? error.message : 'Xử lý thất bại.' })); setStage('Không thể hoàn tất bước kiểm tra media.') }
    } finally { setBusy(false) }
  }
  function cancel() { controllerRef.current?.abort(); setBusy(false) }
  return <main className="min-h-screen px-4 py-6 sm:px-6" style={{ background: '#f4f7fb', color: '#172033' }}>
    <div className="mx-auto max-w-xl space-y-5">
      <header className="rounded-2xl p-5 text-white shadow-sm" style={{ background: 'linear-gradient(135deg,#173fc7,#126fcb)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest opacity-80">D-Social · Bản test Client-First</p>
        <h1 className="mt-2 text-2xl font-bold">Xử lý ảnh/video trên thiết bị</h1>
        <p className="mt-2 text-sm opacity-90">Ưu tiên xử lý tại trình duyệt, không cần máy chủ AI trả phí.</p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="media-file" className="mb-2 block text-sm font-semibold">Chọn ảnh hoặc video</label>
        <input id="media-file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,video/x-m4v" disabled={busy} onChange={event => { void handleFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} className="block w-full rounded-xl border border-slate-300 p-3 text-sm"/>
        <p className="mt-2 text-xs leading-5 text-slate-500">Ảnh tối đa 8 MB, video tối đa 30 MB. Tệp được xử lý cục bộ trong trình duyệt; video có thể cần tải FFmpeg.wasm lần đầu.</p>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">Tiến độ</span><span className="font-bold tabular-nums">{progress}%</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all duration-300" style={{ width: progress + '%', background: '#2454d7' }}/></div>
          <p className="mt-3 min-h-10 text-sm leading-5 text-slate-600" aria-live="polite">{stage}</p>
          {selectedFile?.type.startsWith('image/') && <ol className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            {pipelineSteps.map((label, index) => {
              const active = index === activePipelineStep
              const complete = index < activePipelineStep || (index === 4 && progress >= 100)
              return <li key={label} className="flex items-start gap-2 text-xs leading-5">
                <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-bold ${complete ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{complete ? '✓' : index + 1}</span>
                <span className={complete || active ? 'font-medium text-slate-800' : 'text-slate-400'}>{label}</span>
                {active && !complete && <span className="ml-auto text-blue-700">Đang làm</span>}
              </li>
            })}
          </ol>}
        </div>
        {busy && <button type="button" onClick={cancel} className="mt-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Hủy xử lý</button>}
      </section>
      {previewUrl && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Xem trước đầu vào/đầu ra</h2>
        {result?.inspection?.mediaType === 'video' ? <video src={previewUrl} controls playsInline className="max-h-96 w-full rounded-xl bg-black"/> : <img src={previewUrl} alt="Ảnh xem trước" className="max-h-96 w-full rounded-xl object-contain"/>}
        {downloadUrl && <a href={downloadUrl} download={selectedFile?.type.startsWith('video/') ? 'dsocial-video-cleanup.mp4' : 'dsocial-image-cleanup.png'} className="mt-3 inline-block rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Tải tệp đã xử lý</a>}
      </section>}
      {result?.inspection && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Thông tin tệp</h2><dl className="mt-3 space-y-2 break-words text-sm">
          <div><dt className="inline text-slate-500">Tên: </dt><dd className="inline font-medium">{result.inspection.name}</dd></div>
          <div><dt className="inline text-slate-500">Loại: </dt><dd className="inline">{result.inspection.mimeType || 'Không xác định'}</dd></div>
          <div><dt className="inline text-slate-500">Dung lượng: </dt><dd className="inline">{(result.inspection.sizeBytes / 1024 / 1024).toFixed(2)} MB</dd></div>
          {result.inspection.width && <div><dt className="inline text-slate-500">Kích thước: </dt><dd className="inline">{result.inspection.width} × {result.inspection.height} px</dd></div>}
          <div><dt className="inline text-slate-500">SHA-256: </dt><dd className="inline font-mono text-xs">{result.inspection.sha256}</dd></div>
        </dl>
        {result.cleanup && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">Đã phát hiện {result.cleanup.candidates.length} vùng nghi vấn bằng {result.cleanup.engine}. Pipeline đã thử LaMa Inpainting; đây không phải bảo đảm xóa mọi logo. Anh cần phóng to kiểm tra ảnh đầu ra.</div>}
        {result.error && <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">{result.error}</div>}
      </section>}
      {selectedFile && selectedFile.type.startsWith('image/') && <ManualMediaEditor file={selectedFile} onProcessed={blob => acceptOutput(blob)} onStatus={message => setStage(message)}/>}
      {selectedFile && selectedFile.type.startsWith('video/') && <ClientVideoEditor file={selectedFile} onProcessed={blob => acceptOutput(blob)} onStatus={message => setStage(message)}/>}
      <footer className="text-center text-xs leading-5 text-slate-500">Trang test độc lập; không tự đăng bài và không thay đổi dữ liệu production.
        <div className="mt-2"><a href="/" className="font-semibold text-blue-700 underline">Quay lại D-Social</a></div>
      </footer>
    </div>
  </main>
}
