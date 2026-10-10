import { supabase } from './supabase'

export const MEDIA_PROCESSING_ENABLED =
  import.meta.env.VITE_MEDIA_PROCESSING_ENABLED === 'true'

type MediaType = 'image' | 'video'
type ProcessResult = { url: string }

const originalResult = (url: string): ProcessResult => ({ url })

/**
 * Optional server-side media processing.
 *
 * Fallback A is intentional: any missing configuration, user consent, function
 * error, invalid response, or processor/storage failure returns the original URL.
 * No service token or service-role key is exposed to the browser.
 */
export async function processUploadedMedia(input: {
  path: string
  mediaType: MediaType
  userId: string
  originalUrl: string
  rightsConfirmed: boolean
}): Promise<ProcessResult> {
  const { path, mediaType, userId, originalUrl, rightsConfirmed } = input
  if (!MEDIA_PROCESSING_ENABLED || !rightsConfirmed || !supabase) {
    return originalResult(originalUrl)
  }
  if (
    !path.startsWith(`${userId}/`) ||
    path.startsWith('/') ||
    path.includes('..') ||
    path.includes('\\')
  ) {
    return originalResult(originalUrl)
  }

  try {
    const { data, error } = await supabase.functions.invoke('process-media', {
      body: {
        path,
        media_type: mediaType,
        rights_confirmed: true,
      },
    })
    if (error || !data || data.status !== 'processed') {
      return originalResult(originalUrl)
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
      !/^[a-f0-9]{64}\.(?:jpg|jpeg|png|webp|mp4|mov|m4v|webm)$/i.test(
        processedPath.slice(expectedPrefix.length),
      ) ||
      typeof sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(sha256) ||
      !processedPath.slice(expectedPrefix.length).startsWith(`${sha256}.`) ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes <= 0
    ) {
      return originalResult(originalUrl)
    }

    // Derive the URL locally from the validated object path rather than trusting
    // an arbitrary URL supplied by a remote response.
    const { data: publicData } = supabase.storage
      .from('social-media')
      .getPublicUrl(processedPath)
    if (!publicData?.publicUrl) return originalResult(originalUrl)

    return { url: publicData.publicUrl }
  } catch {
    // Never make media processing a prerequisite for posting.
    return originalResult(originalUrl)
  }
}
