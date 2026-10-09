// @ts-nocheck
import React, { useEffect, useState } from 'react'
import {
  Heart, MessageCircle, LogOut, Image as ImageIcon, Video,
  MessageSquare, Home, X, Search, Download, Users,
  Bell, Plus, Moon, Sun, MoreHorizontal, Bookmark, Flag, Link2, RefreshCw, TrendingUp, Clock3, UsersRound, CirclePlus
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { moderateText } from './lib/moderation'
import { postRateLimit, commentRateLimit } from './lib/ratelimit'
import { AuthScreen } from './components/AuthScreen'
import { ProfilePage } from './components/ProfilePage'
import { Chat } from './components/ChatPanel'
import { Discover } from './components/DiscoverPanel'
import { Notifications } from './components/NotificationsPanel'
import { PublicProfilePage } from './components/PublicProfilePage'
import { ShareMenu } from './components/ShareMenu'
import { LOGO_SRC } from './lib/brand'

const MAX_IMAGE = 8 * 1024 * 1024
const MAX_VIDEO = 30 * 1024 * 1024

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('d_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    } catch { return 'light' }
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('d_theme', theme) } catch {}
  }, [theme])
  return { theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }
}

function Avatar({ src, name, size = 40, ring = false }) {
  const letter = (name || 'D').trim().charAt(0).toUpperCase()
  const img = src ? (
    <img src={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size, background: 'var(--d-surface-2)' }} />
  ) : (
    <div className="rounded-full font-black grid place-items-center shrink-0 text-white" style={{ width: size, height: size, fontSize: size * 0.42, background: 'var(--d-primary)' }}>{letter}</div>
  )
  if (!ring) return img
  return (
    <div className="rounded-full p-[2px]" style={{ width: size + 6, height: size + 6, background: 'var(--d-primary)' }}>
      <div className="rounded-full p-[2px] h-full w-full grid place-items-center" style={{ background: 'var(--d-surface)' }}>{img}</div>
    </div>
  )
}

