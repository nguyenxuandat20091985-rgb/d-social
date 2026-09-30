// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Heart, MessageCircle, Send, User, LogOut, Image as ImageIcon, Video,
  MessageSquare, Home, X, Flag, Search, Shield, Download, Sparkles, Users,
  Bell, Plus
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { moderateText } from './lib/moderation'
import { postRateLimit, commentRateLimit, messageRateLimit } from './lib/ratelimit'
import { FEED_PAGE_SIZE, buildFeedQuery } from './lib/performance'
import { ShareMenu } from './components/ShareMenu'
import { AuthScreen } from './components/AuthScreen'
import { ProfilePage } from './components/ProfilePage'
import './index.css'

const MAX_IMAGE = 8 * 1024 * 1024
const MAX_VIDEO = 30 * 1024 * 1024

function getRoute() {
  const path = window.location.pathname
  const hash = window.location.hash
  const m = path.match(/^\/p\/([0-9a-f-]{36})$/i) || hash.match(/^#\/p\/([0-9a-f-]{36})$/i)
  if (m) return { name: 'public-post', postId: m[1] }
  if (path === '/admin' || hash === '#/admin') return { name: 'admin' }
  return { name: 'app' }
}

function Avatar({ src, name, size = 40, ring = false }) {
  const letter = (name || 'D').trim().charAt(0).toUpperCase()
  const img = src ? (
    <img src={src} alt="" className="rounded-full object-cover bg-slate-700 shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-slate-950 font-black grid place-items-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.42 }}>{letter}</div>
  )
  if (!ring) return img
  return (
    <div className="rounded-full p-[2px] bg-gradient-to-br from-cyan-400 via-violet-400 to-fuchsia-400" style={{ width: size + 6, height: size + 6 }}>
      <div className="rounded-full bg-slate-950 p-[2px] h-full w-full grid place-items-center">{img}</div>
    </div>
  )
}

function timeAgo(iso) {
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
    <div className="d-card mx-3 mt-3 p-3 flex items-center gap-3 border-cyan-500/30">
      <Download size={18} className="text-cyan-300" />
      <div className="flex-1 text-sm">
        <div className="font-bold">Cài D Social</div>
        <div className="text-slate-400 text-xs">Dùng như app trên điện thoại</div>
      </div>
      <button className="d-btn-primary text-xs px-3 py-2" onClick={async () => { deferred.prompt(); await deferred.userChoice; setDeferred(null) }}>Cài</button>
      <button className="text-slate-500 p-1" onClick={() => { localStorage.setItem('d_install_hide', '1'); setHidden(true) }}><X size={16} /></button>
    </div>
  )
}

function Legal({ kind, onBack }) {
  const isTerms = kind === 'terms'
  return (
    <main className="max-w-2xl mx-auto p-4 pb-24">
      <button onClick={onBack} className="mb-4 text-cyan-300 text-sm">← Quay lại</button>
      <article className="d-card p-6 space-y-4">
        <h1 className="text-2xl font-black">{isTerms ? 'Điều khoản sử dụng' : 'Chính sách bảo mật'}</h1>
        {isTerms ? (
          <>
            <p className="text-slate-300 text-sm leading-relaxed">D Social là mạng xã hội độc lập. Người dùng phải tuân thủ pháp luật Việt Nam; không đăng nội dung bạo lực, khiêu dâm, lừa đảo, thù hận, spam hoặc xâm phạm bản quyền / dữ liệu cá nhân.</p>
            <p className="text-slate-300 text-sm leading-relaxed">Vi phạm có thể bị ẩn bài hoặc khóa tài khoản. Dùng nút Báo cáo trên bài viết. D Social không liên kết Meta/Facebook — giao diện và thương hiệu là thiết kế gốc.</p>
            <p className="text-slate-300 text-sm leading-relaxed">Core social (đăng bài, like, bình luận, chat, theo dõi) miễn phí. VIP chỉ bổ sung tiện ích tùy chọn, không khóa giao tiếp cơ bản.</p>
          </>
        ) : (
          <>
            <p className="text-slate-300 text-sm leading-relaxed">Thu thập email, hồ sơ và nội dung bạn đăng để vận hành dịch vụ. Bảo vệ bằng Auth + RLS (Row Level Security). Không bán dữ liệu cá nhân.</p>
            <p className="text-slate-300 text-sm leading-relaxed">Bạn có thể yêu cầu xóa tài khoản và dữ liệu liên quan qua email hỗ trợ hoặc tính năng xóa trong hồ sơ (khi có). Tin nhắn chỉ người gửi/nhận đọc được. Báo cáo được lưu để xử lý kiểm duyệt.</p>
          </>
        )}
      </article>
    </main>
  )
}

