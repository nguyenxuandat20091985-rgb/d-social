import { supabase } from './supabase'

export const MEDIA_PROCESSING_ENABLED =
  import.meta.env.VITE_MEDIA_PROCESSING_ENABLED === 'true'

type MediaType = 'image' | 'video'
type ProcessResult = { url: string }

const originalResult = (url: string): ProcessResult => ({ url })

/**
 * When the feature is enabled, processing is mandatory: errors must stop
 * publishing rather than silently falling back to the original branded media.
 */
export async function processUploadedMedia(input: {
  path: string
  mediaType: MediaType
  userId: string
  originalUrl: string
  rightsConfirmed: boolean
}): Promise<ProcessResult> {
  const { path, mediaType, userId, originalUrl, rightsConfirmed } = input
  if (!MEDIA_PROCESSING_ENABLED) return originalResult(originalUrl)
  if (!rightsConfirmed) throw new Error('Anh cần xác nhận quyền chỉnh sửa video/ảnh trước khi đăng.')
  if (!supabase) throw new Error('Dịch vụ xử lý media chưa sẵn sàng. Bài viết chưa được đăng.')

  if (
    !path.startsWith(`${userId}/`) ||
    path.startsWith('/') ||
    path.includes('..') ||
    path.includes('\\')
  ) {
    throw new Error('Đường dẫn media không hợp lệ. Bài viết chưa được đăng.')
  }

  const { data, error } = await supabase.functions.invoke('process-media', {
    body: {
      path,
      media_type: mediaType,
      rights_confirmed: true,
    },
  })
  if (error) throw new Error('Không xử lý được media. Bài viết chưa được đăng; hãy thử lại.')
  if (!data || data.status !== 'processed') {
    throw new Error('Media chưa được xác nhận đã xử lý sạch. Bài viết chưa được đăng.')
  }

  const processedPath = data.processed_path
  const sha256 = data.sha256
  const sizeBytes = data.size_bytes
  const expectedPrefix = `${userId}/processed/`
  if (
    typeof processedPath !== 'string' ||
    !processedPath.startsWith(expectedPrefix) ||
    processedPath.includes('..') ||
    processedPath.includes('\\') ||
    !/^[a-f0-9]{64}\\.(?:jpg|jpeg|png|webp|mp4|mov|m4v|webm)$/i.test(
      processedPath.slice(expectedPrefix.length),
    ) ||
    typeof sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    !processedPath.slice(expectedPrefix.length).startsWith(`${sha256}.`) ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0
  ) {
    throw new Error('Kết quả xử lý không hợp lệ. Bài viết chưa được đăng.')
  }

  const { data: publicData } = supabase.storage
    .from('social-media')
    .getPublicUrl(processedPath)
  if (!publicData?.publicUrl) {
    throw new Error('Không lấy được media đã xử lý. Bài viết chưa được đăng.')
  }
  return { url: publicData.publicUrl }
}