function timeAgo(iso) {
  if (!iso) return '—'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút`
  if (s < 86400) return `${Math.floor(s / 3600)} giờ`
  if (s < 604800) return `${Math.floor(s / 86400)} ngày`
  return new Date(iso).toLocaleDateString('vi-VN')
}

function InstallBanner() {
  const [deferred, setDeferred] = useState(null)
  const [hidden, setHidden] = useState(() => localStorage.getItem('d_install_hide') === '1')
  useEffect(() => {
    const h = e => { e.preventDefault(); setDeferred(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  if (hidden || !deferred) return null
  return (
    <div className="d-card mx-0 mb-3 p-3 flex items-center gap-3 d-border-c">
      <Download size={18} style={{ color: 'var(--d-primary)' }} />
      <div className="flex-1 text-sm">
        <div className="font-bold">Cài D Social</div>
        <div className="d-muted text-xs">Dùng như app trên điện thoại</div>
      </div>
      <button className="d-btn-primary text-xs px-3 py-2" onClick={async () => { deferred.prompt(); await deferred.userChoice; setDeferred(null) }}>Cài</button>
      <button className="d-muted p-1" onClick={() => { localStorage.setItem('d_install_hide', '1'); setHidden(true) }}><X size={16} /></button>
    </div>
  )
}

function StoryRail({ people, stories = [], onCompose, onAddStory, onViewStory }) {
  const storyOwners = new Set(stories.map(s => s.user_id))
  return (
    <section className="d-card p-3 mb-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <div>
          <div className="font-black text-sm">Tin 24 giờ</div>
          <div className="text-[11px] d-muted">Ảnh/video tự hết hạn sau 24 giờ</div>
        </div>
        <button type="button" onClick={onAddStory} className="inline-flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2" style={{ color: 'var(--d-primary)', background: 'var(--d-primary-soft)' }}><CirclePlus size={16}/> Đăng tin</button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {people.slice(0, 12).map(p => {
          const story = stories.find(s => s.user_id === p.id)
          return <button type="button" key={p.id} onClick={() => story && onViewStory(story)} className="flex flex-col items-center gap-1.5 shrink-0 w-16" aria-label={story ? 'Xem tin của ' + (p.full_name || p.username) : (p.full_name || p.username || 'Thành viên')}>
            <Avatar src={p.avatar_url} name={p.full_name || p.username} size={52} ring={storyOwners.has(p.id)} />
            <span className="text-[10px] truncate w-full text-center" style={{ color: 'var(--d-text)' }}>{(p.full_name || p.username || 'User').split(' ').pop()}</span>
          </button>
        })}
      </div>
    </section>
  )
}

function Composer({ userId, onPublished, onClose }) {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(`d_home_draft_${userId}`) || '' } catch { return '' }
  })
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    try {
      const key = `d_home_draft_${userId}`
      if (text.trim()) localStorage.setItem(key, text)
      else localStorage.removeItem(key)
    } catch {}
  }, [text, userId])
  const pick = selected => {
    const incoming = Array.from(selected || [])
    if (!incoming.length) return
    const all = [...files, ...incoming]
    if (all.some(f => !['image/', 'video/'].some(x => f.type.startsWith(x)))) return setError('Chỉ hỗ trợ ảnh và video.')
    if (all.some(f => f.type.startsWith('video/')) && all.length > 1) return setError('Video phải đăng riêng; mỗi bài tối đa 10 ảnh.')
    if (all.length > 10) return setError('Mỗi bài đăng tối đa 10 ảnh.')
    if (all.some(f => f.size > (f.type.startsWith('video/') ? MAX_VIDEO : MAX_IMAGE))) return setError('Mỗi ảnh tối đa 8MB, video tối đa 30MB.')
    setError(''); setFiles(all)
  }
  const publish = async () => {
    if (busy) return
    setError('')
    if (!supabase) return setError('Kết nối dịch vụ bài viết chưa sẵn sàng. Vui lòng tải lại ứng dụng.')
    if (!userId) return setError('Anh cần đăng nhập lại trước khi đăng bài.')
    if (!text.trim() && !files.length) return setError('Nhập nội dung hoặc đính kèm ảnh/video trước khi đăng.')
    const mod = moderateText(text)
    if (!mod.allowed) return setError(mod.reason)
    if (!postRateLimit(userId)) return setError('Anh đăng quá nhanh. Vui lòng chờ 60 giây rồi thử lại.')

    setBusy(true)
    try {
      let media_url = null, media_type = null
      const image_urls = []
      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
        const path = `${userId}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('social-media').upload(path, file, { contentType: file.type, upsert: false })
        if (up.error) throw new Error(`Không tải được ${file.name}: ${up.error.message}`)
        const url = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl
        if (file.type.startsWith('video/')) { media_url = url; media_type = 'video' }
        else { image_urls.push(url); if (!media_url) media_url = url; media_type = 'image' }
      }
      const { error: err } = await supabase.from('posts').insert({
        author_id: userId, user_id: userId, content: text.trim() || null, media_url, media_type,
        image_urls: image_urls.length ? image_urls : null, is_published: true,
      })
      if (err) throw new Error(`Không lưu được bài viết: ${err.message}`)
      setText('')
      setFiles([])
      try { localStorage.removeItem(`d_home_draft_${userId}`) } catch {}
      await onPublished?.()
      onClose?.()
    } catch (e) {
      setError(e?.message || 'Không thể đăng bài. Vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-3"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose?.() }}
    >
      <section className="d-card w-full max-w-2xl max-h-[88vh] overflow-y-auto p-4 mb-0 shadow-2xl" role="dialog" aria-modal="true" aria-label="Tạo bài viết">
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-sm">Tạo bài viết</div>
          {onClose && <button type="button" onClick={onClose} className="d-muted p-2" aria-label="Đóng"><X size={18} /></button>}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Bạn đang nghĩ gì?" className="w-full bg-transparent resize-y outline-none min-h-[120px] text-[15px]" autoFocus />
        {files.length > 0 && <div className="space-y-2 mb-3">{files.map((file, index) => <div key={file.name + file.size + index} className="flex items-center justify-between gap-2 p-2 rounded-xl text-sm" style={{ background: 'var(--d-surface-2)' }}><span className="truncate">{file.type.startsWith('video/') ? '🎬 ' : '🖼️ '}{file.name}</span><button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} className="d-muted p-2" aria-label="Bỏ tệp"><X size={16} /></button></div>)}</div>}
        {error && <p role="alert" aria-live="polite" className="text-sm mb-2 break-words" style={{ color: 'var(--d-danger)' }}>{error}</p>}
        <div className="flex items-center justify-between gap-3 pt-3 border-t d-border-c">
          <label className="flex gap-3 d-muted cursor-pointer items-center min-h-11 px-2" aria-label="Chọn ảnh hoặc video">
            <ImageIcon size={20} /><Video size={20} />
            <input hidden type="file" accept="image/*,video/*" multiple onChange={e => { pick(e.target.files); e.target.value = '' }} />
          </label>
          <button type="button" disabled={busy} onClick={publish} className="d-btn-primary text-sm min-w-24 min-h-11">
            {busy ? 'Đang đăng...' : 'Đăng'}
          </button>
        </div>
      </section>
    </div>
  )
}