function StoryRail({ people, onCompose }) {
  return (
    <div className="d-card p-3 mb-3">
      <div className="flex gap-3 overflow-x-auto pb-1">
        <button onClick={onCompose} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
          <div className="w-14 h-14 rounded-full bg-slate-800 border-2 border-dashed border-cyan-400/50 grid place-items-center text-cyan-300"><Plus size={22} /></div>
          <span className="text-[10px] text-slate-400 truncate w-full text-center">Đăng bài</span>
        </button>
        {people.slice(0, 12).map(p => (
          <div key={p.id} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
            <Avatar src={p.avatar_url} name={p.full_name || p.username} size={52} ring />
            <span className="text-[10px] text-slate-400 truncate w-full text-center">{(p.full_name || p.username || 'User').split(' ').pop()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Composer({ userId, onPublished, autoFocus, onClose }) {
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
      try {
        const ai = await fetch('/api/ai/moderate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text || '' }) }).then(r => r.json())
        if (ai?.action === 'hide') { setError('Nội dung không phù hợp cộng đồng văn minh.'); setBusy(false); return }
      } catch {}
      let media_url = null, media_type = null
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
        const path = `${userId}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('social-media').upload(path, file, { contentType: file.type, upsert: false })
        if (up.error) throw up.error
        media_url = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl
        media_type = file.type.startsWith('video/') ? 'video' : 'image'
      }
      const { error } = await supabase.from('posts').insert({ author_id: userId, user_id: userId, content: text.trim() || null, media_url, media_type, is_published: true })
      if (error) throw error
      setText(''); setFile(null); onPublished(); onClose?.()
    } catch (e) { setError(e.message || 'Không thể đăng') } finally { setBusy(false) }
  }
  return (
    <section className="d-card p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm">Tạo bài viết</div>
        {onClose && <button onClick={onClose} className="text-slate-500 p-1"><X size={16} /></button>}
      </div>
      <textarea autoFocus={autoFocus} value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Bạn đang nghĩ gì?" className="w-full bg-transparent resize-none outline-none min-h-[96px] text-[15px] placeholder:text-slate-500" />
      {file && <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/80 text-sm mb-2"><span className="truncate">{file.name}</span><button onClick={() => setFile(null)} className="text-slate-400 p-1"><X size={16} /></button></div>}
      {error && <p className="text-rose-400 text-sm mb-2">{error}</p>}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <label className="flex gap-3 text-slate-400 cursor-pointer">
          <ImageIcon size={20} className="hover:text-cyan-300" /><Video size={20} className="hover:text-violet-300" />
          <input hidden type="file" accept="image/*,video/*" onChange={e => pick(e.target.files?.[0])} />
        </label>
        <button disabled={busy} onClick={publish} className="d-btn-primary text-sm">{busy ? 'Đang đăng...' : 'Đăng'}</button>
      </div>
    </section>
  )
}

function PostCard({ post, userId }) {
  const [liked, setLiked] = useState(Boolean(userId && post.likes?.some(x => x.user_id === userId)))
  const [comments, setComments] = useState([])
  const [show, setShow] = useState(false)
  const [comment, setComment] = useState('')
  const [count, setCount] = useState(post.likes?.length || 0)
  useEffect(() => {
    if (!supabase || !show) return
    loadComments()
    const ch = supabase.channel(`comments-${post.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${post.id}` }, loadComments).subscribe()
    return () => { supabase!.removeChannel(ch) }
  }, [show, post.id])
  const loadComments = async () => {
    if (!supabase) return
    const { data } = await supabase.from('comments').select('id,post_id,author_id,content,created_at,profiles(id,username,full_name,avatar_url)').eq('post_id', post.id).order('created_at', { ascending: true }).limit(50)
    if (data) setComments(data)
  }
  const toggleLike = async () => {
    if (!supabase || !userId) return
    if (liked) { await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', userId); setLiked(false); setCount(x => Math.max(0, x - 1)) }
    else { const { error } = await supabase.from('likes').insert({ post_id: post.id, user_id: userId }); if (!error) { setLiked(true); setCount(x => x + 1) } }
  }
  const addComment = async () => {
    if (!supabase || !userId) return
    if (!commentRateLimit(userId)) return
    const mod = moderateText(comment)
    if (!mod.allowed || !comment.trim()) return
    const { error } = await supabase.from('comments').insert({ post_id: post.id, author_id: userId, content: comment.trim() })
    if (!error) setComment('')
  }
  const name = post.profiles?.full_name || post.profiles?.username || 'Thành viên D'
  return (
    <article className="d-card p-4 sm:p-5">
      <div className="flex gap-3 items-start">
        <Avatar src={post.profiles?.avatar_url} name={name} />
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate">{name}</div>
          <div className="text-xs text-slate-500">{timeAgo(post.created_at)}</div>
        </div>
      </div>
      {post.content && <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{post.content}</p>}
      {post.media_url && (post.media_type === 'video' ? <video src={post.media_url} controls className="mt-3 rounded-xl w-full max-h-[520px] bg-black" /> : <img src={post.media_url} loading="lazy" alt="" className="mt-3 rounded-xl w-full max-h-[520px] object-cover" />)}
      <div className="flex gap-5 mt-4 text-slate-400 items-center flex-wrap text-sm">
        {userId ? (
          <button onClick={toggleLike} className={`flex gap-1.5 items-center ${liked ? 'text-pink-400' : 'hover:text-pink-300'}`}>
            <Heart size={18} fill={liked ? 'currentColor' : 'none'} />{count}
          </button>
        ) : (
          <span className="flex gap-1.5 items-center"><Heart size={18} />{count}</span>
        )}
        {userId && <button onClick={() => setShow(x => !x)} className="flex gap-1.5 items-center hover:text-cyan-300"><MessageCircle size={18} />{show ? 'Ẩn' : 'Bình luận'}</button>}
        <ShareMenu postId={post.id} text={post.content} author={post.profiles?.full_name || post.profiles?.username} />
        {userId && userId !== post.author_id && (
          <button onClick={async () => {
            const reason = prompt('Lý do báo cáo (spam, lừa đảo, bản quyền...)')
            if (!reason || !supabase) return
            const { error } = await supabase.from('reports').insert({ reporter_id: userId, target_type: 'post', target_id: post.id, reason: reason.slice(0, 500) })
            alert(error ? error.message : 'Đã gửi báo cáo.')
          }} className="flex gap-1 items-center text-slate-500 hover:text-amber-400"><Flag size={16} />Báo cáo</button>
        )}
      </div>
      {show && userId && (
        <div className="mt-4 border-t border-slate-800 pt-3 space-y-3">
          {comments.map(c => (
            <div key={c.id} className="text-sm flex gap-2">
              <Avatar src={c.profiles?.avatar_url} name={c.profiles?.full_name || c.profiles?.username} size={28} />
              <div className="bg-slate-800/70 rounded-2xl px-3 py-2 flex-1">
                <b className="text-xs">{c.profiles?.full_name || c.profiles?.username || 'User'}</b>
                <div className="text-slate-200">{c.content}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={comment} onChange={e => setComment(e.target.value)} maxLength={1000} placeholder="Viết bình luận..." className="d-input flex-1 py-2.5 text-sm" onKeyDown={e => e.key === 'Enter' && addComment()} />
            <button onClick={addComment} className="d-btn-primary px-3"><Send size={16} /></button>
          </div>
        </div>
      )}
    </article>
  )
}

function Feed({ userId }) {
  const [posts, setPosts] = useState([])
  const [people, setPeople] = useState([])
  const [cursor, setCursor] = useState(null)
  const [more, setMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const sentinel = useRef(null)
  const loadingRef = useRef(false)
  const load = async (reset = false) => {
    if (!supabase || loadingRef.current) return
    loadingRef.current = true; setLoading(true); setError('')
    try {
      const q = buildFeedQuery(supabase, { cursor: reset ? null : cursor, pageSize: FEED_PAGE_SIZE, publishedOnly: true })
      const { data, error: qErr } = await q
      if (qErr) throw qErr
      const rows = data || []
      if (reset) setPosts(rows)
      else setPosts(prev => { const seen = new Set(prev.map(p => p.id)); return [...prev, ...rows.filter(r => !seen.has(r.id))] })
      if (rows.length) { const last = rows[rows.length - 1]; setCursor({ created_at: last.created_at, id: last.id }) }
      setMore(rows.length === FEED_PAGE_SIZE)
    } catch (e) { setError(e.message || 'Lỗi tải feed') } finally { setLoading(false); loadingRef.current = false }
  }
  useEffect(() => {
    load(true)
    if (!supabase) return
    supabase.from('profiles').select('id,username,full_name,avatar_url').neq('id', userId).limit(20).then(({ data }) => setPeople(data || []))
    const ch = supabase.channel('feed-realtime').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => load(true)).subscribe()
    return () => { supabase!.removeChannel(ch) }
  }, [])
  useEffect(() => {
    if (!sentinel.current || !more) return
    const io = new IntersectionObserver(ents => { if (ents[0]?.isIntersecting && more && !loadingRef.current) load(false) }, { rootMargin: '240px' })
    io.observe(sentinel.current)
    return () => io.disconnect()
  }, [more, cursor])
  return (
    <>
      <StoryRail people={people} onCompose={() => setShowComposer(true)} />
      {showComposer ? (
        <Composer userId={userId} onPublished={() => load(true)} autoFocus onClose={() => setShowComposer(false)} />
      ) : (
        <button onClick={() => setShowComposer(true)} className="d-card p-4 mb-3 w-full text-left flex items-center gap-3 hover:border-cyan-500/30 transition">
          <Avatar name="+" size={40} />
          <span className="text-slate-400 text-sm flex-1">Bạn đang nghĩ gì?</span>
          <ImageIcon size={18} className="text-slate-500" />
        </button>
      )}
      <div className="space-y-3">
        {posts.map(p => <PostCard key={p.id} post={p} userId={userId} />)}
        {!posts.length && !loading && <div className="d-card p-10 text-center text-slate-500">Chưa có bài viết. Hãy chia sẻ điều tích cực!</div>}
        {error && <div className="text-center text-rose-400 py-4">{error}</div>}
        {loading && <div className="text-center text-slate-500 py-4 text-sm">Đang tải...</div>}
        <div ref={sentinel} className="h-6" />
      </div>
    </>
  )
}

function PublicPostPage({ postId, session }) {
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!supabase) { setErr('Chưa cấu hình'); setLoading(false); return }
    ;(async () => {
      const { data, error } = await supabase.from('posts').select('id,author_id,content,media_url,media_type,created_at,profiles!user_id(id,username,full_name,avatar_url),likes(user_id)').eq('id', postId).maybeSingle()
      if (error) setErr(error.message)
      else if (!data) setErr('Bài không tồn tại hoặc đã ẩn.')
      else setPost(data)
      setLoading(false)
    })()
  }, [postId])
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="font-black text-xl bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent">D</a>
          <span className="text-sm text-slate-400">Bài công khai</span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-3 py-4">
        {loading && <p className="text-center text-slate-500 py-12">Đang tải...</p>}
        {err && <p className="text-center text-slate-400 py-12">{err}</p>}
        {post && <PostCard post={post} userId={session?.user?.id} />}
      </main>
    </div>
  )
}

function Chat({ userId }) {
  const [users, setUsers] = useState([])
  const [q, setQ] = useState('')
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const bottom = useRef(null)
  useEffect(() => {
    if (!supabase) return
    supabase.from('profiles').select('id,username,full_name,avatar_url').neq('id', userId).limit(80).then(({ data }) => setUsers(data || []))
  }, [userId])
  useEffect(() => {
    if (!supabase || !active) return
    const load = async () => {
      const { data } = await supabase!.from('messages').select('*').or(`and(sender_id.eq.${userId},recipient_id.eq.${active.id}),and(sender_id.eq.${active.id},recipient_id.eq.${userId})`).order('created_at', { ascending: true }).limit(200)
      if (data) {
        setMessages(data)
        const unread = data.filter(m => m.recipient_id === userId && !m.read_at).map(m => m.id)
        if (unread.length) {
          await supabase!.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread)
        }
      }
    }
    load()
    const ch = supabase.channel(`chat-${userId}-${active.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const m = payload.new
      if ((m.sender_id === userId && m.recipient_id === active.id) || (m.sender_id === active.id && m.recipient_id === userId))
        setMessages(x => (x.some(y => y.id === m.id) ? x : [...x, m]))
    }).subscribe()
    return () => { supabase!.removeChannel(ch) }
  }, [active, userId])
  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [messages])
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter(u => (u.full_name || '').toLowerCase().includes(s) || (u.username || '').toLowerCase().includes(s))
  }, [users, q])
  const send = async () => {
    if (!supabase || !active || !text.trim()) return
    if (!messageRateLimit(userId)) return
    const mod = moderateText(text)
    if (!mod.allowed) return
    const { error } = await supabase.from('messages').insert({ sender_id: userId, recipient_id: active.id, content: text.trim() })
    if (!error) setText('')
  }
  return (
    <div className="grid md:grid-cols-[240px_1fr] gap-3 min-h-[70vh]">
      <aside className="d-card p-2 flex flex-col">
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm bạn bè..." className="d-input pl-8 py-2 text-sm" />
        </div>
        <div className="overflow-auto max-h-[60vh] space-y-1">
          {filtered.map(u => (
            <button key={u.id} onClick={() => setActive(u)} className={`w-full text-left p-2.5 rounded-xl flex items-center gap-2 ${active?.id === u.id ? 'bg-slate-800' : 'hover:bg-slate-800/50'}`}>
              <Avatar src={u.avatar_url} name={u.full_name || u.username} size={36} />
              <span className="truncate text-sm font-medium">{u.full_name || u.username || 'User'}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="d-card flex flex-col min-h-[50vh]">
        {!active ? (
          <div className="m-auto text-slate-500 text-sm flex flex-col items-center gap-2 p-8"><MessageSquare size={32} className="opacity-40" />Chọn người để nhắn tin</div>
        ) : (
          <>
            <header className="p-3 border-b border-slate-800 font-bold flex items-center gap-2">
              <Avatar src={active.avatar_url} name={active.full_name || active.username} size={32} />
              {active.full_name || active.username}
            </header>
            <div className="flex-1 p-3 space-y-2 overflow-auto max-h-[55vh]">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.sender_id === userId ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.sender_id === userId ? 'bg-gradient-to-r from-cyan-500/90 to-violet-500/90 text-white' : 'bg-slate-800'}`}>
                    <div>{m.content}</div>
                    <div className={`text-[10px] mt-1 opacity-70 ${m.sender_id === userId ? 'text-right' : ''}`}>
                      {timeAgo(m.created_at)}{m.sender_id === userId ? (m.read_at ? ' · Đã xem' : ' · Đã gửi') : ''}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            <div className="p-3 border-t border-slate-800 flex gap-2">
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder="Nhắn tin..." className="d-input flex-1 py-2.5 text-sm" />
              <button onClick={send} className="d-btn-primary px-3"><Send size={16} /></button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Discover({ userId }) {
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [following, setFollowing] = useState({})
  const [busyId, setBusyId] = useState(null)
  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const { data } = await supabase.from('profiles').select('id,username,full_name,avatar_url,bio').neq('id', userId).limit(60)
      setPeople(data || [])
      const { data: fol } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
      const map = {}
      ;(fol || []).forEach(f => { map[f.following_id] = true })
      setFollowing(map)
    })()
  }, [userId])
  const toggleFollow = async (targetId) => {
    if (!supabase || busyId) return
    setBusyId(targetId)
    try {
      if (following[targetId]) {
        await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId)
        setFollowing(x => { const n = { ...x }; delete n[targetId]; return n })
      } else {
        const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: targetId })
        if (!error) setFollowing(x => ({ ...x, [targetId]: true }))
      }
    } finally { setBusyId(null) }
  }
  const blockUser = async (targetId) => {
    if (!supabase || !confirm('Chặn người này? Họ sẽ không nhắn tin / hiện trong gợi ý dễ dàng.')) return
    await supabase.from('blocks').upsert({ blocker_id: userId, blocked_id: targetId })
    setPeople(x => x.filter(p => p.id !== targetId))
  }
  const filtered = people.filter(p => !q.trim() || (p.full_name || '').toLowerCase().includes(q.toLowerCase()) || (p.username || '').toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="space-y-3">
      <div className="d-card p-4">
        <h2 className="font-black text-lg flex items-center gap-2"><Users size={18} className="text-cyan-300" /> Khám phá & Theo dõi</h2>
        <p className="text-xs text-slate-500 mt-1">Theo dõi một chiều — xem thêm nội dung từ người bạn quan tâm.</p>
        <div className="relative mt-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm tên hoặc @username..." className="d-input pl-9 py-2.5 text-sm" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map(p => (
          <div key={p.id} className="d-card p-4 flex gap-3 items-start">
            <Avatar src={p.avatar_url} name={p.full_name || p.username} size={48} ring />
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{p.full_name || p.username || 'User'}</div>
              {p.username && <div className="text-xs text-slate-500">@{p.username}</div>}
              {p.bio && <p className="text-sm text-slate-400 mt-1 line-clamp-2">{p.bio}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => toggleFollow(p.id)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition ${
                    following[p.id]
                      ? 'border-slate-600 text-slate-300 hover:border-rose-400/50 hover:text-rose-300'
                      : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                  }`}
                >
                  {busyId === p.id ? '...' : following[p.id] ? 'Đang theo dõi' : 'Theo dõi'}
                </button>
                <button type="button" onClick={() => blockUser(p.id)} className="text-xs px-2 py-1.5 rounded-xl text-slate-500 hover:text-amber-400 border border-transparent hover:border-slate-700">
                  Chặn
                </button>
              </div>
            </div>
          </div>
        ))}
        {!filtered.length && <div className="text-slate-500 text-sm p-6">Không tìm thấy thành viên.</div>}
      </div>
    </div>
  )
}

function Notifications({ userId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      setLoading(true)
      const { data: myPosts } = await supabase.from('posts').select('id').eq('author_id', userId).limit(40)
      const ids = (myPosts || []).map(p => p.id)
      let notifs = []
      if (ids.length) {
        const { data: comments } = await supabase.from('comments').select('id,content,created_at,author_id,post_id,profiles(full_name,username,avatar_url)').in('post_id', ids).neq('author_id', userId).order('created_at', { ascending: false }).limit(25)
        notifs = (comments || []).map(c => ({
          id: 'c-' + c.id, type: 'comment',
          text: `${c.profiles?.full_name || c.profiles?.username || 'Ai đó'} đã bình luận: ${c.content}`,
          at: c.created_at, avatar: c.profiles?.avatar_url, name: c.profiles?.full_name || c.profiles?.username,
        }))
        const { data: likes } = await supabase.from('likes').select('post_id,user_id,created_at,profiles:user_id(full_name,username,avatar_url)').in('post_id', ids).neq('user_id', userId).order('created_at', { ascending: false }).limit(25)
        for (const l of likes || []) {
          notifs.push({
            id: 'l-' + l.post_id + '-' + l.user_id, type: 'like',
            text: `${l.profiles?.full_name || l.profiles?.username || 'Ai đó'} đã thích bài viết của bạn`,
            at: l.created_at, avatar: l.profiles?.avatar_url, name: l.profiles?.full_name || l.profiles?.username,
          })
        }
      }
      const { data: follows } = await supabase.from('follows').select('follower_id,created_at,profiles:follower_id(full_name,username,avatar_url)').eq('following_id', userId).order('created_at', { ascending: false }).limit(20)
      for (const f of follows || []) {
        notifs.push({
          id: 'f-' + f.follower_id, type: 'follow',
          text: `${f.profiles?.full_name || f.profiles?.username || 'Ai đó'} đã theo dõi bạn`,
          at: f.created_at, avatar: f.profiles?.avatar_url, name: f.profiles?.full_name || f.profiles?.username,
        })
      }
      const { data: msgs } = await supabase.from('messages').select('id,content,created_at,sender_id,profiles:sender_id(full_name,username,avatar_url)').eq('recipient_id', userId).order('created_at', { ascending: false }).limit(15)
      for (const m of msgs || []) {
        notifs.push({
          id: 'm-' + m.id, type: 'message',
          text: `Tin nhắn mới từ ${m.profiles?.full_name || m.profiles?.username || 'ai đó'}: ${m.content}`,
          at: m.created_at, avatar: m.profiles?.avatar_url, name: m.profiles?.full_name || m.profiles?.username,
        })
      }
      notifs.sort((a, b) => new Date(b.at) - new Date(a.at))
      setItems(notifs.slice(0, 50))
      setLoading(false)
    })()
  }, [userId])
  return (
    <div className="space-y-3">
      <div className="d-card p-4">
        <h2 className="font-black text-lg flex items-center gap-2"><Bell size={18} className="text-violet-300" /> Thông báo</h2>
        <p className="text-xs text-slate-500 mt-1">Like, bình luận, theo dõi và tin nhắn mới.</p>
      </div>
      {loading && <div className="text-center text-slate-500 py-8 text-sm">Đang tải...</div>}
      {!loading && !items.length && <div className="d-card p-10 text-center text-slate-500 text-sm">Chưa có thông báo.</div>}
      <div className="space-y-2">
        {items.map(n => (
          <div key={n.id} className="d-card p-3 flex gap-3 items-start">
            <Avatar src={n.avatar} name={n.name || 'D'} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed">{n.text}</p>
              <div className="text-[11px] text-slate-500 mt-1">{timeAgo(n.at)} · {n.type === 'like' ? 'Thích' : n.type === 'follow' ? 'Theo dõi' : n.type === 'comment' ? 'Bình luận' : 'Tin nhắn'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminPage({ userId }) {
  const [ok, setOk] = useState(false)
  const [posts, setPosts] = useState([])
  const [reports, setReports] = useState([])
  const [aiText, setAiText] = useState('')
  const [aiResult, setAiResult] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const { data: me } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
      if (!me?.is_admin) return
      setOk(true)
      const { data } = await supabase.from('posts').select('id,author_id,content,is_published,created_at,profiles!user_id(full_name,username)').order('created_at', { ascending: false }).limit(100)
      if (data) setPosts(data)
      const { data: reps } = await supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(50)
      if (reps) setReports(reps)
    })()
  }, [userId])
  const hide = async id => {
    if (!supabase) return
    await supabase.from('posts').update({ is_published: false }).eq('id', id)
    setPosts(x => x.map(p => (p.id === id ? { ...p, is_published: false } : p)))
  }
  const runAi = async () => {
    setBusy(true); setAiResult(null)
    try {
      const r = await fetch('/api/ai/moderate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: aiText }) })
      setAiResult(await r.json())
    } catch (e) { setAiResult({ error: e.message }) } finally { setBusy(false) }
  }
  if (!ok) return <div className="p-10 text-center text-slate-400">Không có quyền admin. <a href="/" className="text-cyan-300">Về trang chủ</a></div>
  return (
    <main className="max-w-3xl mx-auto p-4 pb-20 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black flex items-center gap-2"><Sparkles className="text-violet-300" /> Admin · AI</h1>
        <a href="/" className="text-sm text-slate-400">← App</a>
      </div>
      <section className="d-card p-4 space-y-2">
        <textarea value={aiText} onChange={e => setAiText(e.target.value)} className="d-input min-h-24 text-sm" placeholder="Dán nội dung..." />
        <button disabled={busy || !aiText.trim()} onClick={runAi} className="d-btn-primary text-sm">{busy ? 'Đang phân tích...' : 'Chạy AI'}</button>
        {aiResult && <pre className="text-xs bg-slate-950/80 p-3 rounded-xl overflow-auto text-cyan-100">{JSON.stringify(aiResult, null, 2)}</pre>}
      </section>
      <section className="d-card p-4">
        <h2 className="font-bold mb-2">Báo cáo ({reports.length})</h2>
        <div className="space-y-2 max-h-48 overflow-auto">
          {reports.map(r => <div key={r.id} className="text-xs border-b border-slate-800 pb-2"><span className="text-amber-300">{r.target_type}</span> · {r.reason}</div>)}
        </div>
      </section>
      <div className="space-y-2">
        {posts.map(p => (
          <div key={p.id} className="d-card p-4">
            <div className="text-xs text-slate-500">{p.profiles?.full_name || p.author_id}</div>
            <p className="mt-1 text-sm">{p.content}</p>
            {p.is_published !== false && <button onClick={() => hide(p.id)} className="mt-2 text-sm text-amber-300">Ẩn bài</button>}
          </div>
        ))}
      </div>
    </main>
  )
}

function Shell({ tab, setTab, onLogout, children }) {
  const nav = [
    { id: 'feed', label: 'Trang chủ', icon: Home },
    { id: 'discover', label: 'Bạn bè', icon: Users },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'notifs', label: 'Thông báo', icon: Bell },
    { id: 'profile', label: 'Tôi', icon: User },
  ]
  return (
    <div className="min-h-screen pb-24 md:pb-6">
      <header className="sticky top-0 z-30 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-3 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-300 to-violet-400 text-slate-950 font-black grid place-items-center">D</div>
            <div>
              <div className="font-black leading-none tracking-tight">D Social</div>
              <div className="text-[10px] text-slate-500">Cộng đồng văn minh</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {nav.map(n => (
              <button key={n.id} onClick={() => setTab(n.id)} className={`d-nav-item ${tab === n.id ? 'active' : ''}`}>
                <n.icon size={18} /><span className="text-sm">{n.label}</span>
              </button>
            ))}
          </div>
          <button onClick={onLogout} className="d-btn-ghost text-xs" title="Đăng xuất"><LogOut size={16} /></button>
        </div>
      </header>
      <InstallBanner />
      <div className="max-w-6xl mx-auto px-3 py-4 grid md:grid-cols-[200px_minmax(0,1fr)_220px] gap-4">
        <aside className="hidden md:block space-y-1 sticky top-20 self-start">
          {nav.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} className={`d-nav-item w-full justify-start ${tab === n.id ? 'active' : ''}`}>
              <n.icon size={18} /><span>{n.label}</span>
            </button>
          ))}
        </aside>
        <main className="min-w-0">{children}</main>
        <aside className="hidden md:block space-y-3 sticky top-20 self-start">
          <div className="d-card p-4 text-xs text-slate-400">Đăng nội dung tích cực · Chat · Thông báo</div>
        </aside>
      </div>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl">
        <div className="max-w-lg mx-auto flex justify-around py-2">
          {nav.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} className={`flex flex-col items-center gap-0.5 text-[10px] ${tab === n.id ? 'text-cyan-300' : 'text-slate-500'}`}>
              <n.icon size={20} />{n.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('feed')
  const [legal, setLegal] = useState(null)
  const [route, setRoute] = useState(getRoute())
  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    const onNav = () => setRoute(getRoute())
    window.addEventListener('popstate', onNav)
    return () => { subscription.unsubscribe(); window.removeEventListener('popstate', onNav) }
  }, [])
  if (!ready) return <div className="min-h-screen grid place-items-center text-slate-400"><div className="text-center"><div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-cyan-300 to-violet-400 animate-pulse" /><p className="mt-3 text-sm">Đang tải D Social...</p></div></div>
  if (legal) return <div className="min-h-screen"><Legal kind={legal} onBack={() => setLegal(null)} /></div>
  if (route.name === 'public-post' && route.postId) return <PublicPostPage postId={route.postId} session={session} />
  if (route.name === 'admin') { if (!session) return <AuthScreen onLegal={setLegal} />; return <AdminPage userId={session.user.id} /> }
  if (!session && supabase) return <AuthScreen onLegal={setLegal} />
  if (!session) return <div className="p-8 text-center">D Social</div>
  const logout = async () => { await supabase?.auth.signOut() }
  return (
    <Shell tab={tab} setTab={setTab} onLogout={logout}>
      {tab === 'feed' && <Feed userId={session.user.id} />}
      {tab === 'discover' && <Discover userId={session.user.id} />}
      {tab === 'chat' && <Chat userId={session.user.id} />}
      {tab === 'notifs' && <Notifications userId={session.user.id} />}
      {tab === 'profile' && <ProfilePage userId={session.user.id} />}
    </Shell>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
