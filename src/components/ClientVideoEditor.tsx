import React, { useState } from 'react'
import { cropVideoCornersOnDevice } from '../lib/media-processing/videoCleanup'

type Props = { file: File; onProcessed: (blob: Blob) => void; onStatus?: (message: string) => void }
export function ClientVideoEditor({ file, onProcessed, onStatus }: Props) {
  const [busy, setBusy] = useState(false)
  async function process() {
    if (busy) return
    setBusy(true)
    try {
      const output = await cropVideoCornersOnDevice(file, { onProgress: () => undefined })
      onProcessed(output)
    } catch (error) {
      onStatus?.('Không xử lý được video. Anh thử tệp khác hoặc giảm dung lượng.')
    } finally { setBusy(false) }
  }
  return <section className="ds-clean-video-card">
    <p className="ds-clean-hint">Video sẽ được xử lý trực tiếp trên điện thoại.</p>
    <button type="button" disabled={busy} onClick={() => void process()} className="ds-clean-primary">
      {busy ? <><span className="ds-clean-spinner" />Đang xử lý video…</> : 'Xóa watermark video'}
    </button>
  </section>
}