function PostCard({ post, userId, onRemoved }) {
  const [liked, setLiked] = useState(Boolean(userId && post.likes?.some(x => x.user_id === userId)))
  const [count, setCount] = useState(post.likes?.length || 0)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [menu, setMenu] = useState(false)
  const [saved, setSaved] = useState(false)
  const [content, setContent] = useState(post.content)
  const name = post.profiles?.full_name || post.profiles?.username || 'Thành viên D'
  const username = post.profiles?.username ? '@' + post.profiles.username : ''
  const isOwner = userId && (userId === post.author_id || userId === post.user_id)

  useEffect(() => {
    if (!supabase || !userId) return
    supabase.from('saved_posts').select('post_id').eq('user_id', userId).eq('post_id', post.id).maybeSingle()
      .then(({ data }) => setSaved(!!data))
  }, [userId, post.id])

  useEffect(() => {
    if (!supabase || !showComments) return
    const load = async () => {
      const { data } = await supabase.from('comments').select('id,content,created_at,author_id,profiles(full_name,username,avatar_url)').eq('post_id', post.id).order('created_at').limit(50)
      if (data) setComments(data)
    }
    load()
    const ch = supabase.channel('comments-' + post.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: 'post_id=eq.' + post.id }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [showComments, post.id])

  const toggleLike = async () => {
    if (!supabase || !userId) return
    if (liked) {
      const { error } = await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', userId)
      if (!error) { setLiked(false); setCount(c => Math.max(0, c - 1)) }
    } else {
      const { error } = await supabase.from('likes').insert({ post_id: post.id, user_id: userId })
      if (!error) {
        setLiked(true); setCount(c => c + 1)
        if (post.author_id && post.author_id !== userId) {
          try { await supabase.rpc('create_notification', { p_user_id: post.author_id, p_actor_id: userId, p_type: 'like', p_target_type: 'post', p_target_id: post.id, p_title: 'Lượt thích mới', p_body: 'đã thích bài viết của bạn' }) } catch {}
        }
      }
    }
  }

  const addComment = async () => {
    setCommentError('')
    if (commentBusy) return
    if (!supabase || !userId) return setCommentError('Anh cần đăng nhập để bình luận.')
    if (!comment.trim()) return setCommentError('Nhập nội dung bình luận trước khi gửi.')
    if (!commentRateLimit(userId)) return setCommentError('Anh bình luận quá nhanh. Vui lòng chờ rồi thử lại.')
    const mod = moderateText(comment)
    if (!mod.allowed) return setCommentError(mod.reason || 'Bình luận chưa được chấp nhận.')
    const body = comment.trim()
    setCommentBusy(true)
    try {
      const { error } = await supabase.from('comments').insert({ post_id: post.id, author_id: userId, content: body })
      if (error) throw new Error(error.message || 'Không gửi được bình luận.')
      setComment('')
      if (post.author_id && post.author_id !== userId) {
        try { await supabase.rpc('create_notification', { p_user_id: post.author_id, p_actor_id: userId, p_type: 'comment', p_target_type: 'post', p_target_id: post.id, p_title: 'Bình luận mới', p_body: body.slice(0, 120) }) } catch {}
      }
    } catch (e) {
      setCommentError(e?.message || 'Không gửi được bình luận. Vui lòng thử lại.')
    } finally {
      setCommentBusy(false)
    }
  }

  const toggleSave = async () => {
    if (!supabase || !userId) return
    if (saved) {
      const { error } = await supabase.from('saved_posts').delete().eq('user_id', userId).eq('post_id', post.id)
      if (!error) setSaved(false)
    } else {
      const { error } = await supabase.from('saved_posts').insert({ user_id: userId, post_id: post.id })
      if (!error) setSaved(true)
    }
  }

  const reportPost = async () => {
    const reason = prompt('Lý do báo cáo (spam, lừa đảo, nội dung xấu...)')
    if (!reason?.trim() || !supabase) return
    const { error } = await supabase.from('reports').insert({ reporter_id: userId, target_type: 'post', target_id: post.id, reason: reason.trim().slice(0, 500) })
    alert(error ? error.message : 'Đã gửi báo cáo. Cảm ơn bạn.')
    setMenu(false)
  }

  const deletePost = async () => {
    if (!confirm('Xóa bài viết này?') || !supabase) return
    let { error } = await supabase.from('posts').update({ deleted_at: new Date().toISOString(), is_published: false }).eq('id', post.id)
    if (error) {
      const r = await supabase.from('posts').delete().eq('id', post.id)
      error = r.error
    }
    if (error) alert(error.message)
    else { setMenu(false); onRemoved?.(post.id) }
  }

  const editPost = async () => {
    const next = prompt('Sửa nội dung bài viết', content || '')
    if (next === null || !supabase) return
    const { error } = await supabase.from('posts').update({ content: next.trim() || null }).eq('id', post.id)
    if (error) alert(error.message)
    else { setContent(next.trim() || null); setMenu(false) }
  }

  return (
    <article className="d-card overflow-hidden mb-3">
      <div className="px-4 pt-4 flex gap-3 items-start">
        <Avatar src={post.profiles?.avatar_url} name={name} size={42} />
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate leading-tight">{name}</div>
          <div className="text-xs d-muted mt-0.5">{username}{username && ' · '}{timeAgo(post.created_at)}</div>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setMenu(v => !v)} className="d-icon-btn" aria-label="Tùy chọn"><MoreHorizontal size={19} /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-10 z-20 w-48 d-card p-1 shadow-xl">
                <button type="button" onClick={() => { toggleSave(); setMenu(false) }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 hover:bg-[var(--d-surface-2)]">
                  <Bookmark size={16} />{saved ? 'Bỏ lưu' : 'Lưu bài viết'}
                </button>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/p/${post.id}`); setMenu(false) }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 hover:bg-[var(--d-surface-2)]">
                  <Link2 size={16} />Sao chép liên kết
                </button>
                {isOwner && (
                  <>
                    <button type="button" onClick={editPost} className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 hover:bg-[var(--d-surface-2)]">Sửa bài viết</button>
                    <button type="button" onClick={deletePost} className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 hover:bg-[var(--d-surface-2)]" style={{ color: 'var(--d-danger)' }}>Xóa bài viết</button>
                  </>
                )}
                {!isOwner && userId && (
                  <button type="button" onClick={reportPost} className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 hover:bg-[var(--d-surface-2)]">
                    <Flag size={16} />Báo cáo
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {content && <p className="px-4 pt-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words">{content}</p>}
      {post.media_url && (
        <div className="mt-3">
          {post.media_type === 'video' ? (
            <video src={post.media_url} controls playsInline preload="metadata" className="w-full max-h-[75vh] bg-black object-contain" />
          ) : (
            <img src={post.media_url} alt="" className="w-full max-h-[560px] object-cover" loading="lazy" />
          )}
        </div>
      )}
      <div className="px-4 pt-3 flex items-center justify-between text-xs d-muted">
        <span>{count ? `${count} lượt thích` : 'Chưa có lượt thích'}</span>
        <button type="button" onClick={() => setShowComments(true)}>{comments.length ? `${comments.length} bình luận` : 'Bình luận'}</button>
      </div>
      <div className="px-2 py-2 flex items-center gap-1 border-t d-border-c mt-1">
        <button type="button" onClick={toggleLike} className="d-post-action flex-1" style={{ color: liked ? 'var(--d-danger)' : undefined }}>
          <Heart size={18} fill={liked ? 'currentColor' : 'none'} /> Thích
        </button>
        <button type="button" onClick={() => setShowComments(v => !v)} className="d-post-action flex-1">
          <MessageCircle size={18} /> Bình luận
        </button>
        <ShareMenu postId={post.id} text={content} author={name} />
      </div>
      {showComments && (
        <div className="px-4 pb-4 space-y-2 border-t d-border-c pt-3">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2 text-sm">
              <Avatar src={c.profiles?.avatar_url} name={c.profiles?.full_name || c.profiles?.username} size={28} />
              <div className="min-w-0">
                <span className="font-semibold">{c.profiles?.full_name || c.profiles?.username || 'User'}</span>
                <span className="ml-2">{c.content}</span>
              </div>
            </div>
          ))}
          {commentError && <p role="alert" aria-live="polite" className="text-xs break-words" style={{ color: 'var(--d-danger)' }}>{commentError}</p>}
          <div className="flex gap-2 mt-2">
            <input className="d-input flex-1 text-sm py-2" value={comment} onChange={e => { setComment(e.target.value); if (commentError) setCommentError('') }} placeholder="Viết bình luận..." onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addComment()} />
            <button type="button" className="d-btn-primary text-xs px-3 min-h-10" disabled={commentBusy} onClick={addComment}>{commentBusy ? 'Đang gửi...' : 'Gửi'}</button>
          </div>
        </div>
      )}
    </article>
  )
}

function Feed({ userId }) {
  const [posts, setPosts] = useState([])
  const [people, setPeople] = useState([])
  const [stories, setStories] = useState([])
  const [showStoryComposer, setShowStoryComposer] = useState(false)
  const [viewingStory, setViewingStory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageLoading, setPageLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [showComposer, setShowComposer] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [feedMode, setFeedMode] = useState('latest')

  const load = async ({ append = false, mode = feedMode } = {}) => {
    if (!supabase) {
      setLoading(false)
      setLoadError('Dịch vụ bảng tin chưa kết nối. Vui lòng tải lại ứng dụng.')
      return
    }
    if (append) setPageLoading(true)
    else { setLoading(true); setLoadError(''); setHasMore(true) }
    try {
      let followedIds = null
      if (mode === 'following') {
        const follows = await supabase.from('follows').select('following_id').eq('follower_id', userId)
        if (follows.error) throw new Error('Chưa tải được danh sách đang theo dõi. Vui lòng thử lại.')
        followedIds = (follows.data || []).map(x => x.following_id).filter(Boolean)
        if (!followedIds.length) {
          setPosts([])
          setHasMore(false)
          const { data: peeps } = await supabase.from('profiles').select('id,username,full_name,avatar_url').order('created_at', { ascending: false }).limit(16)
          setPeople(peeps || [])
          return
        }
      }
      const offset = append ? posts.length : 0
      let query = supabase
        .from('posts')
        .select('id,author_id,user_id,content,media_url,media_type,is_published,created_at,likes(user_id),profiles!author_id(full_name,username,avatar_url)')
        .eq('is_published', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (followedIds) query = query.in('author_id', followedIds)
      let { data, error } = await query.range(offset, offset + 19)
      if (error) {
        let altQuery = supabase
          .from('posts')
          .select('id,author_id,user_id,content,media_url,media_type,is_published,created_at,likes(user_id),profiles!user_id(full_name,username,avatar_url)')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
        if (followedIds) altQuery = altQuery.in('user_id', followedIds)
        const alt = await altQuery.range(offset, offset + 19)
        if (alt.error) throw new Error(alt.error.message || 'Không thể tải bảng tin.')
        data = (alt.data || []).filter(p => !p.deleted_at)
      }
      const page = data || []
      setHasMore(page.length === 20)
      setPosts(current => {
        const combined = append ? [...current, ...page.filter(p => !current.some(old => old.id === p.id))] : page
        if (mode === 'popular') return [...combined].sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
        return combined
      })
      const { data: peeps } = await supabase.from('profiles').select('id,username,full_name,avatar_url').order('created_at', { ascending: false }).limit(16)
      setPeople(peeps || [])
      const { data: activeStories, error: storyError } = await supabase.from('stories').select('id,user_id,media_url,media_type,caption,created_at,expires_at,profiles!stories_user_id_fkey(full_name,username,avatar_url)').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(100)
      if (!storyError) setStories(activeStories || [])
    } catch (e) {
      setLoadError(e?.message || 'Không thể tải bảng tin. Vui lòng thử lại.')
    } finally {
      setLoading(false)
      setPageLoading(false)
    }
  }

  useEffect(() => { load({ mode: feedMode }) }, [userId, feedMode])

  const changeMode = mode => {
    if (mode === feedMode) return
    setFeedMode(mode)
    setPosts([])
    setLoading(true)
  }

  return (
    <div className="home-feed max-w-3xl mx-auto px-3 pb-24 pt-3">
      <InstallBanner />
      <div className="home-welcome mb-3">
        <div>
          <div className="text-xs font-semibold opacity-80">D SOCIAL</div>
          <h1 className="text-xl sm:text-2xl font-black mt-0.5">Bảng tin</h1>
          <p className="text-xs sm:text-sm opacity-80 mt-1">Cập nhật mới từ cộng đồng của bạn</p>
        </div>
      </div>
      <StoryRail people={people} stories={stories} onCompose={() => setShowComposer(true)} onAddStory={() => setShowStoryComposer(true)} onViewStory={setViewingStory} />
      {showStoryComposer && <StoryComposer userId={userId} onClose={() => setShowStoryComposer(false)} onPublished={() => load({ mode: feedMode })} />}
      {viewingStory && <StoryViewer story={viewingStory} onClose={() => setViewingStory(null)} />}
      {showComposer && <Composer userId={userId} onPublished={() => load({ mode: feedMode })} onClose={() => setShowComposer(false)} />}
      {!showComposer && (
        <section className="home-compose-teaser d-card mb-3"><button type="button" className="home-compose-open" onClick={() => setShowComposer(true)}><span className="home-compose-avatar">D</span><span className="flex-1 text-left">Bạn đang nghĩ gì?</span><Plus size={18} /></button><div className="home-compose-actions"><button type="button" onClick={() => setShowComposer(true)}><ImageIcon size={17} /> Ảnh / Video</button><button type="button" onClick={() => setShowComposer(true)}><MessageCircle size={17} /> Chia sẻ cảm xúc</button></div></section>
      )}
      <section className="d-card p-2 mb-3" aria-label="Lọc bảng tin">
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => changeMode('latest')} aria-pressed={feedMode === 'latest'} className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold ${feedMode === 'latest' ? 'd-btn-primary' : 'd-muted'}`}><Clock3 size={15} /> Mới nhất</button>
          <button type="button" onClick={() => changeMode('following')} aria-pressed={feedMode === 'following'} className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold ${feedMode === 'following' ? 'd-btn-primary' : 'd-muted'}`}><UsersRound size={15} /> Đang theo dõi</button>
          <button type="button" onClick={() => changeMode('popular')} aria-pressed={feedMode === 'popular'} className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold ${feedMode === 'popular' ? 'd-btn-primary' : 'd-muted'}`}><TrendingUp size={15} /> Nổi bật</button>
        </div>
      </section>
      <div className="home-feed-heading"><div><h2>{feedMode === 'latest' ? 'Bài viết mới' : feedMode === 'following' ? 'Từ người đang theo dõi' : 'Bài viết nổi bật'}</h2><p>{feedMode === 'latest' ? 'Chia sẻ và kết nối mỗi ngày' : feedMode === 'following' ? 'Cập nhật từ những tài khoản anh theo dõi' : 'Xếp theo lượt thích trong các bài đã tải'}</p></div><button type="button" onClick={() => load({ mode: feedMode })} disabled={loading || pageLoading} aria-label="Làm mới bảng tin" title="Làm mới bảng tin" className="home-refresh"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button></div>
      {loading && <div className="home-feed-loading"><span className="home-loading-dot" /> Đang tải bài viết...</div>}
      {!loading && loadError && <div className="d-card p-6 text-center"><p className="text-sm mb-3" style={{color: 'var(--d-danger)'}}>{loadError}</p><button type="button" className="d-btn-primary text-sm" onClick={() => load({ mode: feedMode })}>Thử tải lại</button></div>}
      {!loading && !loadError && posts.length === 0 && <div className="home-empty d-card p-8 text-center"><div className="home-empty-icon"><MessageSquare size={25}/></div><h3>{feedMode === 'following' ? 'Chưa có bài viết từ người anh theo dõi' : 'Chưa có bài viết mới'}</h3><p>{feedMode === 'following' ? 'Theo dõi hoặc kết bạn với mọi người để xem bài viết của họ tại đây.' : 'Hãy chia sẻ điều đầu tiên để bắt đầu cuộc trò chuyện cùng cộng đồng.'}</p><button type="button" className="d-btn-primary text-sm mt-4" onClick={() => setShowComposer(true)}><Plus size={16}/> Tạo bài viết</button></div>}
      {posts.map(p => (
        <PostCard key={p.id} post={p} userId={userId} onRemoved={(id) => setPosts(x => x.filter(y => y.id !== id))} />
      ))}
      {!loading && !loadError && posts.length > 0 && hasMore && <div className="text-center py-3"><button type="button" className="d-btn-primary text-sm px-5 py-3 min-h-11" disabled={pageLoading} onClick={() => load({ append: true, mode: feedMode })}>{pageLoading ? 'Đang tải thêm...' : 'Xem thêm bài viết'}</button></div>}
      {!loading && !loadError && posts.length > 0 && !hasMore && <p className="text-center text-xs d-muted py-4">Anh đã xem hết bài viết hiện có.</p>}
    </div>
  )
}

