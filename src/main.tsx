// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Heart, MessageCircle, Send, User, LogOut, Image as ImageIcon, Video,
  MessageSquare, Home, X, Flag, Search, Shield, Download, Sparkles, Users,
  Bell, Plus, Moon, Sun, MoreHorizontal, Bookmark, Smile, Link2, UserPlus
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { moderateText } from './lib/moderation'
import { postRateLimit, commentRateLimit, messageRateLimit } from './lib/ratelimit'
import { FEED_PAGE_SIZE, buildFeedQuery } from './lib/performance'
import { ShareMenu } from './components/ShareMenu'
import { AuthScreen } from './components/AuthScreen'
import { ProfilePage } from './components/ProfilePage'
import { AdminPage } from './components/AdminPage'
import { Chat } from './components/ChatPanel'
import { Discover } from './components/DiscoverPanel'
import { Notifications } from './components/NotificationsPanel'
import './index.css'
import { LOGO_SRC } from './lib/brand'

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
  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  return { theme, toggle }
}

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
    <div className="d-card mx-3 mt-3 p-3 flex items-center gap-3 d-border-c">
      <Download size={18} style={{ color: "var(--d-primary)" }} />
      <div className="flex-1 text-sm">
        <div className="font-bold">Cài D Social</div>
        <div className="d-muted text-xs">Dùng như app trên điện thoại</div>
      </div>
      <button className="d-btn-primary text-xs px-3 py-2" onClick={async () => { deferred.prompt(); await deferred.userChoice; setDeferred(null) }}>Cài</button>
      <button className="d-muted p-1" onClick={() => { localStorage.setItem('d_install_hide', '1'); setHidden(true) }}><X size={16} /></button>
    </div>
  )
}

function Legal({ kind, onBack }) {
  const isTerms = kind === 'terms'
  return (
    <main className="max-w-2xl mx-auto p-4 pb-24">
      <button onClick={onBack} className="mb-4 text-sm">← Quay lại</button>
      <article className="d-card p-6 space-y-4">
        <h1 className="text-2xl font-black">{isTerms ? 'Điều khoản sử dụng' : 'Chính sách bảo mật'}</h1>
        {isTerms ? (
          <>
            <p className="text-sm leading-relaxed d-text">D Social là mạng xã hội độc lập. Người dùng phải tuân thủ pháp luật Việt Nam; không đăng nội dung bạo lực, khiêu dâm, lừa đảo, thù hận, spam hoặc xâm phạm bản quyền / dữ liệu cá nhân.</p>
            <p className="text-sm leading-relaxed d-text">Vi phạm có thể bị ẩn bài hoặc khóa tài khoản. Dùng nút Báo cáo trên bài viết. D Social không liên kết Meta/Facebook — giao diện và thương hiệu là thiết kế gốc.</p>
            <p className="text-sm leading-relaxed d-text">Core social (đăng bài, like, bình luận, chat, theo dõi) miễn phí. VIP chỉ bổ sung tiện ích tùy chọn, không khóa giao tiếp cơ bản.</p>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed d-text">Thu thập email, hồ sơ và nội dung bạn đăng để vận hành dịch vụ. Bảo vệ bằng Auth + RLS (Row Level Security). Không bán dữ liệu cá nhân.</p>
            <p className="text-sm leading-relaxed d-text">Bạn có thể yêu cầu xóa tài khoản và dữ liệu liên quan qua email hỗ trợ hoặc tính năng xóa trong hồ sơ (khi có). Tin nhắn chỉ người gửi/nhận đọc được. Báo cáo được lưu để xử lý kiểm duyệt.</p>
          </>
        )}
      </article>
    </main>
  )
}

function StoryRail({ people, onCompose }) {
  return (
    <section className="d-card p-3 mb-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <div>
          <div className="font-black text-sm">Khoảnh khắc</div>
          <div className="text-[11px] d-muted">Khám phá mọi người trong cộng đồng</div>
        </div>
        <button type="button" onClick={onCompose} className="text-xs font-semibold" style={{ color: 'var(--d-primary)' }}>Tạo mới</button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        <button onClick={onCompose} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
          <div className="w-14 h-14 rounded-full border-2 border-dashed grid place-items-center" style={{ borderColor: 'var(--d-primary)', background: 'var(--d-primary-soft)', color: 'var(--d-primary)' }}><Plus size={21} strokeWidth={2.5} /></div>
          <span className="text-[10px] font-semibold truncate w-full text-center">Tạo</span>
        </button>
        {people.slice(0, 12).map(p => (
          <div key={p.id} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
            <Avatar src={p.avatar_url} name={p.full_name || p.username} size={52} ring />
            <span className="text-[10px] truncate w-full text-center" style={{ color: 'var(--d-text)' }}>{(p.full_name || p.username || 'User').split(' ').pop()}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// FULL_CONTENT_CONTINUES - see artifacts/main_lean_push.tsx
export function PLACEHOLDER_NEED_FULL() { return null }
