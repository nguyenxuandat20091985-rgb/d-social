// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Eye, EyeOff,
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
  { id: 'review', label: 'Kiểm duyệt', icon: Shield },
  { id: 'posts', label: 'Bài viết', icon: FileText },
  { id: 'users', label: 'Người dùng', icon: Users },
  { id: 'reports', label: 'Báo cáo', icon: Flag },
  { id: 'audit', label: 'Nhật ký', icon: ScrollText },
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
  const 
... 