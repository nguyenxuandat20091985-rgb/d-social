// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Heart, MessageCircle, Send, User, LogOut, Image as ImageIcon, Video,
  MessageSquare, Home, Wallet, X, Flag, Search, Shield, Download,
  Sparkles, Users
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { moderateText } from './lib/moderation'
import { postRateLimit, commentRateLimit, messageRateLimit } from './lib/ratelimit'
import { FEED_PAGE_SIZE, buildFeedQuery } from './lib/performance'
import { ShareMenu } from './components/ShareMenu'
import { VipPanel } from './components/VipPanel'
import { AuthScreen } from './components/AuthScreen'
import './index.css'

type Profile = { id: string; username: string | null; full_name: string | null; avatar_url: string | null; bio?: string | null; is_vip?: boolean; is_admin?: boolean }
type Post = { id: string; author_id: string; content: string | null; media_url: string | null; media_type: string | null; is_published?: boolean; created_at: string; profiles?: Profile; likes?: { user_id: string }[] }

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

function Avatar({ src, name, size = 40 }) {
  const letter = (name || 'D').trim().charAt(0).toUpperCase()
  return src ? (
    <img src={src} alt="" width={size} height={size} className="rounded-full object-cover bg-slate-700 shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-slate-950 font-black grid place-items-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.42 }}>{letter}</div>
  )
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút`
  if (s < 86400) return `${Math.floor(s / 3600)} giờ`
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
        <div className="font-bold">Cài D Social như app</div>
        <div className="text-slate-400 text-xs">Truy cập nhanh, offline nhẹ</div>
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
            <p className="text-slate-300 text-sm leading-relaxed">D Social là mạng xã hội độc lập. Người dùng phải tuân thủ pháp luật Việt Nam, không đăng nội dung bạo lực, khiêu dâm, lừa đảo, thù hận, xâm phạm bản quyền hoặc dữ liệu cá nhân người khác.</p>
            <p className="text-slate-300 text-sm leading-relaxed">Core miễn phí. VIP là dịch vụ tùy chọn. Vi phạm có thể bị ẩn bài, khóa tài khoản. Báo cáo nội dung xấu qua nút Báo cáo trên bài viết.</p>
            <p className="text-slate-300 text-sm leading-relaxed">D Social không liên kết với Meta/Facebook. Giao diện và thương hiệu là thiết kế gốc của dự án.</p>
          </>
        ) : (
          <>
            <p className="text-slate-300 text-sm leading-relaxed">Chúng tôi thu thập email, hồ sơ, nội dung bạn đăng và nhật ký kỹ thuật cần thiết để vận hành. Dữ liệu bảo vệ bằng Auth, RLS và secret server.</p>
            <p className="text-slate-300 text-sm leading-relaxed">Không bán dữ liệu cá nhân. Có thể yêu cầu xóa tài khoản qua Admin/hỗ trợ.</p>
          </>
        )}
      </article>
    </main>
  )
}

function Composer({ userId, onPublished }) {
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
      const { error } = await supabase.from('posts').insert({ author_id: userId, content: text.trim() || null, media_url, media_type, is_published: true })
      if (error) throw error
      setText(''); setFile(null); onPublished()
    } catch (e) { setError(e.message || 'Không thể đăng') } finally { setBusy(false) }
  }
  return (
    <section className="d-card p-4">
      <textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Chia sẻ điều gì đó tích cực..." className="w-full bg-transparent resize-none outline-none min-h-[88px] text-[15px] placeholder:text-slate-500" />
      {file && <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/80 text-sm mb-2"><span className="truncate">{file.name}</span><button onClick={() => setFile(null)} className="text-slate-400 p-1"><X size={16} /></button></div>}
      {error && <p className="text-rose-400 text-sm mb-2">{error}</p>}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <label className="flex gap-3 text-slate-400 cursor-pointer"><ImageIcon size={20} className="hover:text-cyan-300" /><Video size={20} className="hover:text-violet-300" /><input hidden type="file" accept="image/*,video/*" onChange={e => pick(e.target.files?.[0])} /></label>
        <button disabled={busy} onClick={publish} className="d-btn-primary text-sm">{busy ? 'Đang đăng...' : 'Đăng bài'}</button>
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
          <div className="flex items-center gap-2"><div className="font-bold truncate">{name}</div>{post.profiles?.is_vip && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-bold">VIP</span>}</div>
          <div className="text-xs text-slate-500">{timeAgo(post.created_at)}</div>
        </div>
      </div>
      {post.content && <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{post.content}</p>}
      {post.media_url && (post.media_type === 'video' ? <video src={post.media_url} controls className="mt-3 rounded-xl w-full max-h-[520px] bg-black" /> : <img src={post.media_url} loading="lazy" alt="" className="mt-3 rounded-xl w-full max-h-[520px] object-cover" />)}
      <div className="flex gap-5 mt-4 text-slate-400 items-center flex-wrap text-sm">
        {userId ? <button onClick={toggleLike} className={`flex gap-1.5 items-center ${liked ? 'text-pink-400' : 'hover:text-pink-300'}`}><Heart size={18} fill={liked ? 'currentColor' : 'none'} />{count}</button> : <span className="flex gap-1.5 items-center"><Heart size={18} />{count}</span>}
        {userId && <button onClick={() => setShow(x => !x)} className="flex gap-1.5 items-center hover:text-cyan-300"><MessageCircle size={18} />{show ? 'Ẩn' : 'Bình luận'}</button>}
        <ShareMenu postId={post.id} text={post.content} author={post.profiles?.full_name || post.profiles?.username} />
        {userId && userId !== post.author_id && <button onClick={async () => { const reason = prompt('Lý do báo cáo (spam, lừa đảo, bản quyền...)'); if (!reason || !supabase) return; const { error } = await supabase.from('reports').insert({ reporter_id: userId, target_type: 'post', target_id: post.id, reason: reason.slice(0, 500) }); alert(error ? error.message : 'Đã gửi báo cáo. AI + Admin sẽ xử lý.') }} className="flex gap-1 items-center text-slate-500 hover:text-amber-400"><Flag size={16} />Báo cáo</button>}
      </div>
      {show && userId && (
        <div className="mt-4 border-t border-slate-800 pt-3 space-y-3">
          {comments.map(c => (
            <div key={c.id} className="text-sm flex gap-2">
              <Avatar src={c.profiles?.avatar_url} name={c.profiles?.full_name || c.profiles?.username} size={28} />
              <div className="bg-slate-800/70 rounded-2xl px-3 py-2 flex-1"><b className="text-xs">{c.profiles?.full_name || c.profiles?.username || 'User'}</b><div className="text-slate-200">{c.content}</div></div>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={comment} onChange={e => setComment(e.target.value)} maxLength={1000} placeholder="Viết bình luận văn minh..." className="d-input flex-1 py-2.5 text-sm" onKeyDown={e => e.key === 'Enter' && addComment()} />
            <button onClick={addComment} className="d-btn-primary px-3"><Send size={16} /></button>
          </div>
        </div>
      )}
      {!userId && <p className="mt-4 text-sm text-slate-400">Đăng nhập để tương tác. <a href="/" className="text-cyan-300 font-semibold">Đăng nhập</a></p>}
    </article>
  )
}

function Feed({ userId }) {
  const [posts, setPosts] = useState([])
  const [cursor, setCursor] = useState(null)
  const [more, setMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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
      <Composer userId={userId} onPublished={() => load(true)} />
      <div className="space-y-3 mt-3">
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
      const { data, error } = await supabase.from('posts').select('id,author_id,content,media_url,media_type,created_at,profiles(id,username,full_name,avatar_url,is_vip),likes(user_id)').eq('id', postId).maybeSingle()
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
    supabase.from('profiles').select('id,username,full_name,avatar_url,is_vip').neq('id', userId).limit(80).then(({ data }) => setUsers(data || []))
  }, [userId])
  useEffect(() => {
    if (!supabase || !active) return
    const load = async () => {
      const { data } = await supabase!.from('messages').select('*').or(`and(sender_id.eq.${userId},recipient_id.eq.${active.id}),and(sender_id.eq.${active.id},recipient_id.eq.${userId})`).order('created_at', { ascending: true }).limit(200)
      if (data) setMessages(data)
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
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm bạn..." className="d-input pl-8 py-2 text-sm" />
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
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.sender_id === userId ? 'bg-gradient-to-r from-cyan-500/90 to-violet-500/90 text-white' : 'bg-slate-800'}`}>{m.content}</div>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            <div className="p-3 border-t border-slate-800 flex gap-2">
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder="Nhắn tin văn minh..." className="d-input flex-1 py-2.5 text-sm" />
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
  useEffect(() => {
    if (!supabase) return
    supabase.from('profiles').select('id,username,full_name,avatar_url,bio,is_vip').neq('id', userId).limit(40).then(({ data }) => setPeople(data || []))
  }, [userId])
  const filtered = people.filter(p => !q.trim() || (p.full_name || '').toLowerCase().includes(q.toLowerCase()) || (p.username || '').toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="space-y-3">
      <div className="d-card p-4">
        <h2 className="font-black text-lg flex items-center gap-2"><Users size={18} className="text-cyan-300" /> Khám phá cộng đồng</h2>
        <div className="relative mt-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo tên hoặc username..." className="d-input pl-9 py-2.5 text-sm" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map(p => (
          <div key={p.id} className="d-card p-4 flex gap-3 items-start">
            <Avatar src={p.avatar_url} name={p.full_name || p.username} size={48} />
            <div className="min-w-0">
              <div className="font-bold truncate flex items-center gap-1">{p.full_name || p.username || 'User'}{p.is_vip && <span className="text-[10px] text-amber-300">VIP</span>}</div>
              {p.username && <div className="text-xs text-slate-500">@{p.username}</div>}
              {p.bio && <p className="text-sm text-slate-400 mt-1 line-clamp-2">{p.bio}</p>}
            </div>
          </div>
        ))}
        {!filtered.length && <div className="text-slate-500 text-sm p-6">Không tìm thấy thành viên.</div>}
      </div>
    </div>
  )
}

