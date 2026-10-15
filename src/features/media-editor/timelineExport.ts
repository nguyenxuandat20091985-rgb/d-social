// @ts-nocheck
const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0))
const clipDuration = c => Math.max(0.1, (Number(c.out) || Number(c.sourceDuration) || 3) - (Number(c.in) || 0))
const waitEvent = (target, event, timeout = 15000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { cleanup(); reject(new Error('Hết thời gian chờ khi chuẩn bị media.')) }, timeout)
  const cleanup = () => { clearTimeout(timer); target.removeEventListener(event, done); target.removeEventListener('error', fail) }
  const done = () => { cleanup(); resolve() }, fail = () => { cleanup(); reject(new Error('Không đọc được tệp media đã chọn.')) }
  target.addEventListener(event, done, { once: true }); target.addEventListener('error', fail, { once: true })
})
const recorderMime = () => ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(t => window.MediaRecorder?.isTypeSupported?.(t)) || ''

function drawCover(ctx, source, width, height, mode = 'contain') {
  const sw = source.videoWidth || source.naturalWidth || source.width || 1
  const sh = source.videoHeight || source.naturalHeight || source.height || 1
  const scale = mode === 'cover' ? Math.max(width / sw, height / sh) : Math.min(width / sw, height / sh)
  const w = sw * scale, h = sh * scale
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h)
}

function drawText(ctx, settings, width, height) {
  const text = String(settings?.overlayText || '')
  if (!text) return
  const fontSize = clamp(settings.overlayFontSize || 48, 16, 120) * width / 1080
  ctx.save()
  ctx.font = `700 ${fontSize}px ${settings.overlayFont || 'Arial, sans-serif'}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const x = width * clamp(settings.overlayX ?? 50, 2, 98) / 100
  const y = height * clamp(settings.overlayY ?? 50, 4, 96) / 100
  ctx.lineWidth = Math.max(2, fontSize * .12); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = settings.overlayColor || '#ffffff'
  ctx.strokeText(text, x, y, width * .9); ctx.fillText(text, x, y, width * .9)
  ctx.restore()
}

/**
 * Render a multi-clip timeline into a browser-recorded Blob.
 * Audio mixing is intentionally deferred; Chrome Android's canvas recorder is the baseline.
 */
export async function exportToBlob(clips, settings = {}, options = {}) {
  if (!Array.isArray(clips) || !clips.length) throw new Error('Hãy chọn ảnh hoặc video trước khi xuất.')
  const total = clips.reduce((sum, clip) => sum + clipDuration(clip), 0)
  if (options.storyMode && total > 60) throw new Error('Tin 24 giờ chỉ được dài tối đa 60 giây.')
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error('Trình duyệt này chưa hỗ trợ xuất video. Hãy thử Chrome mới nhất trên Android.')
  const ratio = settings.aspectRatio || '9:16'
  const dimensions = ratio === '16:9' ? [1920,1080] : ratio === '1:1' ? [1080,1080] : ratio === '4:5' ? [1080,1350] : [1080,1920]
  const [width,height] = dimensions
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Không khởi tạo được canvas để xuất video.')
  const stream = canvas.captureStream(30)
  const mimeType = recorderMime()
  const chunks = []
  let recorder
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 5000000 } : { videoBitsPerSecond: 5000000 })
  } catch {
    stream.getTracks().forEach(t => t.stop())
    throw new Error('Thiết bị không hỗ trợ định dạng xuất video này.')
  }
  const recorded = new Promise((resolve,reject) => {
    recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data) }
    recorder.onerror = () => reject(new Error('MediaRecorder gặp lỗi khi xuất video.'))
    recorder.onstop = () => chunks.length ? resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' })) : reject(new Error('Video xuất ra rỗng.'))
  })
  let activeVideo = null, activeUrl = null, raf = 0
  try {
    recorder.start(250)
    for (const clip of clips) {
      const duration = clipDuration(clip)
      const sourceIn = Math.max(0, Number(clip.in) || 0)
      if (clip.kind === 'image' || clip.file?.type?.startsWith('image/')) {
        activeUrl = URL.createObjectURL(clip.file)
        const img = new Image(); img.src = activeUrl
        await (img.decode ? img.decode() : waitEvent(img, 'load'))
        const started = performance.now()
        while (performance.now() - started < duration * 1000) {
          drawCover(ctx, img, width, height, settings.cropMode === 'cover' ? 'cover' : 'contain')
          drawText(ctx, settings, width, height)
          await new Promise(resolve => { raf = requestAnimationFrame(resolve) })
        }
        URL.revokeObjectURL(activeUrl); activeUrl = null
        continue
      }
      if (!clip.file) throw new Error('Thiếu tệp video của một clip.')
      activeUrl = URL.createObjectURL(clip.file)
      const video = document.createElement('video'); activeVideo = video
      video.src = activeUrl; video.muted = true; video.playsInline = true; video.preload = 'auto'
      await waitEvent(video, 'loadedmetadata')
      const sourceDuration = Number.isFinite(video.duration) ? video.duration : Number(clip.sourceDuration) || sourceIn + duration
      const start = clamp(sourceIn, 0, sourceDuration)
      const end = clamp(Number(clip.out) || sourceDuration, start + .05, sourceDuration)
      video.currentTime = start
      await waitEvent(video, 'seeked')
      const started = performance.now()
      await video.play()
      while (video.currentTime < end && performance.now() - started < (end - start + 2) * 1000) {
        drawCover(ctx, video, width, height, settings.cropMode === 'cover' ? 'cover' : 'contain')
        drawText(ctx, settings, width, height)
        await new Promise(resolve => { raf = requestAnimationFrame(resolve) })
      }
      video.pause(); video.removeAttribute('src'); video.load(); activeVideo = null
      URL.revokeObjectURL(activeUrl); activeUrl = null
    }
    await new Promise(resolve => setTimeout(resolve, 120))
    if (recorder.state !== 'inactive') recorder.stop()
    return await recorded
  } catch (error) {
    if (recorder.state !== 'inactive') { try { recorder.stop() } catch {} }
    throw error
  } finally {
    cancelAnimationFrame(raf)
    if (activeVideo) { activeVideo.pause(); activeVideo.removeAttribute('src'); activeVideo.load() }
    if (activeUrl) URL.revokeObjectURL(activeUrl)
    stream.getTracks().forEach(t => t.stop())
  }
}

export function blobToVideoFile(blob, name = 'd-social-edited-video') {
  const type = blob.type?.includes('mp4') ? 'video/mp4' : 'video/webm'
  const ext = type === 'video/mp4' ? 'mp4' : 'webm'
  return new File([blob], `${name}.${ext}`, { type, lastModified: Date.now() })
}
