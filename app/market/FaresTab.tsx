'use client'

import { useEffect, useRef } from 'react'
import { LiveTime } from './LiveTime'
import type { RouteInfo, CountyInfo, CountryInfo } from './actions'

type Props = {
  routes: RouteInfo[]
  countries: CountryInfo[]
  counties: CountyInfo[]
  selectedCountryId: string
  selectedCountyId: string
  selectedMarketId: string
}

const TYPE_LABELS: Record<string, string> = {
  psv: '🚌 PSV', bike: '🏍 Boda', other: '🚗 Other',
}

function deviation(amount: number, prev: number | null) {
  if (!prev || prev === 0) return null
  const diff = amount - prev
  const pct = ((Math.abs(diff) / prev) * 100).toFixed(1)
  return { diff, pct, up: diff > 0 }
}

export default function FaresTab({
  routes, countries, counties, selectedCountryId, selectedCountyId, selectedMarketId,
}: Props) {
  // Filter routes by the hierarchy
  const filtered = routes.filter((r) => {
    if (selectedMarketId) return r.marketId === selectedMarketId
    if (selectedCountyId) return r.countyId === selectedCountyId || (r.marketId != null && counties.find(c => c.id === selectedCountyId)?.markets.some(m => m.id === r.marketId))
    if (selectedCountryId) return r.countryId === selectedCountryId
    return true
  })

  // Flatten to individual fare rows
  const rows = filtered.flatMap((route) =>
    route.fares.map((fare) => ({ route, fare }))
  )

  const country = countries.find((c) => c.id === selectedCountryId)
  const county = counties.find((c) => c.id === selectedCountyId)
  const market = selectedMarketId
    ? counties.flatMap((c) => c.markets).find((m) => m.id === selectedMarketId)
    : null
  const contextLabel = market?.name ?? county?.name ?? country?.name ?? 'All regions'
  const animKey = `${selectedCountryId}|${selectedCountyId}|${selectedMarketId}`

  const tickerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const el = tickerRef.current
    if (!el) return
    const delay = Math.min(rows.length * 30 + 500, 1200)
    const start = () => {
      if (el.scrollHeight <= el.clientHeight) return
      let startTime: number | null = null
      const maxScroll = el.scrollHeight - el.clientHeight
      const halfDuration = Math.min(Math.max((maxScroll / 30) * 1000, 4000), 30_000)
      const tick = (ts: number) => {
        if (!startTime) startTime = ts
        const elapsed = (ts - startTime) % (halfDuration * 2)
        el.scrollTop = elapsed < halfDuration
          ? (elapsed / halfDuration) * maxScroll
          : ((halfDuration * 2 - elapsed) / halfDuration) * maxScroll
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    const timer = setTimeout(start, delay)
    return () => { clearTimeout(timer); cancelAnimationFrame(rafRef.current); if (el) el.scrollTop = 0 }
  }, [animKey, rows.length])

  if (routes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="text-5xl mb-4">🛣️</div>
        <p className="text-lg font-bold text-gray-700">No fares available</p>
        <p className="text-sm text-gray-400 mt-1">No fare routes have been added yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 py-4">
      <div>
        <h2 className="text-lg font-black text-gray-800">Transport Fares</h2>
        <p className="text-xs text-gray-500">{contextLabel} · {filtered.length} route{filtered.length !== 1 ? 's' : ''} · {rows.length} fare{rows.length !== 1 ? 's' : ''}</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-10 text-center text-gray-400 text-sm">
          No fares match your filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="hidden sm:grid grid-cols-[2.5rem_1fr_1fr_6rem_8rem_7rem_6rem] gap-2 bg-indigo-50 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-indigo-600 border-b border-indigo-100">
            <span>#</span>
            <span>Route</span>
            <span>Market · County</span>
            <span>Type</span>
            <span className="text-right">Fare (KSh)</span>
            <span className="text-right">Change</span>
            <span className="text-right">Time</span>
          </div>

          <div ref={tickerRef} className="ticker-scroll" style={{ maxHeight: 'calc(100vh - 18rem)' }}>
            <ul key={animKey}>
              {rows.map(({ route, fare }, i) => {
                const d = deviation(fare.amount, fare.prevAmount)
                return (
                  <li
                    key={fare.id}
                    className="row-enter grid grid-cols-[2.5rem_1fr] sm:grid-cols-[2.5rem_1fr_1fr_6rem_8rem_7rem_6rem] gap-2 items-center bg-linear-to-r from-violet-700 to-indigo-700 px-4 sm:px-5 py-3.5 border-b border-violet-600/30 last:border-b-0"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <span className="text-xs text-white/50 font-mono">{i + 1}</span>

                    <div className="min-w-0">
                      <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-bold text-white bg-indigo-500">
                        {route.from}
                      </span>
                      <span className="mx-1 text-white/50 text-xs">→</span>
                      <span className="text-sm font-bold text-white/90">{route.to}</span>
                    </div>

                    <div className="hidden sm:block min-w-0">
                      <p className="text-xs font-semibold text-white/90 truncate">{route.marketName ?? '—'}</p>
                      <p className="text-xs text-white/50">{route.countyName ?? '—'}</p>
                    </div>

                    <div className="hidden sm:block text-xs font-semibold text-white/70">
                      {TYPE_LABELS[fare.transportType] ?? fare.transportType}
                    </div>

                    <div className="hidden sm:block text-right font-mono font-bold text-white">
                      {fare.amount.toLocaleString()}
                    </div>

                    <div className="hidden sm:flex justify-end items-center gap-1">
                      {d ? (
                        <>
                          <span className={`font-bold text-sm ${d.up ? 'text-emerald-300' : 'text-red-300'}`}>
                            {d.up ? '▲' : '▼'} {d.up ? '+' : ''}{d.diff}
                          </span>
                          <span className={`text-xs font-semibold ${d.up ? 'text-emerald-400' : 'text-red-400'}`}>
                            {d.pct}%
                          </span>
                        </>
                      ) : <span className="text-white/30 text-sm">—</span>}
                    </div>

                    <div className="hidden sm:block text-right font-mono text-xs text-white/60">
                      <LiveTime />
                    </div>

                    {/* Mobile */}
                    <div className="sm:hidden col-span-2 flex flex-col gap-0.5 pt-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-white/50 truncate">
                          {TYPE_LABELS[fare.transportType] ?? fare.transportType} · {route.marketName ?? route.countyName ?? '—'}
                        </span>
                        <span className="font-mono text-xs text-white/50 shrink-0"><LiveTime /></span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-white text-sm">KSh {fare.amount.toLocaleString()}</span>
                        {d && (
                          <span className={`text-xs font-bold shrink-0 ${d.up ? 'text-emerald-300' : 'text-red-300'}`}>
                            {d.up ? '▲' : '▼'} {d.diff} ({d.pct}%)
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
