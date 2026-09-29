import React, { useMemo, useState } from 'react'
import { GITHUB_PROJECTS } from '../lib/projects'

export function ProjectMarket() {
  const [q, setQ] = useState('')
  const items = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return GITHUB_PROJECTS
    return GITHUB_PROJECTS.filter(
      p =>
        p.title.toLowerCase().includes(s) ||
        p.description.toLowerCase().includes(s) ||
        p.tags.some(t => t.includes(s)),
    )
  }, [q])

  return (
    <section className="space-y-4">
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <h2 className="text-2xl font-black">Chợ dự án D</h2>
        <p className="text-slate-400 mt-2 text-sm">
          Các sản phẩm đang chạy trên GitHub của hệ sinh thái D — công khai, minh bạch, gắn với cộng đồng.
        </p>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Tìm dự án, AI, taxi, gia phả..."
          className="mt-4 w-full p-3 rounded-xl bg-slate-800 outline-none"
        />
      </div>
      <div className="grid gap-3">
        {items.map(p => (
          <a
            key={p.id}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-lg">{p.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{p.name}</div>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  p.status === 'live'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : p.status === 'beta'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-slate-700 text-slate-300'
                }`}
              >
                {p.status}
              </span>
            </div>
            <p className="text-slate-300 text-sm mt-2">{p.description}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {p.tags.map(t => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400">
                  #{t}
                </span>
              ))}
            </div>
          </a>
        ))}
        {!items.length && <p className="text-center text-slate-500 py-8">Không tìm thấy dự án.</p>}
      </div>
    </section>
  )
}
