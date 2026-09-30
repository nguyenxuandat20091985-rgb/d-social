import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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
      <div className="min-h-screen grid place-items-center bg-slate-950 text-white p-6">
        <div className="max-w-md w-full p-8 rounded-3xl bg-slate-900 border border-slate-800">
          <h1 className="text-2xl font-black">D Social</h1>
          <p className="mt-3 text-slate-400">Thiếu cấu hình Supabase.</p>
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
        redirectTo: window.location.origin,
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
    if (password.length < 6) return setError('Mật khẩu tối thiểu 6 ký tự.')
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
            'Đăng ký OK. Nếu không vào app: tắt Confirm email trong Supabase Auth, rồi đăng nhập lại.',
          )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-72 h-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-white to-slate-200 text-slate-950 text-3xl font-black shadow-xl shadow-indigo-500/20">
              D
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight">D Social</h1>
            <p className="mt-2 text-slate-400 text-sm leading-relaxed">Đăng nhập nhanh bằng Google</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl shadow-black/40 p-6 sm:p-8">
            <button
              type="button"
              disabled={busy}
              onClick={google}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-white text-slate-950 font-bold text-[16px] hover:bg-slate-100 active:scale-[0.99] transition disabled:opacity-60 shadow-lg"
            >
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
                <path
                  fill="#FFC107"
                  d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.1 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.4 7.2l.1.1 6.3 5.3C37.5 39.2 44 34 44 24c0-1.3-.1-2.5-.4-3.5z"
                />
              </svg>
              {busy ? 'Đang chuyển Google...' : 'Đăng nhập / Đăng ký với Google'}
            </button>

            <p className="mt-3 text-center text-xs text-slate-500">Dùng tài khoản Gmail · Một chạm</p>

            <div className="flex items-center gap-3 my-6">
              <div className="h-px flex-1 bg-slate-700/80" />
              <button
                type="button"
                onClick={() => setShowEmail(v => !v)}
                className="text-xs text-slate-400 hover:text-white font-medium px-2"
              >
                {showEmail ? 'Ẩn email' : 'Hoặc dùng email'}
              </button>
              <div className="h-px flex-1 bg-slate-700/80" />
            </div>

            {showEmail && (
              <>
                <div className="flex p-1 rounded-2xl bg-slate-800/80 mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login')
                      setError('')
                      setInfo('')
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
                      mode === 'login'
                        ? 'bg-white text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Đăng nhập
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup')
                      setError('')
                      setInfo('')
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
                      mode === 'signup'
                        ? 'bg-white text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Đăng ký
                  </button>
                </div>

                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="ban@email.com"
                  className="w-full px-4 py-3.5 rounded-2xl bg-slate-800/90 border border-slate-700/80 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 transition text-[15px]"
                />

                <label className="block text-xs font-medium text-slate-400 mb-1.5 mt-4">Mật khẩu</label>
                <div className="relative">
                  <input
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    type={showPw ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder="Tối thiểu 6 ký tự"
                    onKeyDown={e => {
                      if (e.key === 'Enter') emailAuth()
                    }}
                    className="w-full px-4 py-3.5 pr-14 rounded-2xl bg-slate-800/90 border border-slate-700/80 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 transition text-[15px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white px-2 py-1"
                  >
                    {showPw ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={emailAuth}
                  className="w-full mt-5 py-3.5 rounded-2xl font-bold text-[15px] bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-lg shadow-indigo-500/25 active:scale-[0.99] transition disabled:opacity-60"
                >
                  {busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập email' : 'Tạo tài khoản'}
                </button>
              </>
            )}

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm leading-relaxed">
                {error}
              </div>
            )}
            {info && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
                {info}
              </div>
            )}
          </div>

          <div className="flex justify-center gap-5 mt-6 text-xs text-slate-500">
            <button type="button" onClick={() => onLegal('terms')} className="hover:text-slate-300">
              Điều khoản
            </button>
            <button type="button" onClick={() => onLegal('privacy')} className="hover:text-slate-300">
              Chính sách bảo mật
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