function Shell({ tab, setTab, onLogout, children, theme, onToggleTheme, chatBadge }) {
  const nav = [
    { id: 'feed', label: 'Trang chủ', icon: Home },
    { id: 'discover', label: 'Khám phá', icon: Search },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'notifs', label: 'Thông báo', icon: Bell },
    { id: 'profile', label: 'Tôi', icon: Users },
  ]
  return (
    <div className="min-h-screen" style={{ background: 'var(--d-bg)' }}>
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b d-border-c" style={{ background: 'var(--d-nav)' }}>
        <div className="flex items-center gap-2">
          {LOGO_SRC ? <img src={LOGO_SRC} alt="D" className="w-8 h-8 rounded-lg" /> : <div className="w-8 h-8 rounded-lg grid place-items-center text-white font-black text-sm" style={{ background: 'var(--d-primary)' }}>D</div>}
          <span className="font-black text-sm">D Social</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className="d-icon-btn" onClick={onToggleTheme} aria-label="Đổi theme">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button type="button" className="d-icon-btn" onClick={onLogout} aria-label="Đăng xuất"><LogOut size={18} /></button>
        </div>
      </header>
      <main>{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t d-border-c d-safe-bottom" style={{ background: 'var(--d-nav)' }}>
        <div className="max-w-xl mx-auto flex">
          {nav.map(n => (
            <button key={n.id} type="button" onClick={() => setTab(n.id)} className={`d-nav-item flex-1 ${tab === n.id ? 'active' : ''}`}>
              <span className="relative">
                <n.icon size={22} strokeWidth={tab === n.id ? 2.4 : 1.8} />
                {n.id === 'chat' && chatBadge > 0 && <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white grid place-items-center" style={{ background: 'var(--d-danger)' }}>{chatBadge > 9 ? '9+' : chatBadge}</span>}
              </span>
              <span className="text-[10px] font-semibold">{n.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('feed')
  const [legal, setLegal] = useState(null)
  const { theme, toggle: toggleTheme } = useTheme()
  const [chatBadge, setChatBadge] = useState(0)
  const [viewedProfileId, setViewedProfileId] = useState(null)

  useEffect(() => {
    const onBadge = e => setChatBadge(e.detail || 0)
    window.addEventListener('d-chat-unread', onBadge)
    return () => window.removeEventListener('d-chat-unread', onBadge)
  }, [])

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: 'var(--d-bg)', color: 'var(--d-muted)' }}>
        <div className="text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl animate-pulse" style={{ background: 'var(--d-primary)' }} />
          <p className="mt-3 text-sm">Đang tải D Social...</p>
        </div>
      </div>
    )
  }

  if (!session && supabase) return <AuthScreen onLegal={setLegal} />
  if (!session) return <div className="p-8 text-center">D Social</div>

  const logout = async () => { await supabase?.auth.signOut() }

  return (
    <Shell tab={tab} setTab={(next) => { setViewedProfileId(null); setTab(next) }} onLogout={logout} theme={theme} onToggleTheme={toggleTheme} chatBadge={chatBadge}>
      {tab === 'feed' && <Feed userId={session.user.id} />}
      {tab === 'discover' && (viewedProfileId ? <PublicProfilePage userId={session.user.id} profileId={viewedProfileId} onBack={() => setViewedProfileId(null)} /> : <Discover userId={session.user.id} onOpenProfile={setViewedProfileId} />)}
      {tab === 'chat' && <Chat userId={session.user.id} />}
      {tab === 'notifs' && <Notifications userId={session.user.id} />}
      {tab === 'profile' && <ProfilePage userId={session.user.id} />}
    </Shell>
  )
}
