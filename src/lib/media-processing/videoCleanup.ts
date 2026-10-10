import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let instance: FFmpeg | undefined
let loading: Promise<FFmpeg> | undefined

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds)
    promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}

function resetFFmpeg(ffmpeg?: FFmpeg) {
  try { ffmpeg?.terminate() } catch { /* already terminated */ }
  if (!ffmpeg || instance === ffmpeg) instance = undefined
  loading = undefined
}

async function getFFmpeg(onProgress?: (progress: number, stage: string) => void) {
  if (instance?.loaded) return instance
  if (!loading) {
    loading = (async () => {
      const ffmpeg = new FFmpeg()
      ffmpeg.on('progress', ({ progress }) => onProgress?.(Math.max(0, Math.min(99, Math.round(progress * 100))), 'Đang xử lý video trên thiết bị…'))
      const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
      await withTimeout((async () => ffmpeg.load({
        coreURL: await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm'),
      }))(), 20000, 'Khởi tạo bộ xử lý video mất quá lâu. Điện thoại có thể không đủ bộ nhớ; hãy thử video ngắn hơn.')
        .catch(error => { resetFFmpeg(ffmpeg); throw error })
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
  if (!file.size || file.size > 12 * 1024 * 1024) throw new Error('Để tránh treo điện thoại, video cần dưới 12 MB trong chế độ xử lý nhẹ.')
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
    await withTimeout(
      ffmpeg.exec(['-i', inputName, '-vf', 'crop=trunc(iw*0.95/2)*2:trunc(ih*0.95/2)*2:trunc(iw*0.025/2)*2:trunc(ih*0.025/2)*2,scale=trunc(iw/0.95/2)*2:trunc(ih/0.95/2)*2', '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', outputName]),
      45000,
      'Xử lý video vượt quá 45 giây. Đã dừng để tránh treo ứng dụng; hãy chọn video ngắn hơn hoặc dung lượng nhỏ hơn.',
    ).catch(error => { resetFFmpeg(ffmpeg); throw error })
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
