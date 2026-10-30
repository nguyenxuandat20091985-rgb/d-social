// @ts-nocheck
/**
 * VideoStudio — entry point DUY NHẤT cho chỉnh sửa / xuất VIDEO khi tạo bài viết.
 *
 * Mục đích tách biệt:
 * - Ảnh nhiều file, caption, text post, feed, chat KHÔNG import file này.
 * - Chỉ mở khi user chọn 1 video (hoặc story video).
 * - Kết quả duy nhất trả về: File video đã xuất (hoặc null nếu hủy).
 *
 * Nội bộ vẫn dùng VideoTimelineEditor + timelineExport (không đổi logic trong bước tách này).
 * Bước sửa lỗi xuất video sau này chỉ sửa trong media-editor/*, Composer chỉ gọi API dưới đây.
 */
import React, { useRef, useState, useEffect } from 'react'
import { VideoTimelineEditor } from './VideoTimelineEditor'

/** Settings tối thiểu Composer cần biết — phần còn lại giữ trong Studio. */
export const DEFAULT_VIDEO_STUDIO_SETTINGS = {
  audioSource: 'original',
  originalVolume: 100,
  musicVolume: 30,
  colorFilter: 'none',
  zoom: 1,
  panX: 0,
  panY: 0,
  privacy: 'public',
  rightsConfirmed: false,
  trimStart: 0,
  trimEnd: 60,
  overlayText: '',
  overlayFont: 'Roboto, Arial, sans-serif',
  overlayColor: '#ffffff',
  overlayX: 50,
  overlayY: 50,
  sticker: '',
  taggedUsers: '',
  location: '',
}

/**
 * @param {object} props
 * @param {File} props.file                 — 1 video (bắt buộc). Ảnh không đi qua component này.
 * @param {File[]} [props.files]            — optional multi (hiếm); ưu tiên file đơn.
 * @param {object} [props.initialSettings]
 * @param {boolean} [props.storyMode]
 * @param {(file: File) => void | Promise<void>} props.onExported  — nhận File đã render sẵn
 * @param {() => void} props.onCancel
 * @param {(file: File) => void | Promise<void>} [props.onPublishStory] — chỉ story
 */
export function VideoStudio({
  file,
  files,
  initialSettings,
  storyMode = false,
  onExported,
  onCancel,
  onPublishStory,
}) {
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_VIDEO_STUDIO_SETTINGS,
    ...(initialSettings || {}),
  }))
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)

  // Chỉ chấp nhận video — guard an toàn, không xử lý ảnh.
  const videoFiles = (files && files.length ? files : file ? [file] : []).filter(
    f => f && f.type && f.type.startsWith('video/')
  )
  const primary = videoFiles[0] || null

  useEffect(() => {
    if (!primary) onCancel?.()
  }, [primary])

  if (!primary) return null

  const handleContinuePost = async outputFile => {
    if (!outputFile) return
    await onExported?.(outputFile)
  }

  const handleClose = () => {
    setPlaying(false)
    onCancel?.()
  }

  return (
    <VideoTimelineEditor
      file={primary}
      files={videoFiles}
      settings={settings}
      onChange={setSettings}
      videoRef={videoRef}
      isPlaying={playing}
      onTogglePlayback={() => setPlaying(p => !p)}
      storyMode={storyMode}
      onContinuePost={handleContinuePost}
      onPublishStory={onPublishStory}
      onCloseEditor={handleClose}
    />
  )
}

/**
 * Helper: Composer chỉ mở Studio khi file là video.
 * Ảnh / mixed → return false, giữ path ảnh cũ.
 */
export function shouldOpenVideoStudio(selectedFiles) {
  const list = Array.from(selectedFiles || [])
  if (!list.length) return false
  const hasVideo = list.some(f => f.type?.startsWith('video/'))
  const hasImage = list.some(f => f.type?.startsWith('image/'))
  // Video phải đăng riêng — không mở Studio nếu lẫn ảnh.
  if (hasVideo && hasImage) return false
  if (hasVideo && list.length === 1) return true
  if (hasVideo && list.every(f => f.type?.startsWith('video/'))) return true
  return false
}