function ProfilePage({ userId }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [saved, setSaved] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    if (!supabase) return
    supabase.from('profiles').select('*').eq('id', userId).single().then(({ data }) => {
      if (data) { setName(data.full_name || ''); setUsername(data.username || ''); setBio(data.bio || ''); setIsAdmin(!!data.is_admin) }
    })
  }, [userId])
  const save = async () => {
    if (!supabase) return
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() || null, username: username.trim() || null, bio: bio.trim() || null }).eq('id', userId)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }
  return (
    <section className="d-card p-5 space-y-3">
      <h2 className="text-xl font-black">Hồ sơ của bạn</h2>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Tên hiển thị" className="d-input" />
      <input value={username} onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="Username" className="d-input" />
      <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Giới thiệu ngắn..." className="d-input min-h-24" />
      <button onClick={save} className="d-btn-primary">Lưu hồ sơ</button>
      {saved && <span className="text-emerald-400 text-sm ml-2">Đã lưu</span>}
      {isAdmin && <p className="pt-2 text-sm"><a href="/admin" className="text-amber-300 underline flex items-center gap-1"><Shield size={14} /> Mở bảng Admin + AI</a></p>}
    </section>
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
      const { data } = await supabase.from('posts').select('id,author_id,content,is_published,created_at,profiles(full_name,username)').order('created_at', { ascending: false }).limit(100)
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
        <h2 className="font-bold text-sm text-slate-300">AI kiểm duyệt (rules + optional Groq)</h2>
        <p className="text-xs text-slate-500">Endpoint /api/ai/moderate — không đụng my-ai-bot. Gắn GROQ_API_KEY trên Vercel nếu muốn LLM.</p>
        <textarea value={aiText} onChange={e => setAiText(e.target.value)} className="d-input min-h-24 text-sm" placeholder="Dán nội dung cần AI đánh giá..." />
        <button disabled={busy || !aiText.trim()} onClick={runAi} className="d-btn-primary text-sm">{busy ? 'Đang phân tích...' : 'Chạy AI moderate'}</button>
        {aiResult && <pre className="text-xs bg-slate-950/80 p-3 rounded-xl overflow-auto text-cyan-100">{JSON.stringify(aiResult, null, 2)}</pre>}
      </section>
      <section className="d-card p-4">
        <h2 className="font-bold mb-2">Báo cáo gần đây ({reports.length})</h2>
        <div className="space-y-2 max-h-48 overflow-auto">
          {reports.map(r => <div key={r.id} className="text-xs border-b border-slate-800 pb-2"><span className="text-amber-300">{r.target_type}</span> · {r.reason}</div>)}
          {!reports.length && <p className="text-slate-500 text-sm">Chưa có báo cáo.</p>}
        </div>
      </section>
      <div className="space-y-2">
        {posts.map(p => (
          <div key={p.id} className="d-card p-4">
            <div className="text-xs text-slate-500">{p.profiles?.full_name || p.author_id} · {timeAgo(p.created_at)}</div>
            <p className="mt-1 text-sm">{p.content}</p>
            {p.is_published !== false && <button onClick={() => hide(p.id)} className="mt-2 text-sm text-amber-300">Ẩn bài</button>}
            {p.is_published === false && <span className="text-xs text-slate-500">Đã ẩn</span>}
          </div>
        ))}
      </div>
    </main>
  )
}

