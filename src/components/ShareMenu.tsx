import React from 'react'
import { Share2 } from 'lucide-react'
import { sharePost, copyLink } from '../lib/share'

type Props = { postId: string; text?: string | null; author?: string | null }

export function ShareMenu({ postId, text, author }: Props) {
  const onShare = async () => {
    const result = await sharePost({ postId, text, author })
    if (!result.ok) {
      // Không mở popup/menu phụ. Trên thiết bị không hỗ trợ Web Share,
      // tự sao chép liên kết để thao tác chia sẻ vẫn liền mạch.
      await copyLink(postId)
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className="d-post-action"
      aria-label="Chia sẻ bài viết"
    >
      <Share2 size={18} /> Chia sẻ
    </button>
  )
}
