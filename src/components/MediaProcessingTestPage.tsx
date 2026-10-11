import React, { useEffect, useRef, useState } from 'react'
import { inspectMediaOnDevice, type MediaInspection } from '../lib/mediaProcessingClient'
import { cleanupCornerTextFromImage, type ClientImageCleanupResult } from '../lib/media-processing/logoCleanup'
import { ManualMediaEditor } from './ManualMediaEditor'
import { ClientVideoEditor } from './ClientVideoEditor'

type ResultState = { inspection?: MediaInspection; cleanup?: ClientImageCleanupResult; error?: string }

export function MediaProcessingTestPage() {
  const [busy, setBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [result, setResult] = useState<ResultState | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [notice, setNotice] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  const urlsRef = useRef<string[]>([])

  useEffect(() => () => {
    controllerRef.current?.abort()
    urlsRef.current.forEach(url => URL.revokeObjectURL(url))
  }, [])

  function keepUrl(url: string) { urlsRef.current.push(url); return url }

  function acceptOutput(blob: Blob) {
    const url = keepUrl(URL.createObjectURL(blob))
    setPreviewUrl(url)
    setShowOriginal(false)
    setNotice('Đã xử lý xong · hãy kiểm tra ảnh trước khi đăng.')
    setResult(previous => ({ ...(previous ?? {}), error: undefined }))
  }

  async function handleFile(file?: File) {
    if (!file) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setSelectedFile(file)
    setManualOpen(false)
    setBusy(true)
    setNotice('')
    setResult(null)
    setPreviewUrl(null)
    setShowOriginal(true)
    const sourceUrl = keepUrl(URL.createObjectURL(file))
    setOriginalUrl(sourceUrl)
    try {
      const inspection = await inspectMediaOnDevice(file, { signal: controller.signal, onProgress: () => undefined })
      if (controller.signal.aborted) return
      setResult({ inspection })
      setNotice(inspection.mediaType === 'video'
        ? 'Đã đọc thông tin video. Chưa có gì bị thay đổi; hãy chạy thử có chủ đích và kiểm tra kết quả trước khi sử dụng.'
        : 'Đã đọc thông tin ảnh. Ảnh gốc vẫn được giữ nguyên; chọn chế độ tự động hoặc tô vùng thủ công khi sẵn sàng.')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setResult({ error: error instanceof Error ? error.message : 'Không đọc được tệp.' })
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  async function runAutomatic(fileToProcess: File | null = selectedFile, allowBusy = false) {
    if (!fileToProcess || (busy && !allowBusy) || !fileToProcess.type.startsWith('image/')) return
    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    setBusy(true)
    setNotice('')
    setResult(previous => ({ ...(previous ?? {}), error: undefined }))
    try {
      const cleanup = await cleanupCornerTextFromImage(fileToProcess, {
        signal: controller.signal,
        fastOnly: false,
        onProgress: (_progress, stage) => setNotice(stage),
      })
      if (controller.signal.aborted) return
      const url = keepUrl(URL.createObjectURL(cleanup.blob))
      setPreviewUrl(url)
      setDownloadUrl(url)
      setResult(previous => ({ ...(previous ?? {}), cleanup, error: undefined }))
      setNotice('Đã xử lý xong · hãy phóng to kiểm tra kết quả.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setResult(previous => ({
        ...(previous ?? {}),
        error: error instanceof Error ? error.message : 'Tự động chưa xóa được watermark.',
      }))
      setNotice('Chưa nhận diện chắc chắn. Anh có thể tô vùng cần xóa.')
      setManualOpen(true)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function cancel() {
    controllerRef.current?.abort()
    setBusy(false)
    setNotice('Đã hủy xử lý.')
  }

  const isImage = Boolean(selectedFile?.type.startsWith('image/'))
  const isVideo = Boolean(selectedFile?.type.startsWith('video/'))

  return <main className="ds-clean-shell">
    <header className="ds-clean-header">
      <div className="ds-clean-mark">D</div>
      <div className="min-w-0">
        <h1>D-Social Clean</h1>
        <p>Xóa watermark ngay trên thiết bị</p>
      </div>
      <label className="ds-clean-pick">
        {selectedFile ? 'Đổi tệp' : 'Chọn ảnh/video'}
        <input aria-label="Chọn ảnh hoặc video" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,video/x-m4v" disabled={busy} onChange={event => { void handleFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
      </label>
    </header>

    <section className="ds-clean-workspace">
      <div className={manualOpen ? "ds-clean-preview ds-clean-preview-hidden" : "ds-clean-preview"}>
        {(showOriginal || !previewUrl) && originalUrl && isVideo
          ? <video src={originalUrl} controls playsInline className="ds-clean-media" />
          : (showOriginal || !previewUrl) && originalUrl
            ? <img src={originalUrl} alt="Ảnh gốc" className="ds-clean-media" />
            : previewUrl && isVideo
              ? <video src={previewUrl} controls playsInline className="ds-clean-media" />
              : previewUrl
                ? <img src={previewUrl} alt="Ảnh đã xử lý" className="ds-clean-media" />
            : <label className="ds-clean-empty">
                <span className="ds-clean-upload-icon">＋</span>
                <strong>Chọn ảnh để bắt đầu</strong>
                <span>Chạm để tải ảnh từ điện thoại</span>
                <input aria-label="Chọn ảnh" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void handleFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
              </label>}
      </div>

      {selectedFile && <div className="ds-clean-tools">
        {isImage && <button type="button" className="ds-clean-secondary" disabled={busy} onClick={() => setManualOpen(value => !value)}>
          {manualOpen ? 'Ẩn tô thủ công' : '✎ Tô vùng thủ công'}
        </button>}
        {previewUrl && <><button type="button" className="ds-clean-secondary" onClick={() => setShowOriginal(value => !value)}>{showOriginal ? 'Xem kết quả' : 'So sánh tệp gốc'}</button><a className="ds-clean-secondary" href={previewUrl} download={isVideo ? 'dsocial-clean.mp4' : 'dsocial-clean.png'}>Tải kết quả</a></>}
      </div>}

      {isImage && selectedFile && !manualOpen && <button type="button" className="ds-clean-primary" disabled={busy} onClick={() => void runAutomatic()}>
        {busy ? <><span className="ds-clean-spinner" />Đang xử lý…</> : '✦ Xóa watermark tự động'}
      </button>}

      {isVideo && selectedFile && <div className="ds-clean-video-tool">
        <ClientVideoEditor file={selectedFile} onProcessed={acceptOutput} onStatus={setNotice} />
      </div>}

      {manualOpen && selectedFile && isImage && <ManualMediaEditor file={selectedFile} onProcessed={acceptOutput} onStatus={setNotice} />}

      {(notice || result?.error) && <p className={result?.error ? 'ds-clean-notice ds-clean-error' : 'ds-clean-notice'} role={result?.error ? 'alert' : 'status'}>
        {result?.error ? (manualOpen ? 'Tô đỏ vùng logo cần xóa, sau đó bấm Xóa vùng đã tô.' : result.error) : notice}
      </p>}
      {result?.inspection && !manualOpen && <p className="ds-clean-meta">{result.inspection.width && result.inspection.height ? `${result.inspection.width} × ${result.inspection.height} px · ` : ''}{(result.inspection.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>}
      {busy && <button type="button" className="ds-clean-cancel" onClick={cancel}>Hủy</button>}
    </section>
    <footer className="ds-clean-footer">Tệp gốc được giữ riêng; xử lý cục bộ trên thiết bị. Luôn kiểm tra kết quả trước khi đăng.</footer>
  </main>
}
