// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { AuthScreen } from './components/AuthScreen'

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [legal, setLegal] = useState(null)

  useEffect(() => {
    if (!supabase) {
      setReady(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: 'var(--d-bg)', color: 'var(--d-muted)' }}>
        <p className="text-sm">Đang tải D Social...</p>
      </div>
    )
  }

  if (!session) {
    return <AuthScreen onLegal={setLegal} />
  }

  return (
    <div className="min-h-screen grid place-items-center p-6" style={{ background: 'var(--d-bg)', color: 'var(--d-text)' }}>
      <div className="text-center space-y-4 max-w-md d-card p-6">
        <h1 className="text-xl font-black">D-Social — trang chủ tạm</h1>
        <p className="text-sm d-muted leading-relaxed">
          Feed / Chat / Discover đang được restore vào file <code>src/App.tsx</code>.
          Admin dashboard vẫn hoạt động bình thường.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <a href="/admin" className="d-btn-primary text-sm px-5 py-2.5">Vào trang Admin</a>
          <button
            type="button"
            className="text-sm px-4 py-2 rounded-xl d-muted"
            style={{ border: '1px solid var(--d-border)' }}
            onClick={() => supabase?.auth.signOut()}
          >
            Đăng xuất
          </button>
        </div>
        <p className="text-xs d-muted">Đăng nhập: {session.user?.email || session.user?.id?.slice(0, 8)}</p>
      </div>
    </div>
  )
}
