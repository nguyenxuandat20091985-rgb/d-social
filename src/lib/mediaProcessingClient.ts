export type ClientMediaKind = 'image' | 'video'

export type MediaInspection = {
  name: string
  mimeType: string
  sizeBytes: number
  sha256: string
  mediaType: ClientMediaKind
  width?: number
  height?: number
}

export type MediaProgress = {
  progress: number
  stage: string
}

type WorkerMessage =
  | { id: string; type: 'progress'; progress: number; stage: string }
  | { id: string; type: 'complete'; result: MediaInspection }
  | { id: string; type: 'error'; message: string }

/**
 * Phase 1 client-side media foundation.
 *
 * This deliberately only validates and fingerprints the selected file. It does
 * not claim to remove brand logos and must not be used as proof that media is
 * clean. Logo detection/cleanup is added in a later phase.
 */
export function inspectMediaOnDevice(
  file: File,
  options: {
    onProgress?: (progress: MediaProgress) => void
    signal?: AbortSignal
  } = {},
): Promise<MediaInspection> {
  if (typeof Worker === 'undefined' || typeof crypto?.subtle === 'undefined') {
    return Promise.reject(new Error('Thiết bị/trình duyệt chưa hỗ trợ kiểm tra media an toàn.'))
  }
  if (options.signal?.aborted) {
    return Promise.reject(new DOMException('Đã hủy xử lý media.', 'AbortError'))
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./media-processing/media.worker.ts', import.meta.url),
      { type: 'module', name: 'dsocial-media-inspection' },
    )
    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('')
    let settled = false

    const cleanup = () => {
      worker.terminate()
      options.signal?.removeEventListener('abort', onAbort)
    }
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const onAbort = () => finish(() => reject(new DOMException('Đã hủy xử lý media.', 'AbortError')))

    options.signal?.addEventListener('abort', onAbort, { once: true })
    worker.onerror = () => finish(() => reject(new Error('Bộ xử lý media trên thiết bị gặp lỗi.')))
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      if (!message || message.id !== id) return
      if (message.type === 'progress') {
        options.onProgress?.({ progress: message.progress, stage: message.stage })
      } else if (message.type === 'complete') {
        finish(() => resolve(message.result))
      } else {
        finish(() => reject(new Error(message.message)))
      }
    }

    file.arrayBuffer().then(
      bytes => {
        if (settled) return
        worker.postMessage({
          id,
          kind: 'inspect',
          name: file.name,
          mimeType: file.type,
          bytes,
        }, [bytes])
      },
      error => finish(() => reject(error instanceof Error ? error : new Error('Không đọc được tệp media.'))),
    )
  })
}
