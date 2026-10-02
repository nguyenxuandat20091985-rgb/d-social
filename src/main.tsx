// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './lib/supabase'
import { AdminPage } from './components/AdminPage'
import './index.css'

function MainApp() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const path = window.location.pathname

  if (path.startsWith('/admin')) {
    if (loading) {
      return (
        <div className="min-h-screen grid place-items-center" style={{ background: 'var(--d-bg)' }}>
          <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid var(--d-primary)', borderTopColor: 'transparent' }} />
        </div>
      )
    }
    if (!session) {
      window.location.href = '/'
      return null
    }
    return <AdminPage userId={session.user.id} />
  }

  return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-bold mb-2">D-Social đang hoạt động</h1>
        <p className="text-sm text-gray-500 mb-4">Truy cập trang quản trị tại /admin</p>
        <a href="/admin" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold">Vào trang Admin</a>
      </div>
    </div>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<MainApp />)
}
