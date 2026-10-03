// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Users, Compass, Image as ImageIcon, Clock3, Flame, UserPlus, RefreshCw, X, MessageCircle, Heart, PlayCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

function Avatar({ src, name, size = 44 }) {
  const letter = (name || 'D').trim().charAt(0).toUpperCase()
  return src
    ? <img src={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    : <div className="rounded-full grid place-items-center shrink-0 font-black text-white" style={{ width: size, height: size, background: 'var(--d-primary)', fontSize: size * .4 }}>{letter}</div>
}
const filters = [
  { id: 'for-you', label: 'Dành cho bạn', icon: Compass },
  { id: 'latest', label: 'Mới nhất', icon: Clock3 },
  { id: 'media', label: 'Ảnh & Video', icon: ImageIcon },
  { id: 'people', label: 'Thành viên', icon: Users },
]
const topics = [
  { id: 'all', label: 'Tất cả', terms: [] },
  { id: 'travel', label: 'Du lịch', terms: ['du lịch', 'đi chơi', 'chuyến đi', 'travel'] },
  { id: 'life', label: 'Đời sống', terms: ['đời sống', 'hôm nay', 'cuộc sống', 'gia đình'] },
  { id: 'creative', label: 'Sáng tạo', terms: ['sáng tạo', 'ý tưởng', 'thiết kế', 'art'] },
  { id: 'photo', label: 'Nhiếp ảnh', terms: ['ảnh', 'photography', 'camera'] },
]
function PostPreview({ post }) {
  const profile = post.profiles || {}
  const name = profile.full_name || profile.username || 'Thành viên D'
  return <article className="d-card overflow-hidden discover-post">
    <div className="flex items-center gap-3 p-3">
      <Avatar src={profile.avatar_url} name={name} size={40}/>
      <div className="min-w-0 flex-1"><div className="font-bold truncate text-sm">{name}</div><div className="text-xs d-muted">{profile.username ? '@' + profile.username + ' · ' : ''}{new Date(post.created_at).toLocaleDateString('vi-VN')}</div></div>
    </div>
    {post.content && <p className="px-3 pb-3 text-sm whitespace-pre-wrap break-words line-clamp-4">{post.content}</p>}
    {post.media_url && (post.media_type === 'video'
      ? <div className="relative"><video src={post.media_url} controls playsInline preload="metadata" className="discover-media-video"/><span className="discover-media-label"><PlayCircle size={14}/> Video</span></div>
      : <img src={post.media_url} alt="" loading="lazy" className="discover-media-image"/>)}
    <div className="flex items-center justify-between px-3 py-3 border-t d-border-c text-xs d-muted"><span className="inline-flex items-center gap-1"><Heart size={14}/> {post.likes?.length || 0} lượt thích</span><span className="inline-flex items-center gap-1"><MessageCircle size={14}/> Bài viết cộng đồng</span></div>
  </article>
}

export function Discover({ userId }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('for-you')
  const [topic, setTopic] = useState('all')
  const [people, setPeople] = useState([])
  const [posts, setPosts] = useState([])
  const [following, setFollowing] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!supabase) { setError('Dịch vụ dữ liệu chưa được cấu hình.'); setLoading(false); return }
    setLoading(true); setError('')
    try {
      const [peopleRes, followRes, postRes] = await Promise.all([
        supabase.from('profiles').select('id,username,full_name,avatar_url,bio,created_at').neq('id', userId).order('created_at', { ascending: false }).limit(80),
        supabase.from('follows').select('following_id').eq('follower_id', userId),
        supabase.from('posts').select('id,author_id,user_id,content,media_url,media_type,is_published,created_at,likes(user_id)').eq('is_published', true).is('deleted_at', null).order('created_at', { ascending: false }).limit(60)
      ])
      if (peopleRes.error) throw peopleRes.error
      if (postRes.error) throw postRes.error
      setPeople(peopleRes.data || [])

      // Keep Discover independent from PostgREST's embedded relationship cache.
      // The database has the FK, but a stale schema cache can reject profiles!author_id.
      // Load profiles separately and hydrate posts locally so this fix is scoped to Discover.
      const rawPosts = postRes.data || []
      const authorIds = [...new Set(rawPosts.map(p => p.author_id || p.user_id).filter(Boolean))]
      let profileMap = {}
      if (authorIds.length) {
        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('id,full_name,username,avatar_url')
          .in('id', authorIds)
        if (profileError) throw profileError
        profileMap = Object.fromEntries((profileRows || []).map(profile => [profile.id, profile]))
      }
      setPosts(rawPosts.map(post => ({ ...post, profiles: profileMap[post.author_id || post.user_id] || null })))
      const map = {}; (followRes.data || []).forEach(f => { map[f.following_id] = true }); setFollowing(map)
    } catch (e) { setError(e?.message || 'Không thể tải nội dung khám phá.'); }
    finally { setLoading(false) }
  }, [userId])
  useEffect(() => { load() }, [load])

  const toggleFollow = async (targetId) => {
    if (!supabase || busyId) return
    setBusyId(targetId)
    try {
      if (following[targetId]) {
        const { error } = await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId)
        if (error) throw error
        setFollowing(x => { const n = { ...x }; delete n[targetId]; return n })
      } else {
        const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: targetId })
        if (error) throw error
        setFollowing(x => ({ ...x, [targetId]: true }))
      }
    } catch (e) { alert(e?.message || 'Chưa thể cập nhật theo dõi.') }
    finally { setBusyId(null) }
  }
  const blockUser = async (targetId) => {
    if (!supabase || !confirm('Chặn người này?')) return
    const { error } = await supabase.from('blocks').upsert({ blocker_id: userId, blocked_id: targetId })
    if (error) alert(error.message)
    else setPeople(x => x.filter(p => p.id !== targetId))
  }

  const normalized = q.trim().toLocaleLowerCase('vi')
  const filteredPeople = useMemo(() => people.filter(p => !normalized || [p.full_name, p.username, p.bio].some(v => (v || '').toLocaleLowerCase('vi').includes(normalized))), [people, normalized])
  const filteredPosts = useMemo(() => {
    let result = posts
    if (tab === 'media') result = result.filter(p => p.media_url)
    if (normalized) result = result.filter(p => [p.content, p.profiles?.full_name, p.profiles?.username].some(v => (v || '').toLocaleLowerCase('vi').includes(normalized)))
    const selected = topics.find(t => t.id === topic)
    if (selected?.terms.length) result = result.filter(p => selected.terms.some(term => (p.content || '').toLocaleLowerCase('vi').includes(term)))
    if (tab === 'for-you') result = [...result].sort((a,b) => (b.likes?.length || 0) - (a.likes?.length || 0))
    return result
  }, [posts, tab, normalized, topic])
  const showPeople = tab === 'people' || (!normalized && tab === 'for-you')

  return <div className="discover-shell max-w-4xl mx-auto px-3 pb-28 pt-3 space-y-4">
    <header className="discover-hero d-card">
      <div className="flex items-center gap-2"><span className="discover-mark"><Compass size={20}/></span><div><div className="text-xs font-bold d-muted tracking-wide">D-SOCIAL</div><h1 className="text-2xl font-black">Khám phá</h1></div><button type="button" onClick={load} disabled={loading} className="discover-refresh ml-auto" aria-label="Làm mới"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button></div>
      <p className="text-sm d-muted mt-2">Tìm nội dung mới và kết nối với cộng đồng.</p>
      <div className="relative mt-4"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 d-muted"/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm bài viết, thành viên, chủ đề..." className="d-input pl-10 pr-10 py-3 text-sm w-full"/>{q && <button type="button" onClick={() => setQ('')} aria-label="Xóa tìm kiếm" className="absolute right-3 top-1/2 -translate-y-1/2 d-muted"><X size={16}/></button>}</div>
    </header>

    <nav className="discover-tabs" aria-label="Bộ lọc khám phá">{filters.map(f => { const Icon=f.icon; return <button key={f.id} type="button" onClick={() => setTab(f.id)} className={tab===f.id ? 'discover-tab active' : 'discover-tab'}><Icon size={15}/>{f.label}</button> })}</nav>

    {tab !== 'people' && <section className="discover-topics"><div className="flex items-center gap-2 mb-2"><Flame size={16} style={{color:'var(--d-primary)'}}/><h2 className="font-extrabold text-sm">Khám phá theo chủ đề</h2></div><div className="flex gap-2 overflow-x-auto pb-1">{topics.map(t => <button key={t.id} type="button" onClick={() => setTopic(t.id)} className={topic===t.id ? 'discover-topic active' : 'discover-topic'}>{t.label}</button>)}</div><p className="text-[11px] d-muted mt-2">Chủ đề được lọc từ nội dung bài viết hiện có.</p></section>}

    {error && <div className="d-card p-5 text-center"><p className="text-sm mb-3" style={{color:'var(--d-danger)'}}>{error}</p><button type="button" onClick={load} className="d-btn-primary text-sm">Thử lại</button></div>}
    {loading && <div className="d-card p-5 space-y-3"><div className="discover-skeleton"/><div className="discover-skeleton"/><div className="discover-skeleton"/></div>}

    {!loading && !error && showPeople && <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-extrabold">Thành viên gợi ý</h2><span className="text-xs d-muted">{filteredPeople.length} người</span></div><div className="grid sm:grid-cols-2 gap-3">{filteredPeople.slice(0,40).map(p => <article key={p.id} className="d-card p-4 flex gap-3 items-start"><Avatar src={p.avatar_url} name={p.full_name || p.username} size={48}/><div className="min-w-0 flex-1"><div className="font-bold truncate">{p.full_name || p.username || 'Thành viên D'}</div>{p.username && <div className="text-xs d-muted">@{p.username}</div>}{p.bio && <p className="text-xs d-muted mt-1 line-clamp-2">{p.bio}</p>}<div className="flex gap-2 mt-3"><button type="button" disabled={busyId===p.id} onClick={() => toggleFollow(p.id)} className={following[p.id] ? 'discover-follow following' : 'discover-follow'}><UserPlus size={14}/>{busyId===p.id ? 'Đang lưu…' : following[p.id] ? 'Đang theo dõi' : 'Theo dõi'}</button><button type="button" onClick={() => blockUser(p.id)} className="discover-block">Chặn</button></div></div></article>)}</div></section>}

    {!loading && !error && tab !== 'people' && <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="font-extrabold">{tab==='latest' ? 'Bài viết mới nhất' : tab==='media' ? 'Ảnh & Video' : 'Nội dung nổi bật'}</h2><p className="text-xs d-muted mt-1">{filteredPosts.length} bài viết phù hợp</p></div></div><div className="grid sm:grid-cols-2 gap-3">{filteredPosts.slice(0,40).map(p => <PostPreview key={p.id} post={p}/>)}</div>{!filteredPosts.length && <div className="d-card p-8 text-center"><div className="discover-empty-icon"><Search size={22}/></div><h3 className="font-bold mt-2">Chưa tìm thấy nội dung</h3><p className="text-sm d-muted mt-1">Thử từ khóa hoặc chủ đề khác nhé.</p></div>}</section>}
    {!loading && !error && tab==='people' && !filteredPeople.length && <div className="d-card p-8 text-center text-sm d-muted">Không tìm thấy thành viên phù hợp.</div>}
  </div>
}
