import React, { useState } from 'react'
import { cropVideoCornersOnDevice } from '../lib/media-processing/videoCleanup'

type Props = { file: File; onProcessed: (blob: Blob) => void; onStatus?: (message: string) => void }
export function ClientVideoEditor({ file, onProcessed, onStatus }: Props) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  async function process() {
    if (busy) return
    setBusy(true); setProgress(0)
    try {
      const output = await cropVideoCornersOnDevice(file, { onProgress: (value, stage) => { setProgress(value); onStatus?.(stage) } })
      onProcessed(output)
    } catch (error) {
      onStatus?.(error instanceof Error ? error.message : 'Không xử lý được video trên thiết bị.')
    } finally { setBusy(false) }
  }
  return <section className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
    <h2 className="font-semibold">Xử lý video 0 đồng trên trình duyệt</h2>
    <p className="mt-1 text-sm leading-5 text-slate-600">FFmpeg.wasm crop nhẹ 2,5% mỗi cạnh, giữ lại âm thanh nếu có. Bộ FFmpeg tải lần đầu có thể khá lớn và điện thoại có thể nóng/chậm. Kiểm tra kỹ khung hình, âm thanh và chất lượng trước khi dùng.</p>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-700 transition-all" style={{ width: progress + '%' }}/></div>
    <button type="button" disabled={busy} onClick={() => void process()} className="mt-3 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Đang xử lý video…' : 'Crop nhẹ góc video trên máy'}</button>
  </section>
}
