'use client'

import type { NewsInfo } from './actions'

type Props = { news: NewsInfo[] }

const CATEGORY_CONFIG: Record<string, { label: string; cls: string; icon: string }> = {
  security:      { label: 'Security', cls: 'bg-red-100 text-red-700 border-red-200', icon: '🔒' },
  jobs:          { label: 'Jobs', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '💼' },
  opportunities: { label: 'Opportunity', cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: '⭐' },
  general:       { label: 'General', cls: 'bg-blue-100 text-blue-700 border-blue-200', icon: '📢' },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function NewsTab({ news }: Props) {
  if (news.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="text-5xl mb-4">📰</div>
        <p className="text-lg font-bold text-gray-700">No news yet</p>
        <p className="text-sm text-gray-400 mt-1">Check back soon for updates on security, jobs, and opportunities.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-lg font-black text-gray-800">News & Alerts</h2>
          <p className="text-xs text-gray-500">{news.length} update{news.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {news.map((item) => {
        const cat = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.general
        return (
          <div key={item.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${cat.cls}`}>
                      {cat.icon} {cat.label}
                    </span>
                    <span className="text-xs text-gray-400">{fmtDate(item.publishedAt)}</span>
                  </div>
                  <h3 className="font-bold text-gray-800 text-base leading-snug">{item.title}</h3>
                  <p className="text-sm text-gray-600 mt-1.5 leading-relaxed whitespace-pre-line">{item.description}</p>
                  {item.fileUrl && (
                    <a href={item.fileUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                      📎 View attachment
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
