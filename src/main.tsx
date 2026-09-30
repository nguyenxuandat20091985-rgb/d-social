// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthScreen } from './components/AuthScreen'
import { supabase } from './lib/supabase'
import './index.css'

function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [legal, setLegal] = useState(null)
  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  if (!ready) return <div className="min-h-screen grid place-items-center text-slate-400">Đang tải D Social...</div>
  if (!session) return <AuthScreen onLegal={setLegal} />
  return (
    <div className="min-h-screen p-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-black bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent">D Social</h1>
      <p className="text-slate-300 text-sm">Ứng dụng đang được khôi phục bản đầy đủ. Bạn đã đăng nhập thành công.</p>
      <p className="text-slate-500 text-xs">User: {session.user.email}</p>
      <button className="d-btn-primary" onClick={() => supabase.auth.signOut()}>Đăng xuất</button>
      <p className="text-amber-300 text-xs">Admin đang deploy lại main.tsx đầy đủ (P0: follow, chat read, notifications).</p>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
