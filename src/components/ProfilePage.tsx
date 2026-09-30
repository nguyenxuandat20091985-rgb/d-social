// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { Shield, Heart, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

const MAX_IMAGE = 8 * 1024 * 1024

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
  return new Date(iso).toLocaleDateString('vi-VN')
}

function MiniPost({ post, name, avatar }) {
  return (
    <article className="d-card p-4">
      <div className="flex gap-3 items-start">
        <Avatar src={avatar} name={name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-bold">{name}</div>
          <div className="text-xs text-slate-500">{timeAgo(post.created_at)}</div>
        </div>
      </div>
      {post.content && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{post.content}</p>}
      {post.media_url && (post.media_type === 'video'
        ? <video src={post.media_url} controls className="mt-3 rounded-xl w-full max-h-[420px] bg-black" />
        : <img src={post.media_url} alt="" className="mt-3 rounded-xl w-full max-h-[420px] object-cover" loading="lazy" />)}
      <div className="flex gap-4 mt-3 text-slate-500 text-sm">
        <span className="flex items-center gap-1"><Heart size={16} />{post.likes?.length || 0}</span>
        <a href={`/p/${post.id}`} className="flex items-center gap-1 hover:text-cyan-300"><MessageCircle size={16} />Xem</a>
      </div>
    </article>
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
  const [tab, setTab] = useState('posts')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.from('profiles').select('*').eq('id', userId).single().then(({ data }) => {
      if (data) {
        setName(data.full_name || '')
        setUsername(data.username || '')
        setBio(data.bio || '')
        setAvatar(data.avatar_url || '')
        setIsAdmin(!!data.is_admin)
      }
    })
    supabase
      .from('posts')
      .select('id,content,media_url,media_type,created_at,likes(user_id)')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => setMyPosts(data || []))
  }, [userId])

  const save = async () => {
    if (!supabase) return
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim() || null, username: username.trim() || null, bio: bio.trim() || null })
      .eq('id', userId)
    if (!error) {
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2000)
    }
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
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
      setAvatar(url)
    } catch (e) {
      alert(e.message || 'Không tải được ảnh')
    } finally {
      setUploading(false)
    }
  }

  const clips = myPosts.filter(p => p.media_type === 'video')
  const moments = myPosts.filter(p => p.media_url && p.media_type === 'image').slice(0, 24)
  const displayName = name || 'Thành viên D'

  return (
    <div className="space-y-0">
      <section className="d-card overflow-hidden">
        <div className="h-36 sm:h-44 relative bg-gradient-to-br from-cyan-500/40 via-violet-500/50 to-fuchsia-500/30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
          <div className="absolute bottom-3 right-3 text-[10px] text-white/50 font-medium tracking-wide">D SOCIAL</div>
        </div>
        <div className="px-4 pb-4 -mt-12 relative">
          <div className="flex items-end gap-3">
            <label className="relative cursor-pointer group shrink-0">
              <Avatar src={avatar} name={displayName} size={88} ring />
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 grid place-items-center text-white text-[10px] transition">
                {uploading ? '...' : 'Đổi ảnh'}
              </div>
              <input hidden type="file" accept="image/*" onChange={e => uploadAvatar(e.target.files?.[0])} />
            </label>
            <div className="flex-1 min-w-0 pb-1">
              <h2 className="text-xl font-black truncate">{displayName}</h2>
              {username && <div className="text-sm text-slate-400">@{username}</div>}
            </div>
            <button type="button" onClick={() => setEditing(v => !v)} className="d-btn-ghost text-xs shrink-0">
              {editing ? 'Đóng' : 'Chỉnh sửa'}
            </button>
          </div>

          {bio && !editing && <p className="mt-3 text-sm text-slate-300 leading-relaxed">{bio}</p>}

          <div className="mt-4 flex gap-3 text-center">
            <div className="flex-1 rounded-xl border border-slate-700/50 bg-slate-900/50 py-2">
              <div className="font-black text-lg">{myPosts.length}</div>
              <div className="text-[10px] text-slate-500">Bài viết</div>
            </div>
            <div className="flex-1 rounded-xl border border-slate-700/50 bg-slate-900/50 py-2">
              <div className="font-black text-lg">{clips.length}</div>
              <div className="text-[10px] text-slate-500">Clip ngắn</div>
            </div>
            <div className="flex-1 rounded-xl border border-slate-700/50 bg-slate-900/50 py-2">
              <div className="font-black text-lg">{moments.length}</div>
              <div className="text-[10px] text-slate-500">Khoảnh khắc</div>
            </div>
          </div>

          {editing && (
            <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Tên hiển thị" className="d-input" />
              <input value={username} onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="Username" className="d-input" />
              <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Giới thiệu ngắn về bạn..." className="d-input min-h-20" />
              <button type="button" onClick={save} className="d-btn-primary">Lưu hồ sơ</button>
              {saved && <span className="text-emerald-400 text-sm ml-2">Đã lưu</span>}
            </div>
          )}

          {isAdmin && (
            <p className="pt-3 text-sm">
              <a href="/admin" className="text-amber-300 underline inline-flex items-center gap-1">
                <Shield size={14} /> Admin + AI kiểm duyệt
              </a>
            </p>
          )}
        </div>
      </section>

      <div className="flex gap-1 mt-3 p-1 d-card">
        {[
          { id: 'posts', label: 'Bài viết' },
          { id: 'clips', label: 'Clip ngắn' },
          { id: 'moments', label: 'Khoảnh khắc' },
        ].map(x => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
              tab === x.id
                ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-200 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {tab === 'posts' && (
          <>
            {myPosts.map(p => (
              <MiniPost key={p.id} post={p} name={displayName} avatar={avatar} />
            ))}
            {!myPosts.length && (
              <div className="d-card p-8 text-center text-slate-500 text-sm">
                Chưa có bài viết. Vào Trang chủ để đăng bài hoặc ảnh.
              </div>
            )}
          </>
        )}

        {tab === 'clips' && (
          <>
            <div className="d-card p-3 text-xs text-slate-400 leading-relaxed">
              <b className="text-violet-300">Clip ngắn</b> — đăng video từ Trang chủ (chọn video khi tạo bài). Tính năng gốc của D Social.
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {clips.map(p => (
                <div key={p.id} className="d-card overflow-hidden aspect-[9/14] relative bg-black">
                  <video src={p.media_url} className="w-full h-full object-cover" muted playsInline controls />
                  {p.content && (
                    <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-[11px] line-clamp-2">
                      {p.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!clips.length && (
              <div className="d-card p-8 text-center text-slate-500 text-sm">
                Chưa có clip. Trang chủ → Đăng bài → chọn file video.
              </div>
            )}
          </>
        )}

        {tab === 'moments' && (
          <>
            <div className="d-card p-3 text-xs text-slate-400 leading-relaxed">
              <b className="text-cyan-300">Khoảnh khắc</b> — lưới ảnh gần đây trên trang cá nhân (thiết kế D Social).
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {moments.map(p => (
                <a key={p.id} href={`/p/${p.id}`} className="aspect-square overflow-hidden rounded-xl bg-slate-800">
                  <img src={p.media_url} alt="" className="w-full h-full object-cover hover:scale-105 transition" loading="lazy" />
                </a>
              ))}
            </div>
            {!moments.length && (
              <div className="d-card p-8 text-center text-slate-500 text-sm">
                Chưa có khoảnh khắc. Đăng ảnh từ Trang chủ.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
