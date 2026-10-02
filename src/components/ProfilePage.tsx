// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { Shield, Users, UserRound, Heart, Image as ImageIcon, Bookmark, Settings, Lock, Bell, HelpCircle, LogOut, ChevronRight, Camera, FileText, Check, MessageCircle, UserPlus, UserMinus } from 'lucide-react'
import { supabase } from '../lib/supabase'

const MAX_IMAGE = 8 * 1024 * 1024

function Avatar({ src, name, size = 40, ring = false }) {
  const letter = (name || 'D').trim().charAt(0).toUpperCase()
  const img = src ? <img src={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size, background: 'var(--d-surface-2)' }} /> : <div className="rounded-full font-black grid place-items-center shrink-0 text-white" style={{ width: size, height: size, fontSize: size * 0.42, background: 'var(--d-primary)' }}>{letter}</div>
  if (!ring) return img
  return <div className="rounded-full p-[2px]" style={{ width: size + 6, height: size + 6, background: 'var(--d-primary)' }}><div className="rounded-full p-[2px] h-full w-full grid place-items-center" style={{ background: 'var(--d-surface)' }}>{img}</div></div>
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút`
  if (s < 86400) return `${Math.floor(s / 3600)} giờ`
  return new Date(iso).toLocaleDateString('vi-VN')
}

function MiniPost({ post, name, avatar }) {
  return <article className="d-card p-4">
    <div className="flex gap-3 items-start"><Avatar src={avatar} name={name} size={40} /><div className="min-w-0 flex-1"><div className="font-bold">{name}</div><div className="text-xs d-muted">{timeAgo(post.created_at)}</div></div></div>
    {post.content && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{post.content}</p>}
    {post.media_url && (post.media_type === 'video' ? <video src={post.media_url} controls className="mt-3 rounded-xl w-full max-h-[420px] bg-black" /> : <img src={post.media_url} alt="" className="mt-3 rounded-xl w-full max-h-[420px] object-cover" loading="lazy" />)}
    <div className="flex gap-4 mt-3 d-muted text-sm"><span className="flex items-center gap-1"><Heart size={16} />{post.likes?.length || 0}</span><a href={`/p/${post.id}`} className="flex items-center gap-1">Xem</a></div>
  </article>
}

function MenuRow({ icon: Icon, label, value, onClick, danger = false }) {
  return <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-3 py-3.5 text-left rounded-xl transition hover:bg-[var(--d-surface-2)]" style={{ color: danger ? 'var(--d-danger)' : 'var(--d-text)' }}>
    <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: danger ? 'color-mix(in srgb, var(--d-danger) 10%, transparent)' : 'var(--d-surface-2)', color: danger ? 'var(--d-danger)' : 'var(--d-primary)' }}><Icon size={18} /></span>
    <span className="flex-1 text-sm font-semibold">{label}</span>{value != null && value !== '' && <span className="text-xs d-muted">{value}</span>}<ChevronRight size={17} className="d-muted shrink-0" />
  </button>
}

function SectionTitle({ children }) { return <div className="px-3 pt-4 pb-1 text-xs font-bold uppercase tracking-wide d-muted">{children}</div> }

function PeopleList({ title, people, emptyText, userId, onToggleFollow, followingMap }) {
  if (!people?.length) return <div className="d-card p-8 text-center d-muted text-sm">{emptyText}</div>
  return (
    <div className="space-y-2">
      {people.map(p => (
        <div key={p.id} className="d-card p-3 flex items-center gap-3">
          <Avatar src={p.avatar_url} name={p.full_name || p.username} size={44} />
          <div className="min-w-0 flex-1">
            <div className="font-bold truncate text-sm">{p.full_name || p.username || 'User'}</div>
            {p.username && <div className="text-xs d-muted">@{p.username}</div>}
          </div>
          {p.id !== userId && (
            <button
              type="button"
              onClick={() => onToggleFollow?.(p.id)}
              className="text-xs px-3 py-1.5 rounded-xl font-semibold border shrink-0"
              style={followingMap?.[p.id]
                ? { borderColor: 'var(--d-border)', background: 'var(--d-surface-2)' }
                : { borderColor: 'transparent', color: '#fff', background: 'var(--d-primary)' }}
            >
              {followingMap?.[p.id] ? 'Bỏ theo dõi' : 'Theo dõi'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function ProfilePage({ userId }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState('')
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [myPosts, setMyPosts] = useState([])
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [friends, setFriends] = useState(0)
  const [view, setView] = useState('home')
  const [uploading, setUploading] = useState(false)
  const [listPeople, setListPeople] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [savedPosts, setSavedPosts] = useState([])
  const [followingMap, setFollowingMap] = useState({})
  const [privacy, setPrivacy] = useState(() => { try { return JSON.parse(localStorage.getItem('d_privacy') || '{"profile":"public","messages":"everyone"}') } catch { return { profile:'public', messages:'everyone' } } })
  const [notificationPrefs, setNotificationPrefs] = useState(() => { try { return JSON.parse(localStorage.getItem('d_notification_prefs') || '{"likes":true,"comments":true,"follows":true,"messages":true}') } catch { return { likes:true, comments:true, follows:true, messages:true } } })
  const [accountBusy, setAccountBusy] = useState(false)

  const loadProfile = async () => {
    if (!supabase) return
    const [{ data: profile }, { data: posts }, { count: followerCount }, { count: followingCount }, { data: mine }, { data: theirs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('posts').select('id,content,media_url,media_type,created_at,likes(user_id)').eq('author_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(40),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
      supabase.from('follows').select('following_id').eq('follower_id', userId),
      supabase.from('follows').select('follower_id').eq('following_id', userId)
    ])
    if (profile) { setName(profile.full_name || ''); setUsername(profile.username || ''); setBio(profile.bio || ''); setAvatar(profile.avatar_url || ''); setIsAdmin(!!profile.is_admin) }
    setMyPosts(posts || [])
    setFollowers(followerCount || 0); setFollowing(followingCount || 0)
    const mineSet = new Set((mine || []).map(x => x.following_id))
    setFriends((theirs || []).filter(x => mineSet.has(x.follower_id)).length)
    const fmap = {}
    ;(mine || []).forEach(x => { fmap[x.following_id] = true })
    setFollowingMap(fmap)
  }

  useEffect(() => { loadProfile() }, [userId])

  useEffect(() => {
    if (!supabase || !['friends','followers','following','saved'].includes(view)) return
    let alive = true
    setListLoading(true)
    ;(async () => {
      try {
        if (view === 'saved') {
          const { data } = await supabase
            .from('saved_posts')
            .select('post_id,created_at,posts(id,content,media_url,media_type,created_at,author_id,profiles(full_name,username,avatar_url),likes(user_id))')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(40)
          if (alive) setSavedPosts((data || []).map(r => r.posts).filter(Boolean))
        } else if (view === 'followers') {
          const { data } = await supabase
            .from('follows')
            .select('follower_id,profiles:follower_id(id,username,full_name,avatar_url)')
            .eq('following_id', userId)
            .order('created_at', { ascending: false })
            .limit(100)
          if (alive) setListPeople((data || []).map(r => r.profiles).filter(Boolean))
        } else if (view === 'following') {
          const { data } = await supabase
            .from('follows')
            .select('following_id,profiles:following_id(id,username,full_name,avatar_url)')
            .eq('follower_id', userId)
            .order('created_at', { ascending: false })
            .limit(100)
          if (alive) setListPeople((data || []).map(r => r.profiles).filter(Boolean))
        } else if (view === 'friends') {
          const [{ data: mine }, { data: theirs }] = await Promise.all([
            supabase.from('follows').select('following_id').eq('follower_id', userId),
            supabase.from('follows').select('follower_id,profiles:follower_id(id,username,full_name,avatar_url)').eq('following_id', userId).limit(200)
          ])
          const mineSet = new Set((mine || []).map(x => x.following_id))
          const friendsList = (theirs || []).filter(x => mineSet.has(x.follower_id)).map(x => x.profiles).filter(Boolean)
          if (alive) setListPeople(friendsList)
        }
      } finally {
        if (alive) setListLoading(false)
      }
    })()
    return () => { alive = false }
  }, [view, userId])

  const toggleFollow = async (targetId) => {
    if (!supabase || targetId === userId) return
    if (followingMap[targetId]) {
      await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId)
      setFollowingMap(x => { const n = { ...x }; delete n[targetId]; return n })
      setFollowing(c => Math.max(0, c - 1))
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: targetId })
      if (!error) {
        setFollowingMap(x => ({ ...x, [targetId]: true }))
        setFollowing(c => c + 1)
        try {
          await supabase.rpc('create_notification', {
            p_user_id: targetId,
            p_actor_id: userId,
            p_type: 'follow',
            p_title: 'Người theo dõi mới',
            p_body: 'đã theo dõi bạn'
          })
        } catch {}
      }
    }
  }

  const savePrivacy = (next) => { setPrivacy(next); try { localStorage.setItem('d_privacy', JSON.stringify(next)) } catch {} }
  const saveNotificationPrefs = (next) => { setNotificationPrefs(next); try { localStorage.setItem('d_notification_prefs', JSON.stringify(next)) } catch {} }

  const updateEmail = async () => {
    const email = prompt('Email mới')
    if (!email || !supabase) return
    setAccountBusy(true)
    try { const { error } = await supabase.auth.updateUser({ email: email.trim() }); if (error) throw error; alert('Đã gửi email xác nhận tới địa chỉ mới.') } catch (e) { alert(e.message || 'Không thể đổi email') } finally { setAccountBusy(false) }
  }
  const updatePassword = async () => {
    const password = prompt('Mật khẩu mới (ít nhất 6 ký tự)')
    if (!password || password.length < 6 || !supabase) return alert('Mật khẩu phải có ít nhất 6 ký tự.')
    setAccountBusy(true)
    try { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; alert('Đã cập nhật mật khẩu.') } catch (e) { alert(e.message || 'Không thể đổi mật khẩu') } finally { setAccountBusy(false) }
  }

  const save = async () => {
    if (!supabase) return
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() || null, username: username.trim() || null, bio: bio.trim() || null }).eq('id', userId)
    if (!error) { setSaved(true); setEditing(false); setTimeout(() => setSaved(false), 2000) } else alert(error.message)
  }

  const uploadAvatar = async (file) => {
    if (!supabase || !file || !file.type.startsWith('image/')) return
    if (file.size > MAX_IMAGE) return alert('Ảnh tối đa 8MB')
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `avatars/${userId}/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage.from('social-media').upload(path, file, { contentType: file.type, upsert: true })
      if (up.error) throw up.error
      const url = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
      if (error) throw error
      setAvatar(url)
    } catch (e) { alert(e.message || 'Không tải được ảnh') } finally { setUploading(false) }
  }

  const clips = myPosts.filter(p => p.media_type === 'video')
  const images = myPosts.filter(p => p.media_url && p.media_type === 'image')
  const displayName = name || 'Thành viên D'

  if (view !== 'home') {
    const titles = { profile:'Trang cá nhân', friends:'Bạn bè', followers:'Người theo dõi', following:'Đang theo dõi', media:'Ảnh & video của tôi', posts:'Bài viết của tôi', moments:'Khoảnh khắc của tôi', saved:'Bài viết đã lưu', settings:'Cài đặt tài khoản', privacy:'Quyền riêng tư', notifications:'Cài đặt thông báo', help:'Trợ giúp' }
    return <div className="space-y-3">
      <div className="flex items-center gap-2"><button type="button" onClick={() => setView('home')} className="d-btn-ghost !px-3">←</button><h2 className="font-black text-lg">{titles[view] || 'Trung tâm cá nhân'}</h2></div>
      {view === 'profile' && <section className="d-card p-4 space-y-3"><div className="flex items-center gap-3"><Avatar src={avatar} name={displayName} size={64} ring /><div><div className="font-bold">{displayName}</div><div className="text-sm d-muted">@{username || 'username'}</div></div></div><button type="button" onClick={() => { setEditing(true); setView('home') }} className="d-btn-primary w-full">Chỉnh sửa thông tin</button></section>}
      {['friends','followers','following'].includes(view) && (
        listLoading
          ? <div className="d-card p-8 text-center d-muted text-sm">Đang tải danh sách...</div>
          : <PeopleList
              title={titles[view]}
              people={listPeople}
              emptyText={view === 'friends' ? 'Chưa có bạn bè (theo dõi hai chiều).' : view === 'followers' ? 'Chưa có người theo dõi.' : 'Bạn chưa theo dõi ai.'}
              userId={userId}
              onToggleFollow={toggleFollow}
              followingMap={followingMap}
            />
      )}
      {(view === 'posts' || view === 'media' || view === 'moments') && <div className="space-y-3">
        {view === 'moments' ? <div className="grid grid-cols-3 gap-1.5">{images.map(p => <a key={p.id} href={`/p/${p.id}`} className="aspect-square overflow-hidden rounded-xl bg-[var(--d-surface-2)]"><img src={p.media_url} alt="" className="w-full h-full object-cover" loading="lazy" /></a>)}</div> :
        view === 'media' ? <div className="grid grid-cols-2 gap-2">{[...images, ...clips].map(p => p.media_url && <a key={p.id} href={`/p/${p.id}`} className="d-card overflow-hidden aspect-square"><img src={p.media_url} alt="" className="w-full h-full object-cover" loading="lazy" /></a>)}</div> :
        myPosts.map(p => <MiniPost key={p.id} post={p} name={displayName} avatar={avatar} />)}
        {!myPosts.length && <div className="d-card p-8 text-center d-muted text-sm">Chưa có nội dung.</div>}
      </div>}
      {view === 'saved' && (
        listLoading
          ? <div className="d-card p-8 text-center d-muted text-sm">Đang tải...</div>
          : <div className="space-y-3">
              {savedPosts.map(p => <MiniPost key={p.id} post={p} name={p.profiles?.full_name || p.profiles?.username || 'User'} avatar={p.profiles?.avatar_url} />)}
              {!savedPosts.length && <div className="d-card p-8 text-center d-muted text-sm">Chưa có bài viết đã lưu. Bấm biểu tượng ⋯ trên bài viết → Lưu bài viết.</div>}
            </div>
      )}
      {['settings','privacy','notifications','help'].includes(view) && <section className="d-card p-2">
        {view === 'settings' && <div className="space-y-1">
          <MenuRow icon={Lock} label="Quyền riêng tư" value={privacy.profile === 'public' ? 'Công khai' : 'Riêng tư'} onClick={() => setView('privacy')} />
          <MenuRow icon={Bell} label="Cài đặt thông báo" onClick={() => setView('notifications')} />
          <MenuRow icon={Settings} label="Đổi email" value={accountBusy ? 'Đang xử lý...' : ''} onClick={updateEmail} />
          <MenuRow icon={Lock} label="Đổi mật khẩu" value={accountBusy ? 'Đang xử lý...' : ''} onClick={updatePassword} />
          <MenuRow icon={HelpCircle} label="Trợ giúp" onClick={() => setView('help')} />
          {isAdmin && <MenuRow icon={Shield} label="Admin + AI kiểm duyệt" onClick={() => { window.location.href='/admin' }} />}
        </div>}
        {view === 'privacy' && <div className="p-4 space-y-4">
          <div><div className="font-bold text-sm">Ai có thể xem hồ sơ</div><select value={privacy.profile} onChange={e => savePrivacy({ ...privacy, profile:e.target.value })} className="d-input mt-2"><option value="public">Mọi người</option><option value="private">Chỉ người theo dõi</option></select></div>
          <div><div className="font-bold text-sm">Ai có thể nhắn tin</div><select value={privacy.messages} onChange={e => savePrivacy({ ...privacy, messages:e.target.value })} className="d-input mt-2"><option value="everyone">Mọi người</option><option value="following">Người tôi theo dõi</option><option value="friends">Bạn bè</option></select></div>
          <p className="text-xs d-muted">Thiết lập được lưu cho tài khoản trên thiết bị này. Quyền truy cập dữ liệu vẫn được bảo vệ bởi Supabase RLS.</p>
        </div>}
        {view === 'notifications' && <div className="p-4 space-y-1">
          {[['likes','Lượt thích'],['comments','Bình luận'],['follows','Người theo dõi'],['messages','Tin nhắn']].map(([key,label]) => <label key={key} className="flex items-center justify-between py-3"><span className="text-sm font-semibold">{label}</span><input type="checkbox" checked={!!notificationPrefs[key]} onChange={e => saveNotificationPrefs({ ...notificationPrefs, [key]:e.target.checked })} /></label>)}
          <p className="text-xs d-muted pt-2">Các lựa chọn này giúp D Social biết loại thông báo bạn muốn xem trên thiết bị hiện tại.</p>
        </div>}
        {view === 'help' && <div className="p-4 text-sm leading-relaxed d-muted space-y-2"><p>Nếu gặp lỗi, hãy tải lại ứng dụng và kiểm tra kết nối.</p><p>Bạn có thể dùng Báo cáo trên bài viết để gửi nội dung cần kiểm duyệt.</p><p>Để bảo vệ tài khoản, không chia sẻ mật khẩu hoặc mã xác nhận email.</p></div>}
      </section>
    </div>
  }

  return <div className="space-y-3">
    <section className="d-card overflow-hidden">
      <div className="h-36 sm:h-44 relative" style={{ background:'linear-gradient(135deg, color-mix(in srgb, var(--d-primary) 55%, transparent), color-mix(in srgb, #8b5cf6 45%, transparent), color-mix(in srgb, #ec4899 30%, transparent))' }}>
        <div className="absolute inset-0 opacity-40" style={{ background:'radial-gradient(circle_at_30%_20%,rgba(255,255,255,.18),transparent 50%)' }} />
        <div className="absolute bottom-3 right-3 text-[10px] text-white/60 font-medium tracking-wide">D SOCIAL</div>
      </div>
      <div className="px-4 pb-4 -mt-12 relative">
        <div className="flex items-end gap-3">
          <label className="relative cursor-pointer group shrink-0"><Avatar src={avatar} name={displayName} size={88} ring /><div className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 grid place-items-center text-white text-[10px] transition">{uploading ? '...' : <Camera size={18} />}</div><input hidden type="file" accept="image/*" onChange={e => uploadAvatar(e.target.files?.[0])} /></label>
          <div className="flex-1 min-w-0 pb-1"><h2 className="text-xl font-black truncate">{displayName}</h2><div className="text-sm d-muted">{username ? '@'+username : '@username'}</div></div>
          <button type="button" onClick={() => setEditing(v => !v)} className="d-btn-ghost text-xs shrink-0">{editing ? 'Đóng' : 'Chỉnh sửa'}</button>
        </div>
        {bio && !editing && <p className="mt-3 text-sm leading-relaxed d-muted">{bio}</p>}
        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {[[myPosts.length,'Bài viết','posts'],[friends,'Bạn bè','friends'],[followers,'Người theo dõi','followers'],[following,'Đang theo dõi','following']].map(([count,label,target]) => <button key={label} type="button" onClick={() => setView(target)} className="rounded-xl py-2.5 px-1 text-center border transition hover:bg-[var(--d-surface-2)]" style={{ borderColor:'var(--d-border)', background:'var(--d-surface)' }}><div className="font-black text-lg leading-none">{count}</div><div className="text-[10px] d-muted mt-1 leading-tight">{label}</div></button>)}
        </div>
        {editing && <div className="mt-4 space-y-2 border-t d-border-c pt-4"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Tên hiển thị" className="d-input" /><input value={username} onChange={e=>setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g,''))} placeholder="Username" className="d-input" /><textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="Giới thiệu ngắn về bạn..." className="d-input min-h-20" /><div className="flex items-center gap-2"><button type="button" onClick={save} className="d-btn-primary">Lưu hồ sơ</button>{saved && <span className="text-sm flex items-center gap-1" style={{color:'var(--d-success)'}}><Check size={15}/>Đã lưu</span>}</div></div>}
        {isAdmin && <a href="/admin" className="mt-3 text-xs inline-flex items-center gap-1" style={{color:'var(--d-warning)'}}><Shield size={14}/>Admin + AI kiểm duyệt</a>}
      </div>
    </section>
    <section className="d-card p-1.5">
      <SectionTitle>Trung tâm cá nhân</SectionTitle>
      <MenuRow icon={UserRound} label="Trang cá nhân" onClick={()=>setView('profile')} />
      <MenuRow icon={Users} label="Bạn bè" value={String(friends)} onClick={()=>setView('friends')} />
      <MenuRow icon={Heart} label="Người theo dõi" value={String(followers)} onClick={()=>setView('followers')} />
      <MenuRow icon={ImageIcon} label="Ảnh & video của tôi" value={String(images.length+clips.length)} onClick={()=>setView('media')} />
      <MenuRow icon={FileText} label="Bài viết của tôi" value={String(myPosts.length)} onClick={()=>setView('posts')} />
      <MenuRow icon={Bookmark} label="Bài viết đã lưu" onClick={()=>setView('saved')} />
    </section>
    <section className="d-card p-1.5">
      <SectionTitle>Tài khoản & hỗ trợ</SectionTitle>
      <MenuRow icon={Settings} label="Cài đặt tài khoản" onClick={()=>setView('settings')} />
      <MenuRow icon={Lock} label="Quyền riêng tư" onClick={()=>setView('privacy')} />
      <MenuRow icon={Bell} label="Thông báo" onClick={()=>setView('notifications')} />
      <MenuRow icon={HelpCircle} label="Trợ giúp" onClick={()=>setView('help')} />
      <MenuRow icon={LogOut} label="Đăng xuất" danger onClick={async()=>{await supabase?.auth.signOut()}} />
    </section>
    <div className="px-1 pb-2 text-[11px] d-muted text-center">D Social · Hồ sơ & quản lý cá nhân</div>
  </div>
}
