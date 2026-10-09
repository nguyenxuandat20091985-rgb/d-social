// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, BadgeCheck, CheckCircle2, Clock, Eye, EyeOff,
  Flag, LayoutDashboard, Menu, RefreshCw, Search, Shield, Sparkles,
  Users, FileText, X, Bot, ScrollText, Settings, Home
} from 'lucide-react'
import { supabase } from '../lib/supabase'

function Avatar({ src, name, size = 36 }) {
  const letter = (name || 'A').trim().charAt(0).toUpperCase()
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, background: 'var(--d-surface-2)' }}
      />
    )
  }
  return (
    <div
      className="rounded-full font-black grid place-items-center shrink-0 text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: 'var(--d-primary)' }}
    >
      {letter}
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

async function logAiModeration(userId, source, inputText, result) {
  if (!supabase || !userId || !result || result.error) return
  try {
    await supabase.from('ai_moderation_log').insert({
      user_id: userId,
      source,
      input_text: String(inputText || '').slice(0, 4000),
      score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
      action: result.action || 'review',
      engine: result.engine || 'unknown',
      reasons: result.reasons || [],
    })
  } catch {}
}

const NAV = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'ai', label: 'AI 24/7', icon: Bot },
  { id: 'verification', label: 'Xác minh', icon: BadgeCheck },
  { id: 'review', label: 'Kiểm duyệt', icon: Shield },
  { id: 'posts', label: 'Bài viết', icon: FileText },
  { id: 'users', label: 'Người dùng', icon: Users },
  { id: 'reports', label: 'Báo cáo', icon: Flag },
  { id: 'audit', label: 'Nhật ký', icon: ScrollText },
  { id: 'settings', label: 'Cài đặt', icon: Settings },
]

function Badge({ children, tone = 'neutral' }) {
  const styles = {
    neutral: { bg: 'var(--d-surface-2)', color: 'var(--d-text)' },
    success: { bg: 'color-mix(in srgb, var(--d-success) 14%, transparent)', color: 'var(--d-success)' },
    warning: { bg: 'color-mix(in srgb, var(--d-warning) 16%, transparent)', color: 'var(--d-warning)' },
    danger: { bg: 'color-mix(in srgb, var(--d-danger) 14%, transparent)', color: 'var(--d-danger)' },
    primary: { bg: 'var(--d-primary-soft)', color: 'var(--d-primary)' },
  }[tone] || { bg: 'var(--d-surface-2)', color: 'var(--d-text)' }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap" style={{ background: styles.bg, color: styles.color }}>
      {children}
    </span>
  )
}

function Empty({ title, hint }) {
  return (
    <div className="d-card p-8 text-center">
      <div className="text-sm font-semibold">{title}</div>
      {hint && <p className="text-xs d-muted mt-1">{hint}</p>}
    </div>
  )
}

function Skeleton({ rows = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--d-surface-2)' }} />
      ))}
    </div>
  )
}

