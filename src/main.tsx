// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './lib/supabase'
import { AdminPage } from './components/AdminPage'
import App from './App'
import './index.css'

function MainRouter() {
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

  return <App />
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<MainRouter />)
}
