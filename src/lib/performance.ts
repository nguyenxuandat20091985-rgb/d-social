export const FEED_PAGE_SIZE = 12
export const FEED_SELECT =
  'id,author_id,content,media_url,media_type,is_published,created_at,profiles!user_id(id,username,full_name,avatar_url,is_vip),likes(user_id)'

export type FeedCursor = { created_at: string; id: string }

export function buildFeedQuery(
  supabase: any,
  opts: { cursor?: FeedCursor | null; pageSize?: number; publishedOnly?: boolean }
) {
  const pageSize = opts.pageSize ?? FEED_PAGE_SIZE
  let q = supabase
    .from('posts')
    .select(FEED_SELECT)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize)

  if (opts.publishedOnly !== false) {
    q = q.eq('is_published', true)
  }

  if (opts.cursor) {
    const cAt = opts.cursor.created_at
    const cId = opts.cursor.id
    q = q.or(`created_at.lt.${cAt},and(created_at.eq.${cAt},id.lt.${cId})`)
  }

  return q
}
