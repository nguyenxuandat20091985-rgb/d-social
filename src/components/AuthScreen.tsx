import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LOGO_SRC } from '../lib/brand'

type Props = { onLegal: (page: 'terms' | 'privacy') => void }

export function AuthScreen({ onLegal }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [showEmail, setShowEmail] = useState(false)

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      const err = q.get('error_description') || q.get('error') || q.get('message')
      if (err) {
        const decoded = decodeURIComponent(err.replace(/\+/g, ' '))
        if (/exchange external code|invalid_client|unauthorized_client/i.test(decoded)) {
          setError(
            'Google chưa khớp Client ID/Secret. Vào Supabase → Authentication → Providers → Google: dán đúng Client ID + Secret của cùng một OAuth client, Save, rồi thử lại.',
          )
        } else {
          setError(decoded)
        }
        window.history.replaceState({}, '', window.location.pathname)
      }
    } catch {}
  }, [])

  if (!supabase) {
    return (
      <div className="min-h-screen grid place-items-center p-6" style={{ background: 'var(--d-bg)', color: 'var(--d-text)' }}>
        <div className="d-card max-w-md w-full p-8">
          <h1 className="text-2xl font-black">D Social</h1>
          <p className="mt-3 d-muted">Thiếu cấu hình Supabase.</p>
        </div>
      </div>
    )
  }

  const google = async () => {
    setError('')
    setInfo('')
    setBusy(true)
    const { error } = await supabase!.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
        queryParams: { access_type: 'online', prompt: 'select_account' },
      },
    })
    setBusy(false)
    if (error) {
      const msg = error.message || ''
      if (/provider is not enabled|Unsupported provider/i.test(msg)) {
        setError('Google chưa bật trên Supabase. Bật tại Authentication → Providers → Google.')
      } else if (/exchange external code/i.test(msg)) {
        setError('Client Secret không khớp Client ID. Dán lại Secret của đúng client Google rồi Save.')
      } else setError(msg)
    }
  }

  const emailAuth = async () => {
    setError('')
    setInfo('')
    if (!email.trim() || !email.includes('@')) return setError('Vui lòng nhập email hợp lệ.')
    if (mode === 'signup' && password.length < 8) return setError('Khi tạo tài khoản mới, mật khẩu cần tối thiểu 8 ký tự.')
    if (mode === 'login' && password.length < 6) return setError('Vui lòng nhập mật khẩu hợp lệ.')
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase!.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) {
          if (/invalid login credentials/i.test(error.message)) {
            setError('Sai email hoặc mật khẩu. Thử Đăng ký nếu chưa có tài khoản.')
          } else setError(error.message)
        }
      } else {
        const { data, error } = await supabase!.auth.signUp({
          email: email.trim(),
          password,
        })
        if (error) setError(error.message)
        else if (data.session) setInfo('Đăng ký thành công!')
        else
          setInfo(
            'Đăng ký thành công. Hãy kiểm tra email để xác nhận tài khoản trước khi đăng nhập nếu hệ thống yêu cầu. Nếu chưa nhận được thư, kiểm tra thư mục Spam hoặc liên hệ hỗ trợ.',
          )
      }
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    if (!email.trim() || !email.includes('@')) return setError('Nhập email trước khi đặt lại mật khẩu.')
    setBusy(true)
    setError('')
    setInfo('')
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    setBusy(false)
    if (error) setError(error.message)
    else setInfo('Đã gửi email đặt lại mật khẩu (nếu tài khoản tồn tại).')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6" style={{ background: 'var(--d-bg)', color: 'var(--d-text)' }}>
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-7">
          <img src={LOGO_SRC} alt="D Social" width={56} height={56} className="inline-block w-14 h-14 rounded-2xl shadow-md object-cover" />
          <h1 className="mt-4 text-2xl font-black tracking-tight">D Social</h1>
          <p className="mt-1.5 text-sm d-muted">Mạng xã hội văn minh · Đăng nhập nhanh</p>
        </div>

        <div className="d-card p-5 sm:p-7">
          <button
            type="button"
            disabled={busy}
            onClick={google}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-bold text-[15px] border transition active:scale-[0.99] disabled:opacity-60 min-h-[48px]"
            style={{ background: 'var(--d-surface)', borderColor: 'var(--d-border)', color: 'var(--d-text)' }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.1 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.4 7.2l.1.1 6.3 5.3C37.5 39.2 44 34 44 24c0-1.3-.1-2.5-.4-3.5z" />
            </svg>
            {busy ? 'Đang chuyển Google...' : 'Tiếp tục với Google'}
          </button>

          <p className="mt-2.5 text-center text-xs d-muted">Gmail · Một chạm · Bảo mật bởi Google</p>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1" style={{ background: 'var(--d-border)' }} />
            <button type="button" onClick={() => setShowEmail(v => !v)} className="text-xs font-medium px-2 d-muted">
              {showEmail ? 'Ẩn email' : 'Hoặc dùng email'}
            </button>
            <div className="h-px flex-1" style={{ background: 'var(--d-border)' }} />
          </div>

          {showEmail && (
            <>
              <div className="flex p-1 rounded-xl mb-4" style={{ background: 'var(--d-surface-2)' }}>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setInfo('') }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition min-h-[40px] ${
                    mode === 'login' ? 'shadow-sm' : 'd-muted'
                  }`}
                  style={mode === 'login' ? { background: 'var(--d-surface)', color: 'var(--d-text)' } : undefined}
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError(''); setInfo('') }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition min-h-[40px] ${
                    mode === 'signup' ? 'shadow-sm' : 'd-muted'
                  }`}
                  style={mode === 'signup' ? { background: 'var(--d-surface)', color: 'var(--d-text)' } : undefined}
                >
                  Đăng ký
                </button>
              </div>

              <label className="block text-xs font-medium d-muted mb-1.5">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="ban@email.com" className="d-input" />

              <label className="block text-xs font-medium d-muted mb-1.5 mt-3">Mật khẩu</label>
              <div className="relative">
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type={showPw ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'signup' ? 'Tối thiểu 8 ký tự' : 'Nhập mật khẩu'}
                  onKeyDown={e => { if (e.key === 'Enter') emailAuth() }}
                  className="d-input pr-14"
                />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium d-muted px-2 py-1">
                  {showPw ? 'Ẩn' : 'Hiện'}
                </button>
              </div>

              {mode === 'login' && (
                <button type="button" onClick={forgot} className="mt-2 text-xs font-medium" style={{ color: 'var(--d-primary)' }}>
                  Quên mật khẩu?
                </button>
              )}

              <button type="button" disabled={busy} onClick={emailAuth} className="d-btn-primary w-full mt-4 text-[15px]">
                {busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </button>
            </>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-xl text-sm leading-relaxed" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: 'var(--d-danger)' }}>
              {error}
            </div>
          )}
          {info && (
            <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', color: 'var(--d-success)' }}>
              {info}
            </div>
          )}
        </div>

        <div className="flex justify-center gap-5 mt-6 text-xs d-muted">
          <button type="button" onClick={() => onLegal('terms')} className="hover:opacity-80">Điều khoản</button>
          <button type="button" onClick={() => onLegal('privacy')} className="hover:opacity-80">Chính sách bảo mật</button>
        </div>
      </div>
    </div>
  )
}
