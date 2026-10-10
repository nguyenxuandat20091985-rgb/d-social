/// <reference lib="webworker" />

type InspectRequest = {
  id: string
  kind: 'inspect'
  name: string
  mimeType: string
  bytes: ArrayBuffer
}

type WorkerRequest = InspectRequest

type WorkerResponse =
  | { id: string; type: 'progress'; progress: number; stage: string }
  | {
      id: string
      type: 'complete'
      result: {
        name: string
        mimeType: string
        sizeBytes: number
        sha256: string
        mediaType: 'image' | 'video'
        width?: number
        height?: number
      }
    }
  | { id: string; type: 'error'; message: string }

const scope = self as DedicatedWorkerGlobalScope
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_VIDEO_BYTES = 30 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'])

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (!request || request.kind !== 'inspect') return

  const send = (response: WorkerResponse) => scope.postMessage(response)
  try {
    const mediaType = request.mimeType.startsWith('image/') ? 'image' : 'video'
    const allowed = mediaType === 'image' ? IMAGE_TYPES : VIDEO_TYPES
    const maxBytes = mediaType === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES

    if (!allowed.has(request.mimeType.toLowerCase())) {
      throw new Error('Định dạng media chưa được hỗ trợ trên bộ xử lý thiết bị.')
    }
    if (request.bytes.byteLength === 0 || request.bytes.byteLength > maxBytes) {
      throw new Error(mediaType === 'image'
        ? 'Ảnh phải có dung lượng từ 1 byte đến 8 MB.'
        : 'Video phải có dung lượng từ 1 byte đến 30 MB.')
    }

    send({ id: request.id, type: 'progress', progress: 15, stage: 'Đang kiểm tra tệp…' })
    const digest = await crypto.subtle.digest('SHA-256', request.bytes)
    const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
    send({ id: request.id, type: 'progress', progress: 65, stage: 'Đang xác minh dữ liệu…' })

    const result: Extract<WorkerResponse, { type: 'complete' }>['result'] = {
      name: request.name,
      mimeType: request.mimeType,
      sizeBytes: request.bytes.byteLength,
      sha256,
      mediaType,
    }

    if (mediaType === 'image') {
      const bitmap = await createImageBitmap(new Blob([request.bytes], { type: request.mimeType }))
      try {
        if (!bitmap.width || !bitmap.height) throw new Error('Không đọc được kích thước ảnh.')
        if (bitmap.width * bitmap.height > 16_000_000) {
          throw new Error('Kích thước ảnh vượt giới hạn xử lý an toàn (16 megapixel).')
        }
        result.width = bitmap.width
        result.height = bitmap.height
      } finally {
        bitmap.close()
      }
    }

    send({ id: request.id, type: 'progress', progress: 100, stage: 'Đã kiểm tra tệp' })
    send({ id: request.id, type: 'complete', result })
  } catch (error) {
    send({
      id: request.id,
      type: 'error',
      message: error instanceof Error ? error.message : 'Không thể kiểm tra media trên thiết bị.',
    })
  }
}

export {}
