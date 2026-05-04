'use client'

import React, { useState } from 'react'
import type { NewsInfo, CountyInfo } from './actions'

type Props = {
  news: NewsInfo[]
  counties: CountyInfo[]
  selectedCountyId: string
  selectedMarketId: string
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

function TargetBadge({ target }: { target: string }) {
  if (target === 'NATIONAL') return null
  if (target === 'REGIONAL') return (
    <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-semibold text-blue-700">🌍 Regional</span>
  )
  if (target === 'COUNTY') return (
    <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">📍 County</span>
  )
  if (target === 'MARKET') return (
    <span className="inline-flex items-center rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-xs font-semibold text-violet-700">🏪 Market</span>
  )
  return null
}

export default function NewsTab({ news, counties, selectedCountyId, selectedMarketId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Determine which county the selected market belongs to
  const marketCountyId = selectedMarketId
    ? counties.find(c => c.markets.some(m => m.id === selectedMarketId))?.id ?? ''
    : ''
  const effectiveCountyId = selectedCountyId || marketCountyId

  const visible = news.filter(item => {
    if (item.target === 'NATIONAL') return true
    if (item.target === 'REGIONAL') {
      if (!effectiveCountyId) return true
      return item.targetCountyIds.includes(effectiveCountyId)
    }
    if (item.target === 'COUNTY') {
      if (!effectiveCountyId) return true
      return item.targetCountyIds.includes(effectiveCountyId)
    }
    if (item.target === 'MARKET') {
      if (!selectedMarketId) return true
      return item.marketId === selectedMarketId
    }
    return true
  })

  if (news.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="text-5xl mb-4">📰</div>
        <p className="text-lg font-bold text-gray-700">No news yet</p>
        <p className="text-sm text-gray-400 mt-1">Check back soon for updates, security alerts, and opportunities.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-4">
      <div>
        <h2 className="text-lg font-black text-gray-800">News & Alerts</h2>
        <p className="text-xs text-gray-500">{visible.length} update{visible.length !== 1 ? 's' : ''}</p>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-10 text-center text-gray-400 text-sm">
          No news items match your current filter.
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left w-24">Target</th>
                  <th className="px-4 py-3 text-left w-40">Event Date</th>
                  <th className="px-4 py-3 text-left w-36">Published</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((item) => (
                  <React.Fragment key={item.id}>
                    <tr
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setExpandedId((p) => p === item.id ? null : item.id)}
                    >
                      <td className="px-4 py-3 font-semibold text-gray-800">{item.title}</td>
                      <td className="px-4 py-3"><TargetBadge target={item.target} /></td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">📅 {fmtDateTime(item.eventTime)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(item.createdAt)}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400">
                        {expandedId === item.id ? '▲' : '▼'}
                      </td>
                    </tr>
                    {expandedId === item.id && (
                      <tr>
                        <td colSpan={5} className="px-4 pb-4 pt-0 bg-indigo-50/40">
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line py-2">{item.description}</p>
                          {item.fileUrl && (
                            <a href={item.fileUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                              📎 View attachment
                            </a>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <ul className="sm:hidden divide-y divide-gray-100">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  className="w-full text-left px-4 py-3 space-y-0.5 hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId((p) => p === item.id ? null : item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-gray-800 text-sm flex-1">{item.title}</p>
                    <span className="text-xs text-gray-400 shrink-0">{expandedId === item.id ? '▲' : '▼'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TargetBadge target={item.target} />
                    <p className="text-xs text-gray-500">📅 {fmtDateTime(item.eventTime)} · Posted {fmtDate(item.createdAt)}</p>
                  </div>
                </button>
                {expandedId === item.id && (
                  <div className="px-4 pb-3 bg-indigo-50/40 space-y-2">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{item.description}</p>
                    {item.fileUrl && (
                      <a href={item.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                        📎 View attachment
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
