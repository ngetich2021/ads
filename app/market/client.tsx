'use client'

import { useState, useEffect, useRef } from 'react'
import { LiveTime } from './LiveTime'
import ChallengeTab from './ChallengeTab'
import NeedTab from './NeedTab'
import FaresTab from './FaresTab'
import NewsTab from './NewsTab'
import DropShipSalesTab from './DropShipSalesTab'
import AdBanner from '@/app/components/AdBanner'
import AdSidebar from '@/app/components/AdSidebar'
import AdSticky from '@/app/components/AdSticky'
import { AdProvider } from '@/app/components/AdContext'
import type { CountryInfo, CountyInfo, ItemInfo, PriceRow, DropShipItemInfo, PublicChallengeInfo, RouteInfo, NewsInfo } from './actions'

function itemBadgeColor(name: string) {
  const palette = [
    'bg-orange-400', 'bg-sky-500', 'bg-rose-400', 'bg-emerald-500',
    'bg-amber-400', 'bg-violet-500', 'bg-pink-500', 'bg-teal-500',
  ]
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

function deviation(price: number, prev: number | null) {
  if (prev === null || prev === 0) return null
  const diff = price - prev
  const pct = ((Math.abs(diff) / prev) * 100).toFixed(2)
  return { diff, pct, up: diff > 0 }
}


type Tab = 'commodities' | 'drop-ship' | 'challenge' | 'need' | 'fares' | 'news'

type Props = {
  countries: CountryInfo[]
  counties: CountyInfo[]
  items: ItemInfo[]
  prices: PriceRow[]
  dropShipItems: DropShipItemInfo[]
  challenges: PublicChallengeInfo[]
  routes: RouteInfo[]
  news: NewsInfo[]
}

const selectClass =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-colors disabled:opacity-50 shadow-sm'

/* ── Searchable product filter ───────────────────────────────────── */

function ProductFilter({
  items, value, onChange,
}: {
  items: ItemInfo[]
  value: string
  onChange: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = items.find((i) => i.id === value)

  const matches = items
    .filter((i) => !query || i.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10)

  const total = items.filter(
    (i) => !query || i.name.toLowerCase().includes(query.toLowerCase())
  ).length

  if (selected) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white ${itemBadgeColor(selected.name)}`}>
        {selected.name}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(''); setQuery('') }}
          className="ml-0.5 opacity-70 hover:opacity-100 text-base leading-none"
          aria-label="Clear product filter"
        >
          ×
        </button>
      </span>
    )
  }

  return (
    <div className="relative w-48">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
      </span>
      <input
        type="text"
        value={query}
        placeholder="Search product…"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        className={`${selectClass} pl-8 w-full`}
      />
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-64 rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 text-center">No products found</p>
          ) : (
            <>
              {matches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(item.id); setQuery(''); setOpen(false) }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-violet-50 transition-colors group"
                >
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${itemBadgeColor(item.name)}`} />
                  <span className="flex-1 font-medium text-gray-700 group-hover:text-violet-700 truncate">{item.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{item.unitMeasure}</span>
                </button>
              ))}
              {total > 10 && (
                <p className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100 text-center">
                  +{total - 10} more — keep typing
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Tab bar ─────────────────────────────────────────────────────── */

const TABS: { id: Tab; label: string }[] = [
  { id: 'commodities', label: 'commodities' },
  { id: 'drop-ship',   label: 'drop ship' },
  { id: 'challenge',   label: 'challenge' },
  { id: 'need',        label: 'need' },
  { id: 'fares',       label: 'fares' },
  { id: 'news',        label: 'news' },
]

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex items-center gap-6 sm:gap-10 px-4 sm:px-6 border-b border-gray-200 bg-white">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            active === t.id
              ? 'text-emerald-500 border-b-2 border-emerald-500 -mb-px'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}


/* ── Main component ──────────────────────────────────────────────── */

export default function MarketClient({ countries, counties, items, prices, dropShipItems, challenges, routes, news }: Props) {
  const kenyaId = countries.find((c) => c.name === 'Kenya')?.id ?? countries[0]?.id ?? ''

  const [activeTab, setActiveTab] = useState<Tab>('commodities')
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [selectedCountryId, setSelectedCountryId] = useState(kenyaId)
  const [selectedCountyId, setSelectedCountyId] = useState(() => {
    return counties.find(c => c.name === 'Nairobi' && c.countryId === kenyaId)?.id
      ?? counties.find(c => c.countryId === kenyaId)?.id ?? ''
  })
  const [selectedMarketId, setSelectedMarketId] = useState(() => {
    const nairobi = counties.find(c => c.name === 'Nairobi' && c.countryId === kenyaId)
      ?? counties.find(c => c.countryId === kenyaId)
    return nairobi?.markets[0]?.id ?? ''
  })
  const [selectedItemId, setSelectedItemId] = useState('')

  const activeFilterCount = [selectedCountryId, selectedCountyId, selectedMarketId, activeTab === 'commodities' ? selectedItemId : ''].filter(Boolean).length

  const visibleCounties = selectedCountryId
    ? counties.filter((c) => c.countryId === selectedCountryId)
    : counties

  const availableMarkets = selectedCountyId
    ? (counties.find((c) => c.id === selectedCountyId)?.markets ?? [])
    : visibleCounties.flatMap((c) => c.markets)

  const filtered = prices
    .filter((p) => {
      if (selectedCountryId) {
        const county = counties.find((c) => c.id === p.market.county.id)
        if (!county || county.countryId !== selectedCountryId) return false
      }
      if (selectedCountyId && p.market.county.id !== selectedCountyId) return false
      if (selectedMarketId && p.market.id !== selectedMarketId) return false
      if (selectedItemId && p.item.id !== selectedItemId) return false
      return true
    })
    .sort((a, b) => a.item.name.localeCompare(b.item.name))

  const animKey = `${selectedCountryId}|${selectedCountyId}|${selectedMarketId}|${selectedItemId}`

  const tickerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const el = tickerRef.current
    if (!el) return
    const delay = Math.min(filtered.length * 30 + 500, 1200)

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
  }, [animKey, filtered.length])

  const isEmpty = prices.length === 0

  return (
    <AdProvider countyId={selectedCountyId} marketId={selectedMarketId}>
    <div className="min-h-screen bg-gray-50 flex flex-col pb-40 overflow-x-hidden">
      {/* Header */}
      <header className="bg-linear-to-r from-indigo-800 to-violet-800 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/20 grid place-items-center font-black text-white text-lg">K</div>
            <span className="font-bold text-white text-lg tracking-tight">
              Market<span className="text-violet-200">Prices</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/ads/submit" className="flex items-center gap-1.5 rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors">
              Advertise
            </a>
            <a href="/login" className="flex items-center gap-1.5 rounded-lg bg-white/15 border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25 transition-colors">
              Sign in to manage
            </a>
          </div>
        </div>
      </header>

      {/* Top banner ad — hidden on mobile (sm), visible md+ */}
      <div className="hidden md:block">
        <AdBanner />
      </div>

      {/* Tab navigation */}
      <div className="max-w-6xl w-full mx-auto px-0 sm:px-6 pt-4 sm:pt-6">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <TabBar active={activeTab} onChange={setActiveTab} />

          {/* Always-visible location filter */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-gray-100">
            <button onClick={() => setFiltersOpen(v => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-violet-700 transition-colors">
              <span className={`transition-transform duration-200 ${filtersOpen ? 'rotate-90' : ''}`}>▶</span>
              Filters
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-violet-600 px-2 py-0.5 text-xs font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button onClick={() => { setSelectedCountryId(''); setSelectedCountyId(''); setSelectedMarketId(''); setSelectedItemId('') }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors font-medium">
                  Clear all
                </button>
              )}
              <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:block">
                {activeTab === 'commodities' ? `${filtered.length} entr${filtered.length !== 1 ? 'ies' : 'y'}` : ''}
              </span>
            </div>
          </div>

          {filtersOpen && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 border-t border-gray-100 px-4 sm:px-5 py-3 sm:py-4">
              {/* Country selector */}
              {countries.length > 0 && (
                <select value={selectedCountryId} onChange={(e) => { setSelectedCountryId(e.target.value); setSelectedCountyId(''); setSelectedMarketId('') }} className={selectClass}>
                  <option value="">All Countries</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {/* County selector */}
              <select value={selectedCountyId} onChange={(e) => { setSelectedCountyId(e.target.value); setSelectedMarketId('') }} className={selectClass} disabled={visibleCounties.length === 0}>
                <option value="">All Counties</option>
                {visibleCounties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {/* Market selector */}
              <select value={selectedMarketId} onChange={e => setSelectedMarketId(e.target.value)} className={selectClass} disabled={availableMarkets.length === 0}>
                <option value="">All Markets</option>
                {availableMarkets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {/* Product filter — commodities only */}
              {activeTab === 'commodities' && <ProductFilter items={items} value={selectedItemId} onChange={setSelectedItemId} />}
            </div>
          )}
        </div>
      </div>

      {/* Main content + sidebar */}
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-6 flex-1">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] lg:grid-cols-[1fr_260px] xl:grid-cols-[1fr_300px] gap-4 md:gap-5 lg:gap-6 items-start">
          <main>

        {/* Commodities tab */}
        {activeTab === 'commodities' && (
          <>
            {isEmpty && (
              <div className="flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed border-violet-200 bg-white py-16 sm:py-20 text-center px-4">
                <div className="text-6xl">🌾</div>
                <div>
                  <p className="text-xl font-bold text-gray-800">No market data yet</p>
                  <p className="mt-1 text-sm text-gray-500">Sign in to manage.</p>
                </div>
              </div>
            )}

            {!isEmpty && (
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="hidden sm:grid grid-cols-[2.5rem_1fr_1fr_8rem_10rem_7rem_6rem] gap-2 bg-indigo-50 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-indigo-600 border-b border-indigo-100">
                  <span>#</span>
                  <span>Commodity</span>
                  <span>Market · County</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Change</span>
                  <span className="text-right">%</span>
                  <span className="text-right">Time</span>
                </div>

                {filtered.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-gray-400">No entries match your filter.</div>
                ) : (
                  <div ref={tickerRef} className="ticker-scroll" style={{ maxHeight: 'calc(100vh - 18rem)' }}>
                    <ul key={animKey}>
                      {filtered.map((row, i) => {
                        const dev = deviation(row.price, row.prevPrice)
                        const badge = itemBadgeColor(row.item.name)
                        return (
                          <li
                            key={row.id}
                            className="row-enter grid grid-cols-[2.5rem_1fr] sm:grid-cols-[2.5rem_1fr_1fr_8rem_10rem_7rem_6rem] gap-2 items-center bg-linear-to-r from-violet-700 to-indigo-700 px-4 sm:px-5 py-3.5 border-b border-violet-600/30 last:border-b-0"
                            style={{ animationDelay: `${i * 30}ms` }}
                          >
                            <span className="text-xs text-white/50 font-mono">{i + 1}</span>

                            <div className="min-w-0">
                              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold text-white ${badge}`}>
                                {row.item.name}
                              </span>
                              <span className="ml-1.5 text-xs text-white/40">{row.item.unitMeasure}</span>
                            </div>

                            <div className="hidden sm:block min-w-0">
                              <p className="text-xs font-semibold text-white/90 truncate">{row.market.name}</p>
                              <p className="text-xs text-white/50">{row.market.county.name}</p>
                            </div>

                            <div className="hidden sm:block text-right font-mono font-bold text-white">
                              KSh {row.price.toLocaleString()}
                            </div>

                            <div className="hidden sm:flex justify-end">
                              {dev
                                ? <span className={`font-bold text-sm ${dev.up ? 'text-emerald-300' : 'text-red-300'}`}>{dev.up ? '▲' : '▼'} {dev.up ? '+' : ''}{dev.diff}</span>
                                : <span className="text-white/30 text-sm">—</span>}
                            </div>

                            <div className="hidden sm:block text-right text-sm font-semibold">
                              {dev
                                ? <span className={dev.up ? 'text-emerald-300' : 'text-red-300'}>{dev.pct}%</span>
                                : <span className="text-white/30">—</span>}
                            </div>

                            <div className="hidden sm:block text-right font-mono text-xs text-white/60">
                              <LiveTime />
                            </div>

                            {/* Mobile details */}
                            <div className="sm:hidden col-span-2 flex flex-col gap-0.5 pt-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-white/50 truncate">{row.market.name} · {row.market.county.name}</span>
                                <span className="font-mono text-xs text-white/50 shrink-0"><LiveTime /></span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-bold text-white text-sm">KSh {row.price.toLocaleString()}</span>
                                {dev && (
                                  <span className={`text-xs font-bold shrink-0 ${dev.up ? 'text-emerald-300' : 'text-red-300'}`}>
                                    {dev.up ? '▲' : '▼'} {dev.diff} ({dev.pct}%)
                                  </span>
                                )}
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Drop ship tab */}
        {activeTab === 'drop-ship' && (
          <DropShipSalesTab
            dropShipItems={dropShipItems}
            selectedCountyId={selectedCountyId}
            counties={counties}
          />
        )}

        {/* Challenge tab */}
        {activeTab === 'challenge' && (
          <ChallengeTab
            challenges={challenges}
            counties={counties}
          />
        )}

        {/* Need tab */}
        {activeTab === 'need' && <NeedTab />}

        {/* Fares tab */}
        {activeTab === 'fares' && (
          <FaresTab
            routes={routes} countries={countries} counties={counties}
            selectedCountryId={selectedCountryId}
            selectedCountyId={selectedCountyId}
            selectedMarketId={selectedMarketId}
          />
        )}

        {/* News tab */}
        {activeTab === 'news' && (
          <NewsTab
            news={news}
            counties={counties}
            selectedCountyId={selectedCountyId}
            selectedMarketId={selectedMarketId}
          />
        )}
          </main>

          {/* Right sidebar ads — visible md+ */}
          <aside className="hidden md:block sticky top-4">
            <AdSidebar />
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-5 text-center text-xs text-gray-400">
        Developed with ❤ by Kwenik Developers · 0704876954
      </footer>

      {/* Sticky bottom ad */}
      <AdSticky />
    </div>
    </AdProvider>
  )
}

