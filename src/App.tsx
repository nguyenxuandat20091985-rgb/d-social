// @ts-nocheck
import React, { useEffect, useState } from 'react'
import {
  Heart, MessageCircle, LogOut, Image as ImageIcon, Video,
  MessageSquare, Home, X, Search, Users,
  Bell, Plus, Moon, Sun
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { moderateText } from './lib/moderation'
import { postRateLimit, commentRateLimit } from './lib/ratelimit'
import { AuthScreen } from './components/AuthScreen'
import { ProfilePage } from './components/ProfilePage'
import { Chat } from './components/ChatPanel'
import { Discover } from './components/DiscoverPanel'
import { Notifications } from './components/NotificationsPanel'
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

function Avatar({ src, name, size = 40 }) {
  const letter = (name || 'D').trim().charAt(0).toUpperCase()
  if (src) return <img src={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size, background: 'var(--d-surface-2)' }} />
  return <div className="rounded-full font-black grid place-items-center shrink-0 text-white" style={{ width: size, height: size, fontSize: size * 0.42, background: 'var(--d-primary)' }}>{letter}</div>
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

function Composer({ userId, onPublished, onClose }) {
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pick = f => {
    if (!f) return
    const limit = f.type.startsWith('video/') ? MAX_VIDEO : MAX_IMAGE
    if (!['image/', 'video/'].some(x => f.type.startsWith(x)) || f.size > limit) return setError('File không hợp lệ (ảnh ≤8MB, video ≤30MB).')
    setError(''); setFile(f)
  }
  const publish = async () => {
    if (!supabase) return
    if (!postRateLimit(userId)) return setError('Bạn đăng quá nhanh, thử lại sau.')
    const mod = moderateText(text)
    if (!mod.allowed) return setError(mod.reason)
    if (!text.trim() && !file) return setError('Nhập nội dung hoặc đính kèm media.')
    setBusy(true); setError('')
    try {
      let media_url = null, media_type = null
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
        const path = `${userId}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('social-media').upload(path, file, { contentType: file.type, upsert: false })
        if (up.error) throw up.error
        media_url = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl
        media_type = file.type.startsWith('video/') ? 'video' : 'image'
      }
      const { error: err } = await supabase.from('posts').insert({
        author_id: userId, user_id: userId, content: text.trim() || null, media_url, media_type, is_published: true,
      })
      if (err) throw err
      setText(''); setFile(null); onPublished(); onClose?.()
    } catch (e) { setError(e.message || 'Không thể đăng') } finally { setBusy(false) }
  }
  return (
    <section className="d-card p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm">Tạo bài viết</div>
        {onClose && <button onClick={onClose} className="d-muted p-1"><X size={16} /></button>}
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Bạn đang nghĩ gì?" className="w-full bg-transparent resize-none outline-none min-h-[96px] text-[15px]" />
      {file && <div className="flex items-center justify-between p-2 rounded-xl text-sm mb-2" style={{ background: 'var(--d-surface-2)' }}><span className="truncate">{file.name}</span><button onClick={() => setFile(null)} className="d-muted p-1"><X size={16} /></button></div>}
      {error && <p className="text-sm mb-2" style={{ color: 'var(--d-danger)' }}>{error}</p>}
      <div className="flex items-center justify-between pt-2 border-t d-border-c">
        <label className="flex gap-3 d-muted cursor-pointer">
          <ImageIcon size={20} /><Video size={20} />
          <input hidden type="file" accept="image/*,video/*" onChange={e => pick(e.target.files?.[0])} />
        </label>
        <button disabled={busy} onClick={publish} className="d-btn-primary text-sm">{busy ? 'Đang đăng...' : 'Đăng'}</button>
      </div>
    </section>
  )
}

function PostCard({ post, userId }) {
  const [liked, setLiked] = useState(Boolean(userId && post.likes?.some(x => x.user_id === userId)))
  const [count, setCount] = useState(post.likes?.length || 0)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [comment, setComment] = useState('')
  const name = post.profiles?.full_name || post.profiles?.username || 'Thành viên D'
  const username = post.profiles?.username ? '@' + post.profiles.username : ''

  useEffect(() => {
    if (!supabase || !showComments) return
    supabase.from('comments').select('id,content,created_at,profiles(full_name,username,avatar_url)').eq('post_id', post.id).order('created_at').limit(40)
      .then(({ data }) => { if (data) setComments(data) })
  }, [showComments, post.id])

  const toggleLike = async () => {
    if (!supabase || !userId) return
    if (liked) {
      const { error } = await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', userId)
      if (!error) { setLiked(false); setCount(c => Math.max(0, c - 1)) }
    } else {
      const { error } = await supabase.from('likes').insert({ post_id: post.id, user_id: userId })
      if (!error) { setLiked(true); setCount(c => c + 1) }
    }
  }
  const addComment = async () => {
    if (!supabase || !userId || !comment.trim() || !commentRateLimit(userId)) return
    const mod = moderateText(comment)
    if (!mod.allowed) return
    const { error } = await supabase.from('comments').insert({ post_id: post.id, author_id: userId, content: comment.trim() })
    if (!error) {
      setComment('')
      const { data } = await supabase.from('comments').select('id,content,created_at,profiles(full_name,username,avatar_url)').eq('post_id', post.id).order('created_at').limit(40)
      if (data) setComments(data)
    }
  }

  return (
    <article className="d-card overflow-hidden mb-3">
      <div className="px-4 pt-4 flex gap-3 items-start">
        <Avatar src={post.profiles?.avatar_url} name={name} size={42} />
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate leading-tight">{name}</div>
          <div className="text-xs d-muted mt-0.5">{username}{username && ' · '}{timeAgo(post.created_at)}</div>
        </div>
      </div>
      {post.content && <p className="px-4 pt-3 text-[15px] leading-relaxed whitespace-pre-wrap">{post.content}</p>}
      {post.media_url && (
        <div className="mt-3">
          {post.media_type === 'video' ? (
            <video src={post.media_url} controls className="w-full max-h-[420px] bg-black" />
          ) : (
            <img src={post.media_url} alt="" className="w-full max-h-[480px] object-cover" />
          )}
        </div>
      )}
      <div className="px-2 py-2 flex items-center gap-1 border-t d-border-c mt-3">
        <button type="button" onClick={toggleLike} className="d-post-action flex-1" style={{ color: liked ? 'var(--d-danger)' : undefined }}>
          <Heart size={18} fill={liked ? 'currentColor' : 'none'} />{count > 0 ? count : ''}
        </button>
        <button type="button" onClick={() => setShowComments(v => !v)} className="d-post-action flex-1">
          <MessageCircle size={18} />{comments.length || ''}
        </button>
        <ShareMenu url={`${window.location.origin}/p/${post.id}`} />
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
          <div className="flex gap-2 mt-2">
            <input className="d-input flex-1 text-sm py-2" value={comment} onChange={e => setComment(e.target.value)} placeholder="Viết bình luận..." onKeyDown={e => e.key === 'Enter' && addComment()} />
            <button type="button" className="d-btn-primary text-xs px-3" onClick={addComment}>Gửi</button>
          </div>
        </div>
      )}
    </article>
  )
}

function Feed({ userId }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(false)

  const load = async () => {
    if (!supabase) return
    setLoading(true)
    try {
      let { data, error } = await supabase.from('posts').select('id,author_id,user_id,content,media_url,media_type,is_published,created_at,likes(user_id),profiles!author_id(full_name,username,avatar_url)').eq('is_published', true).order('created_at', { ascending: false }).limit(40)
      if (error || !data?.length) {
        const alt = await supabase.from('posts').select('id,author_id,user_id,content,media_url,media_type,is_published,created_at,likes(user_id),profiles!user_id(full_name,username,avatar_url)').eq('is_published', true).order('created_at', { ascending: false }).limit(40)
        data = alt.data || []
      }
      setPosts(data || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [userId])

  return (
    <div className="max-w-xl mx-auto px-3 pb-24 pt-2">
      <div className="home-welcome mb-3">
        <div>
          <h1 className="text-xl font-black">Xin chào 👋</h1>
          <p className="text-xs d-muted mt-0.5">Cộng đồng D Social văn minh</p>
        </div>
        <button type="button" className="home-welcome-btn" onClick={() => setShowComposer(true)}><Plus size={16} /> Đăng bài</button>
      </div>
      {showComposer && <Composer userId={userId} onPublished={load} onClose={() => setShowComposer(false)} />}
      {!showComposer && (
        <button type="button" className="d-card w-full p-3 mb-3 text-left text-sm d-muted" onClick={() => setShowComposer(true)}>
          Bạn đang nghĩ gì?
        </button>
      )}
      {loading && <div className="text-center text-sm d-muted py-8">Đang tải bảng tin...</div>}
      {!loading && posts.length === 0 && <div className="d-card p-8 text-center text-sm d-muted">Chưa có bài viết. Hãy là người đầu tiên đăng!</div>}
      {posts.map(p => <PostCard key={p.id} post={p} userId={userId} />)}
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
        <div className="flex items-center gap-1">
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
    <Shell tab={tab} setTab={setTab} onLogout={logout} theme={theme} onToggleTheme={toggleTheme} chatBadge={chatBadge}>
      {tab === 'feed' && <Feed userId={session.user.id} />}
      {tab === 'discover' && <Discover userId={session.user.id} />}
      {tab === 'chat' && <Chat userId={session.user.id} />}
      {tab === 'notifs' && <Notifications userId={session.user.id} />}
      {tab === 'profile' && <ProfilePage userId={session.user.id} />}
    </Shell>
  )
}