export function AdminPage({ userId }) {
  const [ok, setOk] = useState(false)
  const [gate, setGate] = useState('loading')
  const [gateError, setGateError] = useState('')
  const [tab, setTab] = useState('overview')
  const [mobileNav, setMobileNav] = useState(false)
  const [stats, setStats] = useState({ users: 0, posts24: 0, openReports: 0, hiddenPosts: 0, ai24: 0, aiHidden24: 0, aiReview24: 0, aiAllow24: 0 })
  const [reports, setReports] = useState([])
  const [logs, setLogs] = useState([])
  const [posts, setPosts] = useState([])
  const [users, setUsers] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [verificationRequests, setVerificationRequests] = useState([])
  const [aiText, setAiText] = useState('')
  const [aiResult, setAiResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [query, setQuery] = useState('')
  const [aiFilter, setAiFilter] = useState('all')
  const [reportFilter, setReportFilter] = useState('open')
  const [health, setHealth] = useState({ db: 'unknown', auth: 'unknown', ai: 'unknown', realtime: 'unknown', api: 'unknown' })
  const [adminProfile, setAdminProfile] = useState(null)
  const [userActionBusy, setUserActionBusy] = useState(null)

  const audit = async (action, targetType, targetId, meta = {}) => {
    try {
      await supabase.from('admin_audit_log').insert({
        admin_id: userId,
        action,
        target_type: targetType,
        target_id: targetId || null,
        meta,
      })
    } catch {}
  }

  const load = async () => {
    if (!supabase || !userId) return
    setGate(g => (g === 'ready' ? g : 'loading'))
    setGateError('')
    setLoadingData(true)
    try {
      const [{ data: adminAllowed, error: adminErr }, { data: me, error: meErr }] = await Promise.all([
        supabase.rpc('admin_is_current_user'),
        supabase.from('profiles').select('username,full_name,avatar_url').eq('id', userId).single(),
      ])
      if (adminErr || meErr) {
        setOk(false)
        setGate('error')
        setGateError(adminErr?.message || meErr?.message || 'Không kiểm tra được quyền quản trị')
        return
      }
      if (!adminAllowed) {
        setOk(false)
        setGate('denied')
        return
      }
      setAdminProfile(me)
      setOk(true)
      setGate('ready')

      const since = new Date(Date.now() - 86400000).toISOString()
      const [
        usersQ, posts24Q, openReportsQ, hiddenQ,
        repsQ, aiQ, recentPostsQ, peopleQ, auditQ, verificationQ,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('reports').select('id', { count: 'exact', head: true }).in('status', ['open', 'reviewing']),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('is_published', false),
        supabase.from('reports').select('id,reporter_id,target_type,target_id,reason,status,ai_score,ai_action,created_at,resolved_at,resolved_by').order('created_at', { ascending: false }).limit(120),
        supabase.from('ai_moderation_log').select('id,user_id,source,input_text,score,action,engine,reasons,created_at').order('created_at', { ascending: false }).limit(120),
        supabase.from('posts').select('id,author_id,user_id,content,is_published,created_at,ai_action,ai_score,ai_moderated_at,profiles!author_id(full_name,username,avatar_url)').order('created_at', { ascending: false }).limit(80),
        supabase.rpc('admin_list_profiles', { p_mode: 'users' }),
        supabase.from('admin_audit_log').select('id,admin_id,action,target_type,target_id,meta,created_at').order('created_at', { ascending: false }).limit(100),
        supabase.rpc('admin_list_profiles', { p_mode: 'verification' }),
      ])

      let postRows = recentPostsQ.data || []
      if (recentPostsQ.error || !postRows.length) {
        const alt = await supabase
          .from('posts')
          .select('id,author_id,user_id,content,is_published,created_at,ai_action,ai_score,ai_moderated_at,profiles!user_id(full_name,username,avatar_url)')
          .order('created_at', { ascending: false })
          .limit(80)
        if (!alt.error && alt.data?.length) postRows = alt.data
        else if (!postRows.length) {
          const plain = await supabase
            .from('posts')
            .select('id,author_id,user_id,content,is_published,created_at,ai_action,ai_score,ai_moderated_at')
            .order('created_at', { ascending: false })
            .limit(80)
          postRows = plain.data || []
        }
      }

      const aiRows = aiQ.data || []
      const ai24 = aiRows.filter(x => x.created_at >= since)
      setStats({
        users: usersQ.count || 0,
        posts24: posts24Q.count || 0,
        openReports: openReportsQ.count || 0,
        hiddenPosts: hiddenQ.count || 0,
        ai24: ai24.length,
        aiHidden24: ai24.filter(x => x.action === 'hide').length,
        aiReview24: ai24.filter(x => x.action === 'review').length,
        aiAllow24: ai24.filter(x => x.action === 'allow').length,
      })
      setReports(repsQ.data || [])
      setLogs(aiRows)
      setPosts(postRows)
      setUsers(peopleQ.data || [])
      setAuditLogs(auditQ.data || [])
      setVerificationRequests(verificationQ.data || [])
      setLastSync(new Date().toISOString())

      const dbOk = !usersQ.error
      const aiRecent = aiRows[0]?.created_at
      const aiFresh = aiRecent && (Date.now() - new Date(aiRecent).getTime() < 6 * 3600 * 1000)
      setHealth({
        db: dbOk ? 'online' : 'error',
        auth: me ? 'online' : 'error',
        ai: aiRows.length ? (aiFresh ? 'online' : 'warning') : 'warning',
        realtime: 'online',
        api: 'unknown',
      })
      try {
        const r = await fetch('/api/ai/moderate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'healthcheck xin chào' }),
        })
        setHealth(h => ({ ...h, api: r.ok ? 'online' : 'error' }))
      } catch {
        setHealth(h => ({ ...h, api: 'error' }))
      }
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    load()
    if (!supabase) return
    const ch = supabase
      .channel('admin-monitor-lite')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_moderation_log' }, () => load())
      .subscribe()
    const timer = setInterval(load, 60000)
    return () => {
      clearInterval(timer)
      supabase.removeChannel(ch)
    }
  }, [userId])

  const setReportStatus = async (id, status) => {
    if (!confirm(`Xác nhận đổi trạng thái báo cáo thành "${status}"?`)) return
    const final = ['resolved', 'dismissed'].includes(status)
    const { error } = await supabase
      .from('reports')
      .update({
        status,
        resolved_at: final ? new Date().toISOString() : null,
        resolved_by: final ? userId : null,
      })
      .eq('id', id)
    if (!error) {
      await audit('report_' + status, 'report', id)
      await load()
    } else alert(error.message)
  }

  const manageUser = async (targetId, action) => {
    if (!targetId || targetId === userId) return
    let vipDays = null
    if (action === 'vip_on') {
      const raw = prompt('VIP trong bao nhiêu ngày?', '30')
      if (raw === null) return
      vipDays = Number(raw)
      if (!Number.isInteger(vipDays) || vipDays < 1 || vipDays > 3650) return alert('Số ngày VIP phải từ 1 đến 3650.')
    }
    const labels = { ban: 'khóa tài khoản', unban: 'mở khóa tài khoản', vip_on: 'bật VIP', vip_off: 'tắt VIP' }
    if (!confirm('Xác nhận ' + (labels[action] || action) + ' cho tài khoản này?')) return
    setUserActionBusy(targetId + ':' + action)
    try {
      const { error } = await supabase.rpc('admin_manage_user', { target_user: targetId, action, vip_days: vipDays })
      if (error) throw error
      await load()
    } catch (e) {
      alert(e.message || 'Không thể thực hiện thao tác.')
    } finally {
      setUserActionBusy(null)
    }
  }

  const setPostPublished = async (id, published) => {
    const label = published ? 'khôi phục hiển thị' : 'ẩn'
    if (!confirm(`Xác nhận ${label} bài viết này?`)) return
    const { error } = await supabase.from('posts').update({ is_published: published }).eq('id', id)
    if (!error) {
      await audit(published ? 'restore_post' : 'hide_post', 'post', id)
      await load()
    } else alert(error.message)
  }

  const runVerificationCheck = async (targetUserId) => {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('ai-verification', {
        body: { action: 'check', user_id: targetUserId },
      })
      if (error) throw error
      await audit('verification_check', 'profile', targetUserId, {
        approved: data?.approved,
        follower_count: data?.follower_count,
        status: data?.verification_status,
      })
      await load()
    } catch (e) {
      alert(e.message || 'Không thể chạy kiểm tra xác minh')
    } finally {
      setBusy(false)
    }
  }

  const runAi = async () => {
    if (!aiText.trim()) return
    setBusy(true)
    setAiResult(null)
    try {
      const result = await fetch('/api/ai/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText }),
      }).then(r => r.json())
      setAiResult(result)
      await logAiModeration(userId, 'admin_test', aiText, result)
      await audit('ai_manual_test', 'ai', null, { action: result?.action, score: result?.score })
      await load()
    } catch (e) {
      setAiResult({ error: e.message })
    } finally {
      setBusy(false)
    }
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter(u => !q || [u.username, u.full_name, u.id].some(v => String(v || '').toLowerCase().includes(q)))
  }, [users, query])

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return posts.filter(p => !q || [p.content, p.author_id, p.profiles?.username, p.profiles?.full_name].some(v => String(v || '').toLowerCase().includes(q)))
  }, [posts, query])

  const filteredLogs = useMemo(() => {
    if (aiFilter === 'all') return logs
    if (aiFilter === 'error') return logs.filter(l => !l.action || l.action === 'error')
    return logs.filter(l => l.action === aiFilter)
  }, [logs, aiFilter])

  const filteredReports = useMemo(() => {
    if (reportFilter === 'all') return reports
    if (reportFilter === 'open') return reports.filter(r => ['open', 'reviewing'].includes(r.status))
    return reports.filter(r => r.status === reportFilter)
  }, [reports, reportFilter])

  const reviewQueue = useMemo(() => ({
    posts: posts.filter(p => p.ai_action === 'review' || (p.ai_score != null && p.ai_score < 70 && p.is_published !== false)),
    reports: reports.filter(r => ['open', 'reviewing'].includes(r.status)),
  }), [posts, reports])

  const healthTone = s => (s === 'online' ? 'success' : s === 'warning' ? 'warning' : s === 'error' ? 'danger' : 'neutral')
  const healthLabel = s => (s === 'online' ? 'Online' : s === 'warning' ? 'Cần chú ý' : s === 'error' ? 'Lỗi' : 'Chưa rõ')
  const activeNav = NAV.find(n => n.id === tab) || NAV[0]

  if (gate === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center p-6" style={{ background: 'var(--d-bg)' }}>
        <div className="text-center d-muted">
          <div className="w-10 h-10 mx-auto rounded-xl animate-pulse mb-3" style={{ background: 'var(--d-primary)' }} />
          <p className="text-sm">Đang kiểm tra quyền admin...</p>
        </div>
      </div>
    )
  }

  if (!ok || gate === 'denied' || gate === 'error') {
    return (
      <main className="min-h-screen grid place-items-center p-6" style={{ background: 'var(--d-bg)' }}>
        <div className="d-card max-w-lg w-full p-6 space-y-4 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl grid place-items-center" style={{ background: 'var(--d-primary-soft)', color: 'var(--d-primary)' }}>
            <Shield size={22} />
          </div>
          <h1 className="text-xl font-black">{gate === 'error' ? 'Lỗi tải Admin' : 'Chưa có quyền admin'}</h1>
          <p className="text-sm d-muted leading-relaxed">
            {gate === 'error'
              ? (gateError || 'Không kiểm tra được quyền.')
              : 'profiles.is_admin chưa bật. Chạy SQL trên Supabase rồi bấm Thử lại.'}
          </p>
          <div className="text-left rounded-xl p-3 text-xs overflow-auto" style={{ background: 'var(--d-surface-2)' }}>
            <div className="d-muted mb-1">User ID:</div>
            <code className="break-all font-mono">{userId}</code>
            <pre className="mt-3 whitespace-pre-wrap font-mono">{`update public.profiles\nset is_admin = true\nwhere id = '${userId}';`}</pre>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            <button type="button" className="d-btn-primary text-sm" onClick={load}>Thử lại</button>
            <a href="/" className="text-sm px-4 py-2 rounded-xl d-muted" style={{ border: '1px solid var(--d-border)' }}>Về trang chủ</a>
          </div>
        </div>
      </main>
    )
  }

  const Kpi = ({ label, value, icon: Icon, tone }) => (
    <div className="admin-kpi">
      <div className="flex items-start justify-between gap-2">
        <div
          className="admin-kpi-icon"
          style={{ color: tone === 'danger' ? 'var(--d-danger)' : tone === 'warning' ? 'var(--d-warning)' : 'var(--d-primary)' }}
        >
          <Icon size={18} />
        </div>
        <span className="text-2xl font-black tabular-nums">{value}</span>
      </div>
      <div className="text-xs d-muted mt-2 font-medium">{label}</div>
    </div>
  )

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar hidden md:flex">
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-2 font-black text-sm">
            <div className="w-8 h-8 rounded-xl grid place-items-center text-white" style={{ background: 'var(--d-primary)' }}>
              <Shield size={16} />
            </div>
            D-Social Admin
          </div>
          <p className="text-[11px] d-muted mt-1 px-1">Trung tâm điều hành</p>
        </div>
        <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
          {NAV.map(item => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`admin-nav-item ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.id === 'reports' && stats.openReports > 0 && (
                  <Badge tone="danger">{stats.openReports}</Badge>
                )}
                {item.id === 'review' && reviewQueue.posts.length + reviewQueue.reports.length > 0 && (
                  <Badge tone="warning">{reviewQueue.posts.length + reviewQueue.reports.length}</Badge>
                )}
              </button>
            )
          })}
        </nav>
        <div className="p-3 border-t d-border-c">
          <a href="/" className="admin-nav-item">
            <Home size={18} />
            <span>Về ứng dụng</span>
          </a>
        </div>
      </aside>

      {mobileNav && (
        <div className="admin-drawer-backdrop md:hidden" onClick={() => setMobileNav(false)}>
          <aside className="admin-drawer" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4">
              <div className="font-black text-sm flex items-center gap-2">
                <Shield size={18} style={{ color: 'var(--d-primary)' }} /> Admin
              </div>
              <button type="button" className="d-icon-btn" onClick={() => setMobileNav(false)} aria-label="Đóng menu">
                <X size={18} />
              </button>
            </div>
            <nav className="px-2 space-y-1">
              {NAV.map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-nav-item ${tab === item.id ? 'active' : ''}`}
                    onClick={() => { setTab(item.id); setMobileNav(false) }}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </nav>
          </aside>
        </div>
      )}

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="flex items-center gap-2 min-w-0">
            <button type="button" className="d-icon-btn md:hidden" onClick={() => setMobileNav(true)} aria-label="Mở menu">
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-black truncate">{activeNav.label}</h1>
              <p className="text-[11px] d-muted truncate">
                {lastSync ? `Đồng bộ ${timeAgo(lastSync)}` : 'Chưa đồng bộ'}
                {loadingData ? ' · đang tải…' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge tone={health.ai === 'online' ? 'success' : health.ai === 'warning' ? 'warning' : 'danger'}>
              AI {healthLabel(health.ai)}
            </Badge>
            <button type="button" className="d-btn-ghost text-xs px-3" onClick={load} disabled={loadingData} aria-label="Làm mới">
              <RefreshCw size={14} className={loadingData ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
            <div className="hidden sm:flex items-center gap-2 pl-1">
              <Avatar src={adminProfile?.avatar_url} name={adminProfile?.full_name || adminProfile?.username || 'A'} size={32} />
            </div>
          </div>
        </header>

        <div className="admin-content">
          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="admin-kpi-grid">
                <Kpi label="Tổng người dùng" value={stats.users} icon={Users} />
                <Kpi label="Bài viết 24h" value={stats.posts24} icon={FileText} />
                <Kpi label="Báo cáo chờ" value={stats.openReports} icon={Flag} tone="warning" />
                <Kpi label="Bài bị ẩn" value={stats.hiddenPosts} icon={EyeOff} tone="danger" />
                <Kpi label="AI checks 24h" value={stats.ai24} icon={Activity} />
                <Kpi label="AI review 24h" value={stats.aiReview24} icon={AlertTriangle} tone="warning" />
                <Kpi label="AI hidden 24h" value={stats.aiHidden24} icon={EyeOff} tone="danger" />
                <Kpi label="AI allow 24h" value={stats.aiAllow24} icon={CheckCircle2} />
              </div>
              <section className="d-card p-4">
                <h2 className="font-bold text-sm mb-3 flex items-center gap-2"><Activity size={16} /> System Health</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {Object.entries(health).map(([k, v]) => (
                    <div key={k} className="rounded-xl p-3 text-center" style={{ background: 'var(--d-surface-2)' }}>
                      <div className="text-[11px] d-muted uppercase tracking-wide">{k}</div>
                      <Badge tone={healthTone(v)}>{healthLabel(v)}</Badge>
                    </div>
                  ))}
                </div>
              </section>
              <section className="d-card p-4">
                <h2 className="font-bold text-sm mb-3">Hàng đợi kiểm duyệt</h2>
                <div className="flex flex-wrap gap-3 text-sm">
                  <Badge tone="warning">{reviewQueue.posts.length} bài cần review</Badge>
                  <Badge tone="danger">{reviewQueue.reports.length} báo cáo mở</Badge>
                </div>
              </section>
            </div>
          )}

          {tab === 'ai' && (
            <div className="space-y-4">
              <section className="d-card p-4 space-y-3">
                <h2 className="font-bold text-sm flex items-center gap-2"><Bot size={16} /> Test AI Moderate</h2>
                <textarea className="d-input min-h-[100px]" value={aiText} onChange={e => setAiText(e.target.value)} placeholder="Nhập nội dung để kiểm tra AI..." />
                <button type="button" className="d-btn-primary text-sm" onClick={runAi} disabled={busy || !aiText.trim()}>{busy ? 'Đang chạy...' : 'Chạy AI'}</button>
                {aiResult && (
                  <pre className="text-xs rounded-xl p-3 overflow-auto" style={{ background: 'var(--d-surface-2)' }}>{JSON.stringify(aiResult, null, 2)}</pre>
                )}
              </section>
              <div className="flex flex-wrap gap-2">
                {['all', 'allow', 'review', 'hide', 'error'].map(f => (
                  <button key={f} type="button" className={`text-xs px-3 py-1.5 rounded-full font-bold ${aiFilter === f ? 'text-white' : 'd-muted'}`} style={{ background: aiFilter === f ? 'var(--d-primary)' : 'var(--d-surface-2)' }} onClick={() => setAiFilter(f)}>{f}</button>
                ))}
              </div>
              {loadingData && !logs.length ? <Skeleton rows={4} /> : filteredLogs.length === 0 ? <Empty title="Chưa có log AI" hint="Log sẽ xuất hiện khi hệ thống moderate nội dung." /> : (
                <div className="space-y-2">
                  {filteredLogs.slice(0, 40).map(l => (
                    <div key={l.id} className="d-card p-3 flex gap-3 items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge tone={l.action === 'hide' ? 'danger' : l.action === 'review' ? 'warning' : 'success'}>{l.action || '—'}</Badge>
                          <span className="d-muted">{l.engine}</span>
                          <span className="d-muted">{timeAgo(l.created_at)}</span>
                          {l.score != null && <span className="font-mono">{l.score}</span>}
                        </div>
                        <p className="text-sm mt-1 line-clamp-2">{l.input_text || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'review' && (
            <div className="space-y-4">
              <h2 className="font-bold text-sm">Bài cần review</h2>
              {reviewQueue.posts.length === 0 ? <Empty title="Không có bài chờ review" /> : reviewQueue.posts.slice(0, 30).map(p => (
                <div key={p.id} className="d-card p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs d-muted">
                    <span>{p.profiles?.full_name || p.profiles?.username || p.author_id?.slice(0, 8)}</span>
                    <span>·</span>
                    <span>{timeAgo(p.created_at)}</span>
                    {p.ai_score != null && <Badge tone="warning">score {p.ai_score}</Badge>}
                  </div>
                  <p className="text-sm line-clamp-2">{p.content || '(không có text)'}</p>
                  <div className="flex gap-2">
                    <button type="button" className="d-btn-primary text-xs px-3" onClick={() => setPostPublished(p.id, true)}>Hiện</button>
                    <button type="button" className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--d-surface-2)' }} onClick={() => setPostPublished(p.id, false)}>Ẩn</button>
                  </div>
                </div>
              ))}
              <h2 className="font-bold text-sm pt-2">Báo cáo mở</h2>
              {reviewQueue.reports.length === 0 ? <Empty title="Không có báo cáo mở" /> : reviewQueue.reports.slice(0, 30).map(r => (
                <div key={r.id} className="d-card p-3 space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge tone="danger">{r.status}</Badge>
                    <span className="d-muted">{r.target_type}</span>
                    <span className="d-muted">{timeAgo(r.created_at)}</span>
                  </div>
                  <p className="text-sm">{r.reason || '—'}</p>
                  <div className="flex gap-2">
                    <button type="button" className="d-btn-primary text-xs px-3" onClick={() => setReportStatus(r.id, 'resolved')}>Resolved</button>
                    <button type="button" className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--d-surface-2)' }} onClick={() => setReportStatus(r.id, 'dismissed')}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'verification' && (
            <div className="space-y-4">
              <section className="d-card p-4">
                <div className="flex items-center gap-2">
                  <BadgeCheck size={18} style={{ color: 'var(--d-primary)' }} />
                  <div>
                    <h2 className="font-bold text-sm">AI Admin — Xác minh tài khoản</h2>
                    <p className="text-xs d-muted mt-1">Tự động kiểm tra người theo dõi thực, hồ sơ và lịch sử vi phạm.</p>
                  </div>
                </div>
              </section>
              {verificationRequests.length === 0 ? <Empty title="Chưa có yêu cầu xác minh" hint="Yêu cầu mới sẽ xuất hiện ở đây." /> : (
                <div className="space-y-2">
                  {verificationRequests.slice(0, 50).map(v => (
                    <div key={v.id} className="d-card p-3 flex gap-3 items-center">
                      <Avatar src={v.avatar_url} name={v.full_name || v.username} size={42} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm truncate">{v.full_name || v.username || 'User'}</span>
                          {v.is_verified && <Badge tone="primary">✓ Đã xác minh</Badge>}
                          <Badge tone={v.verification_status === 'pending' ? 'warning' : v.verification_status === 'approved' ? 'success' : 'danger'}>{v.verification_status}</Badge>
                        </div>
                        <div className="text-xs d-muted mt-1">
                          {Number(v.follower_count || 0).toLocaleString('vi-VN')} người theo dõi · {Number(v.community_violation_count || 0)} vi phạm
                        </div>
                        {v.verification_rejection_reason && <div className="text-xs mt-1" style={{ color: 'var(--d-danger)' }}>{v.verification_rejection_reason}</div>}
                      </div>
                      {v.verification_status !== 'approved' && (
                        <button type="button" className="d-btn-primary text-xs px-3 shrink-0" disabled={busy} onClick={() => runVerificationCheck(v.id)}>
                          Kiểm tra lại
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'posts' && (
            <div className="space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 d-muted" />
                <input className="d-input pl-9" placeholder="Tìm bài viết..." value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              {filteredPosts.length === 0 ? <Empty title="Không có bài viết" /> : filteredPosts.slice(0, 40).map(p => (
                <div key={p.id} className="d-card p-3 flex gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs d-muted">
                      <span>{p.profiles?.full_name || p.profiles?.username || '—'}</span>
                      <span>{timeAgo(p.created_at)}</span>
                      {!p.is_published && <Badge tone="danger">Ẩn</Badge>}
                      {p.ai_action && <Badge tone={p.ai_action === 'hide' ? 'danger' : p.ai_action === 'review' ? 'warning' : 'success'}>{p.ai_action}</Badge>}
                    </div>
                    <p className="text-sm mt-1 line-clamp-2">{p.content || '(media only)'}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {p.is_published !== false ? (
                      <button type="button" className="d-icon-btn" title="Ẩn" onClick={() => setPostPublished(p.id, false)}><EyeOff size={16} /></button>
                    ) : (
                      <button type="button" className="d-icon-btn" title="Hiện" onClick={() => setPostPublished(p.id, true)}><Eye size={16} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'users' && (
            <div className="space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 d-muted" />
                <input className="d-input pl-9" placeholder="Tìm user..." value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              {filteredUsers.length === 0 ? <Empty title="Không có user" /> : filteredUsers.slice(0, 50).map(u => (
                <div key={u.id} className="d-card p-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar src={u.avatar_url} name={u.full_name || u.username} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{u.full_name || u.username || '—'}</div>
                      <div className="text-xs d-muted truncate">@{u.username || u.id.slice(0, 8)} · {timeAgo(u.created_at)}</div>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {u.is_admin && <Badge tone="primary">Admin</Badge>}
                      {u.is_vip && <Badge tone="warning">VIP{u.vip_expires_at ? ' · ' + new Date(u.vip_expires_at).toLocaleDateString('vi-VN') : ''}</Badge>}
                      {u.is_suspended && <Badge tone="danger">Đã khóa</Badge>}
                      {u.is_online && <Badge tone="success">Online</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="text-xs px-3 py-2 rounded-xl" style={{background:'var(--d-surface-2)'}} disabled={!!userActionBusy || u.id === userId} onClick={() => manageUser(u.id, u.is_suspended ? 'unban' : 'ban')}>
                      {userActionBusy?.startsWith(u.id + ':') ? 'Đang xử lý…' : (u.is_suspended ? 'Mở khóa' : 'Khóa user')}
                    </button>
                    <button type="button" className="text-xs px-3 py-2 rounded-xl" style={{background:'var(--d-surface-2)'}} disabled={!!userActionBusy} onClick={() => manageUser(u.id, u.is_vip ? 'vip_off' : 'vip_on')}>
                      {u.is_vip ? 'Tắt VIP' : 'Bật VIP'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'reports' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {['open', 'all', 'resolved', 'dismissed', 'reviewing'].map(f => (
                  <button key={f} type="button" className={`text-xs px-3 py-1.5 rounded-full font-bold ${reportFilter === f ? 'text-white' : 'd-muted'}`} style={{ background: reportFilter === f ? 'var(--d-primary)' : 'var(--d-surface-2)' }} onClick={() => setReportFilter(f)}>{f}</button>
                ))}
              </div>
              {filteredReports.length === 0 ? <Empty title="Không có báo cáo" /> : filteredReports.slice(0, 40).map(r => (
                <div key={r.id} className="d-card p-3 space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge tone={['open', 'reviewing'].includes(r.status) ? 'danger' : 'neutral'}>{r.status}</Badge>
                    <span className="d-muted">{r.target_type} · {timeAgo(r.created_at)}</span>
                    {r.target_type === 'post' && r.target_id && <a className="text-xs font-bold" style={{color:'var(--d-primary)'}} href={'/p/' + r.target_id}>Xem bài</a>}
                  </div>
                  <p className="text-sm">{r.reason || '—'}</p>
                  {['open', 'reviewing'].includes(r.status) && (
                    <div className="flex gap-2">
                      <button type="button" className="d-btn-primary text-xs px-3" onClick={() => setReportStatus(r.id, 'resolved')}>Resolved</button>
                      <button type="button" className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--d-surface-2)' }} onClick={() => setReportStatus(r.id, 'dismissed')}>Dismiss</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'audit' && (
            <div className="space-y-2">
              {auditLogs.length === 0 ? <Empty title="Chưa có nhật ký admin" /> : auditLogs.slice(0, 50).map(a => (
                <div key={a.id} className="d-card p-3 flex gap-3 text-sm">
                  <Clock size={16} className="shrink-0 d-muted mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold">{a.action}</div>
                    <div className="text-xs d-muted">{a.target_type} {a.target_id ? `· ${String(a.target_id).slice(0, 8)}` : ''} · {timeAgo(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4">
              <section className="d-card p-4">
                <h2 className="font-bold text-sm mb-2 flex items-center gap-2"><Settings size={16} /> Cài đặt Admin</h2>
                <p className="text-sm d-muted leading-relaxed">Quyền admin dựa trên cột <code>profiles.is_admin</code>. Cấp quyền bằng SQL trên Supabase:</p>
                <pre className="mt-3 text-xs rounded-xl p-3 overflow-auto font-mono" style={{ background: 'var(--d-surface-2)' }}>{`update public.profiles\nset is_admin = true\nwhere id = '${userId}';`}</pre>
                <p className="text-xs d-muted mt-3">Realtime monitor tự refresh mỗi 60s + khi có report/AI log mới.</p>
              </section>
            </div>
          )}
        </div>

        <nav className="admin-bottom-nav md:hidden">
          {NAV.filter(item => ['overview','review','reports','audit','users'].includes(item.id)).map(item => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`admin-bottom-item ${active ? 'active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                <Icon size={18} />
                <span>{item.label.split(' ')[0]}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
