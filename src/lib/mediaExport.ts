import { legacySettingsToLayers, normalizeCreatorLayers, type CreatorLayer } from './creatorLayers'

type CreatorSettings = {
  layers?: CreatorLayer[]
  colorFilter?: string
  overlayText?: string
  overlayFont?: string
  overlayColor?: string
  overlayX?: number
  overlayY?: number
  sticker?: string
  trimStart?: number
  trimEnd?: number
  originalVolume?: number
  musicVolume?: number
  audioSource?: string
  audioTrackUrl?: string
  brightness?: number
  contrast?: number
  saturation?: number
  hue?: number
  rotation?: number
  aspectRatio?: string
  cropMode?: string
  backgroundColor?: string
  playbackSpeed?: number
}

const FILTERS = {
  none: 'none',
  warm: 'saturate(1.15) sepia(.18)',
  mono: 'grayscale(1)',
  vivid: 'saturate(1.45) contrast(1.05)',
  cool: 'saturate(.9) hue-rotate(12deg)',
}

function filterForSettings(settings: CreatorSettings): string {
  const preset = FILTERS[settings.colorFilter as keyof typeof FILTERS]
  return [
    preset && preset !== 'none' ? preset : '',
    `brightness(${(100 + Number(settings.brightness ?? 0)) / 100})`,
    `contrast(${Number(settings.contrast ?? 100) / 100})`,
    `saturate(${Number(settings.saturation ?? 100) / 100})`,
    `hue-rotate(${Number(settings.hue ?? 0)}deg)`,
  ].filter(Boolean).join(' ')
}

function drawOverlay(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, settings: CreatorSettings) {
  const layers = normalizeCreatorLayers(settings.layers ?? legacySettingsToLayers(settings))
    .filter(layer => layer.visible)
  if (!layers.length) return

  const scale = canvas.width / 720
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.shadowColor = 'rgba(0,0,0,.85)'
  context.shadowBlur = 7 * scale
  context.shadowOffsetY = 2 * scale

  for (const layer of layers) {
    const x = canvas.width * layer.x / 100
    const y = canvas.height * layer.y / 100
    context.fillStyle = layer.color
    if (layer.kind === 'sticker') {
      context.font = `${Math.max(24, layer.fontSize * scale)}px ${layer.fontFamily}`
      context.fillText(layer.value, x, y)
      continue
    }
    if (layer.kind !== 'text') continue

    const maxWidth = canvas.width * .9
    let fontSize = Math.max(18, layer.fontSize * scale)
    context.font = `700 ${fontSize}px ${layer.fontFamily}`
    while (context.measureText(layer.value).width > maxWidth && fontSize > 14) {
      fontSize -= 2
      context.font = `700 ${fontSize}px ${layer.fontFamily}`
    }
    context.fillText(layer.value, x, y, maxWidth)
  }

  context.shadowColor = 'transparent'
  context.shadowBlur = 0
  context.shadowOffsetY = 0
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không kết xuất được media trên thiết bị này.')), type, quality))
}

async function processImage(file: File, settings: CreatorSettings): Promise<File> {
  const hasEdits = (settings.colorFilter && settings.colorFilter !== 'none') || normalizeCreatorLayers(settings.layers ?? legacySettingsToLayers(settings)).some(layer => layer.visible)
  if (!hasEdits) return file
  const imageUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = imageUrl
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Không đọc được ảnh để áp dụng chỉnh sửa.'))
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Thiết bị không hỗ trợ kết xuất ảnh.')
    context.filter = filterForSettings(settings)
    context.drawImage(image, 0, 0)
    context.filter = 'none'
    drawOverlay(context, canvas, settings)
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await canvasBlob(canvas, type, .92)
    const name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg')
    return new File([blob], name, { type, lastModified: Date.now() })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function waitForEvent(target: EventTarget, successEvent: string, errorEvent: string | null, timeoutMs = 12000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Hết thời gian chờ khi xử lý media.')), timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      target.removeEventListener(successEvent, onSuccess)
      if (errorEvent) target.removeEventListener(errorEvent, onError)
    }
    const finish = (error?: Error) => {
      cleanup()
      error ? reject(error) : resolve()
    }
    const onSuccess = () => finish()
    const onError = () => finish(new Error('Không thể đọc video/âm thanh để kết xuất.'))
    target.addEventListener(successEvent, onSuccess, { once: true })
    if (errorEvent) target.addEventListener(errorEvent, onError, { once: true })
  })
}

function chooseRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const options = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return options.find(type => MediaRecorder.isTypeSupported?.(type)) || ''
}

async function processVideo(file: File, settings: CreatorSettings, onProgress?: (percent: number) => void): Promise<File> {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('Trình duyệt này chưa hỗ trợ xuất video đã chỉnh sửa. Hãy cập nhật Chrome/Safari hoặc dùng trình duyệt khác.')
  }
  const videoUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.playsInline = true
  video.muted = false
  video.src = videoUrl
  let audioContext: AudioContext | null = null
  let music: HTMLAudioElement | null = null
  let animationFrame = 0
  let recorder: MediaRecorder | null = null
  let canvasStream: MediaStream | null = null
  try {
    await waitForEvent(video, 'loadedmetadata', 'error')
    const duration = Number(video.duration)
    video.playbackRate = 1.0
    const start = Math.max(0, Number(settings.trimStart) || 0)
    const requestedEnd = Number(settings.trimEnd)
    const end = Math.min(duration, Number.isFinite(requestedEnd) && requestedEnd > 0 ? requestedEnd : Math.min(60, duration))
    if (end - start < 15 || end - start > 60 || end > duration || start >= duration) {
      throw new Error('Video phải có đoạn xuất dài từ 15 đến 60 giây và nằm trong thời lượng video gốc.')
    }
    if (start > 0.05) {
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>
        const onSeek = () => { clearTimeout(timer); resolve() }
        timer = setTimeout(() => {
          video.removeEventListener('seeked', onSeek)
          reject(new Error('Không thể tua đến đoạn video đã chọn.'))
        }, 10000)
        video.addEventListener('seeked', onSeek, { once: true })
        video.currentTime = start
      })
    }

    const sourceWidth = video.videoWidth || 720
    const sourceHeight = video.videoHeight || 1280
    const ratioMap: Record<string, number> = { '9:16': 9 / 16, '16:9': 16 / 9, '1:1': 1, '4:5': 4 / 5 }
    const outputRatio = ratioMap[settings.aspectRatio || '9:16'] || sourceWidth / sourceHeight
    const longestSide = 1280
    const width = outputRatio >= 1 ? longestSide : Math.round(longestSide * outputRatio)
    const height = outputRatio >= 1 ? Math.round(longestSide / outputRatio) : longestSide
    const canvas = document.createElement('canvas')
    canvas.width = width - (width % 2)
    canvas.height = height - (height % 2)
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Không tạo được khung hình kết xuất.')
    const activeCanvasStream = canvas.captureStream(30)
    canvasStream = activeCanvasStream

    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextConstructor) throw new Error('Trình duyệt không hỗ trợ trộn âm thanh khi xuất video.')
    audioContext = new AudioContextConstructor()
    const destination = audioContext.createMediaStreamDestination()
    const originalGain = audioContext.createGain()
    originalGain.gain.value = Math.max(0, Math.min(100, Number(settings.originalVolume ?? 100))) / 100
    const originalSource = audioContext.createMediaElementSource(video)
    originalSource.connect(originalGain)
    originalGain.connect(destination)

    if (settings.audioSource === 'pixabay' && settings.audioTrackUrl) {
      music = document.createElement('audio')
      music.crossOrigin = 'anonymous'
      music.preload = 'auto'
      music.src = settings.audioTrackUrl
      const musicReady = waitForEvent(music, 'canplay', 'error', 15000)
      const musicSource = audioContext.createMediaElementSource(music)
      const musicGain = audioContext.createGain()
      musicGain.gain.value = Math.max(0, Math.min(100, Number(settings.musicVolume ?? 30))) / 100
      musicSource.connect(musicGain)
      musicGain.connect(destination)
      await musicReady
    }
    destination.stream.getAudioTracks().forEach(track => activeCanvasStream.addTrack(track))
    if (audioContext.state === 'suspended') await audioContext.resume()

    const mimeType = chooseRecorderMimeType()
    if (!mimeType) throw new Error('Trình duyệt không có định dạng MediaRecorder tương thích để xuất video.')
    const chunks: Blob[] = []
    const activeRecorder = new MediaRecorder(activeCanvasStream, { mimeType, videoBitsPerSecond: 3_500_000, audioBitsPerSecond: 128_000 })
    recorder = activeRecorder
    const recorded = new Promise<Blob>((resolve, reject) => {
      activeRecorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data) }
      activeRecorder.onerror = () => reject(new Error('Xuất video thất bại. Hãy thử lại với video ngắn hơn.'))
      activeRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: activeRecorder.mimeType || mimeType })
        if (!blob.size) reject(new Error('Tệp video kết xuất rỗng.'))
        else resolve(blob)
      }
    })
    const draw = () => {
      if (video.readyState >= 2) {
        context.fillStyle = settings.backgroundColor || '#000000'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.save()
        context.translate(canvas.width / 2, canvas.height / 2)
        const rotation = Number(settings.rotation || 0) * Math.PI / 180
        context.rotate(rotation)
        const srcW = video.videoWidth || 720
        const srcH = video.videoHeight || 1280
        const rotatedW = Math.abs(srcW * Math.cos(rotation)) + Math.abs(srcH * Math.sin(rotation))
        const rotatedH = Math.abs(srcW * Math.sin(rotation)) + Math.abs(srcH * Math.cos(rotation))
        const scale = settings.cropMode === 'cover'
          ? Math.max(canvas.width / rotatedW, canvas.height / rotatedH)
          : Math.min(canvas.width / rotatedW, canvas.height / rotatedH)
        context.filter = filterForSettings(settings)
        context.drawImage(video, -(srcW * scale) / 2, -(srcH * scale) / 2, srcW * scale, srcH * scale)
        context.restore()
        context.filter = 'none'
        drawOverlay(context, canvas, settings)
        const progress = Math.min(100, Math.round(((video.currentTime - start) / (end - start)) * 100))
        onProgress?.(progress)
      }
      if (video.currentTime < end && !video.ended && activeRecorder.state === 'recording') animationFrame = requestAnimationFrame(draw)
    }
    activeRecorder.start(250)
    // Call both play() methods in the same task so the browser schedules their
    // start together; awaiting music first would visibly delay the video.
    const playbackStarted = Promise.all([
      video.play(),
      ...(music ? [music.play()] : []),
    ])
    await playbackStarted
    draw()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('Xuất video quá thời gian chờ.'))
      }, Math.max(90000, (end - start) * 8000))
      const cleanup = () => {
        clearTimeout(timer)
        video.removeEventListener('timeupdate', onTimeUpdate)
        video.removeEventListener('error', onVideoError)
      }
      const stop = () => {
        cleanup()
        if (activeRecorder.state !== 'inactive') activeRecorder.stop()
        resolve()
      }
      const onTimeUpdate = () => {
        if (video.currentTime >= end) {
          video.pause()
          if (music) music.pause()
          stop()
        }
      }
      const onVideoError = () => {
        cleanup()
        reject(new Error('Video bị lỗi trong khi xuất.'))
      }
      video.addEventListener('timeupdate', onTimeUpdate)
      video.addEventListener('error', onVideoError, { once: true })
      // Some mobile browsers emit sparse timeupdate events near the end.
      if (video.currentTime >= end) stop()
    })
    const blob = await recorded
    const type = blob.type.includes('mp4') ? 'video/mp4' : 'video/webm'
    const extension = type === 'video/mp4' ? 'mp4' : 'webm'
    const output = new File([blob], file.name.replace(/\.[^.]+$/, '') + '-edited.' + extension, { type, lastModified: Date.now() })
    if (output.size > 30 * 1024 * 1024) throw new Error('Video sau chỉnh sửa vượt quá giới hạn 30MB. Hãy chọn đoạn ngắn hơn hoặc video có độ phân giải thấp hơn.')
    return output
  } finally {
    cancelAnimationFrame(animationFrame)
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop() } catch {}
    }
    music?.pause()
    if (audioContext && audioContext.state !== 'closed') await audioContext.close().catch(() => {})
    canvasStream?.getTracks().forEach(track => track.stop())
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(videoUrl)
  }
}

export async function processCreatorMedia(file: File, settings: CreatorSettings = {}, onProgress?: (percent: number) => void): Promise<File> {
  if (!file) return file
  if (file.type.startsWith('image/')) return processImage(file, settings)
  if (file.type.startsWith('video/')) return processVideo(file, settings, onProgress)
  return file
}