function Shell({ tab, setTab, onLogout, children }) {
  const nav = [
    { id: 'feed', label: 'Bảng tin', icon: Home },
    { id: 'discover', label: 'Khám phá', icon: Users },
    { id: 'chat', label: 'Tin nhắn', icon: MessageSquare },
    { id: 'wallet', label: 'Ví', icon: Wallet },
    { id: 'profile', label: 'Tôi', icon: User },
  ]
  return (
    <div className="min-h-screen pb-24 md:pb-6">
      <header className="sticky top-0 z-30 border-b border-slate-800/70 bg-slate-950/75 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-3 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-300 to-violet-400 text-slate-950 font-black grid place-items-center">D</div>
            <div><div className="font-black leading-none">D Social</div><div className="text-[10px] text-slate-500">Trẻ · Văn minh · An toàn</div></div>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {nav.map(n => <button key={n.id} onClick={() => setTab(n.id)} className={`d-nav-item ${tab === n.id ? 'active' : ''}`}><n.icon size={18} /><span className="text-sm">{n.label}</span></button>)}
          </div>
          <button onClick={onLogout} className="d-btn-ghost text-xs" title="Đăng xuất"><LogOut size={16} /></button>
        </div>
      </header>
      <InstallBanner />
      <div className="max-w-6xl mx-auto px-3 py-4 grid md:grid-cols-[200px_minmax(0,1fr)_240px] gap-4">
        <aside className="hidden md:block space-y-2 sticky top-20 self-start">
          {nav.map(n => <button key={n.id} onClick={() => setTab(n.id)} className={`d-nav-item w-full justify-start ${tab === n.id ? 'active' : ''}`}><n.icon size={18} /><span>{n.label}</span></button>)}
          <div className="d-card p-3 text-xs text-slate-400 mt-4">Cộng đồng tôn trọng pháp luật & bản quyền. Báo cáo nội dung xấu trên bài viết.</div>
        </aside>
        <main className="min-w-0">{children}</main>
        <aside className="hidden md:block space-y-3 sticky top-20 self-start">
          <div className="d-card p-4"><div className="font-bold text-sm flex items-center gap-1"><Sparkles size={14} className="text-violet-300" /> Gợi ý</div><p className="text-xs text-slate-400 mt-2 leading-relaxed">Chia sẻ nội dung tích cực. VIP tùy chọn — core miễn phí.</p></div>
          <div className="d-card p-4 text-xs text-slate-500">PWA: trình duyệt → Cài app để dùng như ứng dụng.</div>
        </aside>
      </div>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl">
        <div className="max-w-lg mx-auto flex justify-around py-2">
          {nav.map(n => <button key={n.id} onClick={() => setTab(n.id)} className={`flex flex-col items-center gap-0.5 text-[10px] ${tab === n.id ? 'text-cyan-300' : 'text-slate-500'}`}><n.icon size={20} />{n.label}</button>)}
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
      {tab === 'profile' && <ProfilePage userId={session.user.id} />}
      {tab === 'wallet' && (<div className="space-y-3"><section className="d-card p-6"><h2 className="text-xl font-black">Ví & D VIP</h2><p className="text-slate-400 mt-2 text-sm">Core luôn miễn phí. VIP là tùy chọn hỗ trợ vận hành.</p></section><VipPanel /></div>)}
    </Shell>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
