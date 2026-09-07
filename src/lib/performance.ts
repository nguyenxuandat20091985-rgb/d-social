export const FEED_PAGE_SIZE = 12
export const FEED_SELECT = 'id,author_id,content,media_url,media_type,created_at,profiles(id,username,full_name,avatar_url),likes(user_id)'

export function feedRange(page: number, pageSize = FEED_PAGE_SIZE) {
  const safePage = Math.max(0, Math.floor(page))
  const from = safePage * pageSize
  return { from, to: from + pageSize - 1 }
}
