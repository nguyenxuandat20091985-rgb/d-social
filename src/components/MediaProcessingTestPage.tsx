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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
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
    setDownloadUrl(url)
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
    setDownloadUrl(null)
    const originalUrl = keepUrl(URL.createObjectURL(file))
    setPreviewUrl(originalUrl)
    try {
      const inspection = await inspectMediaOnDevice(file, { signal: controller.signal, onProgress: () => undefined })
      if (controller.signal.aborted) return
      setResult({ inspection })
      if (inspection.mediaType === 'video') setNotice('Video đã sẵn sàng.')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setResult({ error: error instanceof Error ? error.message : 'Không đọc được tệp.' })
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  async function runAutomatic() {
    if (!selectedFile || busy || !selectedFile.type.startsWith('image/')) return
    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    setBusy(true)
    setNotice('')
    setResult(previous => ({ ...(previous ?? {}), error: undefined }))
    try {
      const cleanup = await cleanupCornerTextFromImage(selectedFile, {
        signal: controller.signal,
        onProgress: () => undefined,
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
        {selectedFile ? 'Đổi ảnh' : 'Chọn ảnh'}
        <input aria-label="Chọn ảnh hoặc video" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,video/x-m4v" disabled={busy} onChange={event => { void handleFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
      </label>
    </header>

    <section className="ds-clean-workspace">
      <div className={manualOpen ? "ds-clean-preview ds-clean-preview-hidden" : "ds-clean-preview"}>
        {previewUrl && isVideo && result?.inspection?.mediaType === 'video'
          ? <video src={previewUrl} controls playsInline className="ds-clean-media" />
          : previewUrl
            ? <img src={previewUrl} alt="Xem trước ảnh" className="ds-clean-media" />
            : <label className="ds-clean-empty">
                <span className="ds-clean-upload-icon">＋</span>
                <strong>Chọn ảnh để bắt đầu</strong>
                <span>Chạm để tải ảnh từ điện thoại</span>
                <input aria-label="Chọn ảnh" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void handleFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
              </label>}
        {busy && <div className="ds-clean-loading" aria-label="Đang xử lý" />}
      </div>

      {isImage && selectedFile && <div className="ds-clean-tools">
        <button type="button" className="ds-clean-secondary" disabled={busy} onClick={() => setManualOpen(value => !value)}>
          {manualOpen ? 'Ẩn tô thủ công' : '✎ Tô vùng thủ công'}
        </button>
        {downloadUrl && <a className="ds-clean-secondary" href={downloadUrl} download="dsocial-clean.png">Tải ảnh</a>}
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
    <footer className="ds-clean-footer">Ảnh được xử lý trên thiết bị của anh.</footer>
  </main>
}
