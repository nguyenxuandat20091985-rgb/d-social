import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let instance: FFmpeg | undefined
let loading: Promise<FFmpeg> | undefined

async function getFFmpeg(onProgress?: (progress: number, stage: string) => void) {
  if (instance?.loaded) return instance
  if (!loading) {
    loading = (async () => {
      const ffmpeg = new FFmpeg()
      ffmpeg.on('progress', ({ progress }) => onProgress?.(Math.max(0, Math.min(99, Math.round(progress * 100))), 'Đang xử lý video trên thiết bị…'))
      const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
      await ffmpeg.load({
        coreURL: await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm'),
      })
      instance = ffmpeg
      return ffmpeg
    })().catch(error => { loading = undefined; throw error })
  }
  return loading
}

export async function cropVideoCornersOnDevice(file: File, options: {
  signal?: AbortSignal
  onProgress?: (progress: number, stage: string) => void
} = {}): Promise<Blob> {
  if (!/^video\/(mp4|quicktime|webm|x-m4v)$/i.test(file.type)) throw new Error('Chỉ hỗ trợ video MP4, MOV hoặc WebM.')
  if (!file.size || file.size > 30 * 1024 * 1024) throw new Error('Video phải có dung lượng tối đa 30 MB.')
  if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý video.', 'AbortError')
  const ffmpeg = await getFFmpeg(options.onProgress)
  const inputName = 'dsocial-input.' + (file.type.includes('webm') ? 'webm' : file.type.includes('quicktime') ? 'mov' : 'mp4')
  const outputName = 'dsocial-cropped.mp4'
  try {
    options.onProgress?.(2, 'Đang nạp video vào bộ xử lý cục bộ…')
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()))
    if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý video.', 'AbortError')
    // Trim 2.5% from every edge, then scale back to the original frame size.
    // This is a conservative watermark-removal aid, not a detector or guarantee.
    await ffmpeg.exec(['-i', inputName, '-vf', 'crop=trunc(iw*0.95/2)*2:trunc(ih*0.95/2)*2:trunc(iw*0.025/2)*2:trunc(ih*0.025/2)*2,scale=trunc(iw/0.95/2)*2:trunc(ih/0.95/2)*2', '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputName])
    if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý video.', 'AbortError')
    const output = await ffmpeg.readFile(outputName)
    if (!(output instanceof Uint8Array) || output.byteLength < 100) throw new Error('Không tạo được video đầu ra hợp lệ.')
    options.onProgress?.(100, 'Đã xuất video đã crop. Hãy kiểm tra góc và âm thanh.')
    return new Blob([output], { type: 'video/mp4' })
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => undefined)
    await ffmpeg.deleteFile(outputName).catch(() => undefined)
  }
}
