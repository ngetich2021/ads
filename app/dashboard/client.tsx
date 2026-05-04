'use client'

import Image from 'next/image'
import { useState, useEffect, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MarketModal, type ModalMode } from '@/app/market/modal'
import {
  deletePrice,
  addAllowedEmail, removeAllowedEmail,
  deleteItem, assignEmailToCounty,
  upsertUserProfile,
  createDropShipItem, updateDropShipItem, deleteDropShipItem,
  createChallenge, updateChallenge, deleteChallenge, toggleChallengePublished,
  getSubmissions, approveSubmission, rejectSubmission,
  createRoute, deleteRoute, upsertFare, deleteFare, extendChallenge,
  createNews, updateNews, deleteNews,
  updateDropShipSaleAdmin,
  updateVerificationStatus,
  updateAgentRoles,
  type NeedRequestInfo,
  type MarketInfo,
} from '@/app/market/actions'
import NeedRequestsPanel from './NeedRequestsPanel'
import AgentVerificationModal from './AgentVerificationModal'
import { LiveTime } from '@/app/market/LiveTime'
import { signOutAction } from '@/app/actions'
import type {
  CountyInfo, CountryInfo, ItemInfo, PriceRow,
  AllowedEmailInfo, UserProfileInfo, DropShipItemInfo,
  ChallengeInfo, SubmissionInfo, RangeEntry, PlatformConfig, PaymentRecord,
  RouteInfo, NewsInfo, DropShipSaleInfo, AgentVerificationInfo,
} from '@/app/market/actions'

type User = { name: string; email: string; image: string | null }

type Props = {
  countries: CountryInfo[]
  counties: CountyInfo[]
  items: ItemInfo[]
  prices: PriceRow[]
  allowedEmails: AllowedEmailInfo[]
  dropShipItems: DropShipItemInfo[]
  challenges: ChallengeInfo[]
  needRequests: NeedRequestInfo[]
  routes: RouteInfo[]
  news: NewsInfo[]
  dropShipSales: DropShipSaleInfo[]
  agentVerifications: AgentVerificationInfo[]
  userCountyId: string | null
  userRoles: string[]
  userMarketIds: string[]
  userProfile: UserProfileInfo | null
  user: User
}

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

export default function DashboardClient({
  countries, counties, items, prices, allowedEmails, dropShipItems, challenges, needRequests,
  routes, news, dropShipSales, agentVerifications,
  userCountyId, userRoles, userMarketIds, userProfile, user,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const isAdmin = userCountyId === null
  const hasRole = (role: string) => isAdmin || userRoles.includes(role)

  // Counties that contain at least one of the agent's assigned markets
  const agentMarketIds = new Set(userMarketIds)
  const agentCounties = !isAdmin
    ? counties.filter(c => c.markets.some(m => agentMarketIds.has(m.id)))
    : counties

  const kenyaId = countries.find((c) => c.name === 'Kenya')?.id ?? countries[0]?.id ?? ''
  const defaultCountyId = (() => {
    if (!isAdmin && agentCounties.length > 0) return agentCounties[0].id
    const kc = counties.filter((c) => c.countryId === kenyaId)
    return kc.find((c) => c.name === 'Nairobi')?.id ?? kc[0]?.id ?? counties[0]?.id ?? ''
  })()

  const [selectedCountryId, setSelectedCountryId] = useState(kenyaId)
  const [selectedCountyId, setSelectedCountyId] = useState(defaultCountyId)
  const [selectedMarketId, setSelectedMarketId] = useState(() => {
    const county = counties.find((c) => c.id === defaultCountyId)
    const markets = county?.markets ?? []
    const first = !isAdmin ? markets.find(m => agentMarketIds.has(m.id)) : markets[0]
    return first?.id ?? markets[0]?.id ?? ''
  })
  const [modal, setModal] = useState<ModalMode | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showEmailPanel, setShowEmailPanel] = useState(false)
  const [showItemsPanel, setShowItemsPanel] = useState(false)
  const [showDropShipPanel, setShowDropShipPanel] = useState(false)
  const [showChallengePanel, setShowChallengePanel] = useState(false)
  const [showNeedPanel, setShowNeedPanel] = useState(false)
  const [showRoutesPanel, setShowRoutesPanel] = useState(false)
  const [showNewsPanel, setShowNewsPanel] = useState(false)
  const [showSalesPanel, setShowSalesPanel] = useState(false)
  const [showVerificationsPanel, setShowVerificationsPanel] = useState(false)
  const [showMarketPanel, setShowMarketPanel] = useState(() => isAdmin || userRoles.includes('market'))
  const [showProfilePanel, setShowProfilePanel] = useState(false)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [profileWarning, setProfileWarning] = useState(false)
  const [showManageMenu, setShowManageMenu] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const manageMenuRef = useRef<HTMLDivElement>(null)

  const closeAllPanels = () => {
    setShowEmailPanel(false)
    setShowItemsPanel(false)
    setShowDropShipPanel(false)
    setShowChallengePanel(false)
    setShowNeedPanel(false)
    setShowRoutesPanel(false)
    setShowNewsPanel(false)
    setShowSalesPanel(false)
    setShowVerificationsPanel(false)
    setShowMarketPanel(false)
  }

  const pendingVerifications = agentVerifications.filter((v) => v.verificationStatus === 'PENDING').length
  const pendingSales = dropShipSales.filter((s) => s.status === 'PENDING').length

  const filteredCounties = !isAdmin
    ? agentCounties
    : selectedCountryId
      ? counties.filter((c) => c.countryId === selectedCountryId)
      : counties

  const selectedCounty = counties.find((c) => c.id === selectedCountyId)
  const marketsInCounty = (selectedCounty?.markets ?? []).filter(
    m => isAdmin || agentMarketIds.has(m.id)
  )

  const [prevCountyId, setPrevCountyId] = useState(selectedCountyId)
  if (prevCountyId !== selectedCountyId) {
    setPrevCountyId(selectedCountyId)
    setSelectedMarketId(marketsInCounty[0]?.id ?? '')
  }

  // Close profile panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfilePanel(false)
      }
    }
    if (showProfilePanel) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showProfilePanel])

  // Close manage menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (manageMenuRef.current && !manageMenuRef.current.contains(e.target as Node)) {
        setShowManageMenu(false)
      }
    }
    if (showManageMenu) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showManageMenu])

  const visibleMarkets = marketsInCounty
    .filter((m) => !selectedMarketId || m.id === selectedMarketId)
    .map((m) => ({ ...m, countyName: selectedCounty?.name ?? '' }))

  const pricesByMarket = (marketId: string) =>
    prices.filter((p) => p.market.id === marketId)

  const isEmpty = prices.filter((p) =>
    p.market.county.id === selectedCountyId &&
    (!selectedMarketId || p.market.id === selectedMarketId)
  ).length === 0

  const handleDelete = (id: string) => {
    if (!confirm('Remove this price entry?')) return
    setDeletingId(id)
    startTransition(async () => {
      const result = await deletePrice(id)
      setDeletingId(null)
      if (result.success) router.refresh()
      else alert(result.error)
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-linear-to-r from-indigo-800 to-violet-800 shadow-lg sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/20 grid place-items-center font-black text-white text-lg">K</div>
            <span className="font-bold text-white text-lg tracking-tight hidden sm:block">
              Mkt<span className="text-violet-200"> Prices</span>
              <span className="ml-2 text-xs font-normal bg-white/20 rounded-full px-2 py-0.5">Dashboard</span>
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Manage button — admins always, agents when they have roles */}
            {(isAdmin || userRoles.length > 0) && (
              <button
                onClick={() => setShowManageMenu(v => !v)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${showManageMenu ? 'bg-white/25 border-white/40 text-white' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}
              >
                ⚙ Manage {showManageMenu ? '▲' : '▼'}
                {isAdmin && (pendingVerifications + pendingSales + needRequests.filter(r => r.status === 'SUBMITTED').length) > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1rem] h-4 rounded-full bg-amber-400 text-white text-[10px] font-bold px-1">
                    {pendingVerifications + pendingSales + needRequests.filter(r => r.status === 'SUBMITTED').length}
                  </span>
                )}
              </button>
            )}

            {/* Profile button */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setShowProfilePanel((v) => !v)}
                className="flex items-center gap-2 rounded-xl hover:bg-white/10 px-2 py-1 transition-colors"
              >
                {user.image ? (
                  <Image src={user.image} alt={user.name} width={32} height={32} className="rounded-full ring-2 ring-white/30" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-white/20 grid place-items-center text-sm font-bold text-white">
                    {user.name[0]}
                  </div>
                )}
                <div className="hidden sm:flex flex-col leading-tight text-left">
                  <span className="text-sm text-white/90 max-w-28 truncate font-medium">{user.name}</span>
                  {!isAdmin && selectedCounty && (
                    <span className="text-xs text-violet-300">{selectedCounty.name}</span>
                  )}
                  {isAdmin && (
                    <span className="text-xs text-emerald-300">Global Admin</span>
                  )}
                </div>
              </button>

              {/* Profile dropdown panel — fixed sheet on mobile, absolute dropdown on sm+ */}
              {showProfilePanel && (
                <>
                  {/* Mobile: full-width sheet pinned to top of screen below header */}
                  <div className="sm:hidden fixed inset-x-0 top-16 z-50 px-3 pt-2">
                    <div className="rounded-2xl border border-violet-100 bg-white shadow-2xl overflow-hidden">
                      <ProfilePanel
                        user={user}
                        profile={userProfile}
                        isAdmin={isAdmin}
                        countyName={selectedCounty?.name ?? null}
                        onClose={() => setShowProfilePanel(false)}
                        onSaved={() => router.refresh()}
                        onOpenEmailPanel={() => { setShowEmailPanel(true); setShowItemsPanel(false); setShowProfilePanel(false) }}
                        onOpenItemsPanel={() => { setShowItemsPanel(true); setShowEmailPanel(false); setShowProfilePanel(false) }}
                      />
                    </div>
                  </div>
                  {/* sm+: anchored dropdown, clamped so it never leaves the viewport */}
                  <div className="hidden sm:block absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-2xl border border-violet-100 bg-white shadow-2xl shadow-violet-100 z-50 overflow-hidden">
                    <ProfilePanel
                      user={user}
                      profile={userProfile}
                      isAdmin={isAdmin}
                      countyName={selectedCounty?.name ?? null}
                      onClose={() => setShowProfilePanel(false)}
                      onSaved={() => router.refresh()}
                      onOpenEmailPanel={() => { setShowEmailPanel(true); setShowItemsPanel(false); setShowProfilePanel(false) }}
                      onOpenItemsPanel={() => { setShowItemsPanel(true); setShowEmailPanel(false); setShowProfilePanel(false) }}
                    />
                  </div>
                </>
              )}
            </div>

            <form action={signOutAction}>
              <button type="submit" className="rounded-lg bg-white/10 border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Manage menu panel */}
      {showManageMenu && (isAdmin || userRoles.length > 0) && (
        <div ref={manageMenuRef} className="bg-white border-b border-gray-200 shadow-sm sticky top-16 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'market',    icon: '🏪', label: 'Market',    show: isAdmin || hasRole('market'),    setter: () => { closeAllPanels(); setShowMarketPanel(true);       setShowManageMenu(false) }, active: showMarketPanel },
                { key: 'items',     icon: '🌾', label: 'Products',  show: isAdmin,                         setter: () => { closeAllPanels(); setShowItemsPanel(true);        setShowManageMenu(false) }, active: showItemsPanel },
                { key: 'dropship',  icon: '📦', label: 'Drop Ship', show: isAdmin || hasRole('drop-ship'), setter: () => { closeAllPanels(); setShowDropShipPanel(true);     setShowManageMenu(false) }, active: showDropShipPanel },
                { key: 'challenge', icon: '🏆', label: 'Challenge', show: isAdmin || hasRole('challenge'), setter: () => { closeAllPanels(); setShowChallengePanel(true);    setShowManageMenu(false) }, active: showChallengePanel },
                { key: 'needs',     icon: '📋', label: 'Needs',     show: isAdmin || hasRole('needs'),     setter: () => { closeAllPanels(); setShowNeedPanel(true);         setShowManageMenu(false) }, active: showNeedPanel, badge: needRequests.filter(r => r.status === 'SUBMITTED').length },
                { key: 'fares',     icon: '🚌', label: 'Fares',     show: isAdmin || hasRole('fares'),     setter: () => { closeAllPanels(); setShowRoutesPanel(true);       setShowManageMenu(false) }, active: showRoutesPanel },
                { key: 'news',      icon: '📰', label: 'News',      show: isAdmin || hasRole('news'),      setter: () => { closeAllPanels(); setShowNewsPanel(true);         setShowManageMenu(false) }, active: showNewsPanel },
                { key: 'sales',     icon: '📊', label: 'Sales',     show: isAdmin,                         setter: () => { closeAllPanels(); setShowSalesPanel(true);        setShowManageMenu(false) }, active: showSalesPanel, badge: pendingSales },
                { key: 'agents',    icon: '🪪', label: 'Agents',    show: isAdmin,                         setter: () => { closeAllPanels(); setShowVerificationsPanel(true); setShowManageMenu(false) }, active: showVerificationsPanel, badge: pendingVerifications },
                { key: 'access',    icon: '🔐', label: 'Access',    show: isAdmin,                         setter: () => { closeAllPanels(); setShowEmailPanel(true);        setShowManageMenu(false) }, active: showEmailPanel },
              ].filter(item => item.show).map(item => (
                <button key={item.key} onClick={item.setter}
                  className={`relative flex flex-col items-center gap-1 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors ${item.active ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'}`}>
                  <span className="text-base leading-none">{item.icon}</span>
                  <span className="leading-none text-[10px]">{item.label}</span>
                  {(item.badge ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}


      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Management panels — admin always; agents gated by role */}
        {isAdmin && showItemsPanel && (
          <ItemsPanel items={items} onEdit={(item) => setModal({ type: 'edit-item', item })} onDone={() => router.refresh()} />
        )}
        {(isAdmin || hasRole('drop-ship')) && showDropShipPanel && (
          <DropShipPanel items={dropShipItems} counties={counties} onDone={() => router.refresh()} />
        )}
        {(isAdmin || hasRole('challenge')) && showChallengePanel && (
          <ChallengePanel challenges={challenges} onDone={() => router.refresh()} />
        )}
        {(isAdmin || hasRole('needs')) && showNeedPanel && (
          <NeedRequestsPanel requests={needRequests} onDone={() => router.refresh()} />
        )}
        {(isAdmin || hasRole('fares')) && showRoutesPanel && (
          <RoutesPanel routes={routes} counties={counties} onDone={() => router.refresh()} />
        )}
        {(isAdmin || hasRole('news')) && showNewsPanel && (
          <NewsPanel news={news} counties={counties} onDone={() => router.refresh()} />
        )}
        {isAdmin && showSalesPanel && (
          <DropShipSalesAdminPanel sales={dropShipSales} dropShipItems={dropShipItems} onDone={() => router.refresh()} />
        )}
        {isAdmin && showVerificationsPanel && (
          <AgentVerificationsPanel verifications={agentVerifications} onDone={() => router.refresh()} />
        )}
        {isAdmin && showEmailPanel && (
          <EmailAccessPanel emails={allowedEmails} counties={counties} onDone={() => router.refresh()} />
        )}

        {/* Non-admin: no roles message */}
        {!isAdmin && userRoles.length === 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center space-y-2">
            <div className="text-3xl">🔒</div>
            <p className="text-sm font-bold text-amber-700">No roles assigned yet</p>
            <p className="text-xs text-amber-600">Contact your admin to be assigned roles (market, fares, needs, etc.) before you can manage anything here.</p>
          </div>
        )}

        {/* Non-admin: agent verification button — hidden if already verified */}
        {!isAdmin && userProfile?.verificationStatus !== 'VERIFIED' && (
          <div className="flex flex-col items-end gap-2">
            {profileWarning && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Please fill your <strong>full name</strong>, <strong>phone</strong> and <strong>M-Pesa number</strong> in your profile before submitting agent verification.
              </p>
            )}
            <button
              onClick={() => {
                const complete = !!(userProfile?.fullName && userProfile?.tel && userProfile?.mpesaNumber)
                if (!complete) { setProfileWarning(true); setShowProfilePanel(true); return }
                setProfileWarning(false)
                setShowVerificationModal(true)
              }}
              className="flex items-center gap-2 rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-bold text-white shadow hover:from-indigo-500 hover:to-violet-500 transition-all"
            >
              🪪 Agent Verification
            </button>
          </div>
        )}
        {showVerificationModal && <AgentVerificationModal onClose={() => { setShowVerificationModal(false); router.refresh() }} />}

        {/* Market section — visible when market panel is active (controls both admin & agents with market role) */}
        {showMarketPanel && (<>

        {/* Filter + action bar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm px-4 sm:px-5 py-3 sm:py-4">
          {isAdmin ? (
            <>
              {countries.length > 0 && (
                <select
                  value={selectedCountryId}
                  onChange={(e) => {
                    setSelectedCountryId(e.target.value)
                    setSelectedCountyId('')
                    setSelectedMarketId('')
                  }}
                  className={selectClass}
                >
                  <option value="">All Countries</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <select
                value={selectedCountyId}
                onChange={(e) => { setSelectedCountyId(e.target.value); setSelectedMarketId('') }}
                className={selectClass}
              >
                {filteredCounties.length === 0
                  ? <option value="">No counties</option>
                  : filteredCounties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
                }
              </select>
            </>
          ) : agentCounties.length > 1 ? (
            <select
              value={selectedCountyId}
              onChange={(e) => { setSelectedCountyId(e.target.value); setSelectedMarketId('') }}
              className={selectClass}
            >
              {agentCounties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl bg-violet-50 border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700">
              <span className="h-2 w-2 rounded-full bg-violet-500" />
              {selectedCounty?.name ?? 'Your County'}
            </span>
          )}

          {/* Market selector */}
          <select
            value={selectedMarketId}
            onChange={(e) => setSelectedMarketId(e.target.value)}
            className={selectClass}
            disabled={marketsInCounty.length === 0}
          >
            <option value="">All Markets</option>
            {marketsInCounty.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {selectedMarketId && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
              {marketsInCounty.find((m) => m.id === selectedMarketId)?.name}
            </span>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            {isAdmin && (
              <>
                <button onClick={() => setModal({ type: 'add-country' })} className={secondaryBtnClass}>
                  <span className="text-violet-500 font-bold">+</span> Country
                </button>
                <button onClick={() => setModal({ type: 'add-county' })} className={secondaryBtnClass}>
                  <span className="text-violet-500 font-bold">+</span> County
                </button>
              </>
            )}
            <button onClick={() => setModal({ type: 'add-market' })} className={secondaryBtnClass}>
              <span className="text-violet-500 font-bold">+</span> Market
            </button>
            {isAdmin && (
              <button onClick={() => setModal({ type: 'add-item' })} className={primaryBtnClass}>
                <span className="font-bold">+</span> Product
              </button>
            )}
          </div>
        </div>

        {/* No markets */}
        {counties.length > 0 && selectedCountyId && marketsInCounty.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white py-12 text-center text-gray-400 text-sm">
            No markets in <strong className="text-gray-600">{selectedCounty?.name}</strong>. Add one with <strong className="text-violet-600">+ Market</strong>.
          </div>
        )}

        {/* No prices */}
        {counties.length > 0 && marketsInCounty.length > 0 && isEmpty && (
          <div className="rounded-3xl border-2 border-dashed border-violet-200 bg-white py-12 text-center">
            <p className="text-gray-500 text-sm">No prices recorded yet. Click <strong className="text-violet-600">+ Price</strong> on a market to add one.</p>
          </div>
        )}

        {/* Market sections — only the selected market (or first) */}
        {visibleMarkets.map((market) => {
          const rows = pricesByMarket(market.id)
          if (rows.length === 0 && !selectedMarketId) return null
          return (
            <CrudMarketSection
              key={market.id}
              market={market}
              rows={rows}
              onAddPrice={() => setModal({ type: 'add-price', marketId: market.id, marketName: market.name })}
              onEdit={(price) => setModal({ type: 'edit-price', price })}
              onDelete={handleDelete}
              deletingId={deletingId}
            />
          )
        })}
        </>)}
      </main>

      <footer className="mt-12 border-t border-gray-200 bg-white py-5 text-center text-xs text-gray-400">
        Developed with ❤ by Kwenik Developers · 0704876954
      </footer>

      {modal && (
        <MarketModal
          mode={modal}
          items={items}
          counties={counties}
          countries={countries}
          userCountyId={userCountyId}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

/* ─── Profile Panel ──────────────────────────────────────────────── */

function ProfilePanel({
  user, profile, isAdmin, countyName, onSaved, onOpenEmailPanel, onOpenItemsPanel,
}: {
  user: User
  profile: UserProfileInfo | null
  isAdmin: boolean
  countyName: string | null
  onClose?: () => void
  onSaved: () => void
  onOpenEmailPanel: () => void
  onOpenItemsPanel: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await upsertUserProfile(formData)
      if (result.success) { setSaved(true); setEditing(false); onSaved() }
      else setError(result.error)
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-5 py-4 flex items-center gap-3">
        {user.image ? (
          <Image src={user.image} alt={user.name} width={44} height={44} className="rounded-full ring-2 ring-white/30 shrink-0" />
        ) : (
          <div className="h-11 w-11 rounded-full bg-white/20 grid place-items-center text-lg font-bold text-white shrink-0">
            {user.name[0]}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-bold text-white truncate">{profile?.fullName || user.name}</p>
          <p className="text-xs text-white/60 truncate">{user.email}</p>
          <span className={`inline-flex items-center mt-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${isAdmin ? 'bg-emerald-400/25 text-emerald-200' : 'bg-violet-400/25 text-violet-200'}`}>
            {isAdmin ? 'Global Admin' : `County: ${countyName ?? '—'}`}
          </span>
        </div>
      </div>

      {/* Info / Edit form */}
      <div className="p-4 space-y-3">
        {!editing ? (
          <>
            <InfoRow label="Full Name" value={profile?.fullName} />
            <InfoRow label="Phone" value={profile?.tel} />
            <InfoRow label="M-Pesa No." value={profile?.mpesaNumber} />
            {saved && <p className="text-xs text-emerald-600 font-semibold">Profile saved ✓</p>}
            <button
              onClick={() => setEditing(true)}
              className="w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
            >
              Edit Profile
            </button>
          </>
        ) : (
          <form onSubmit={handleSave} className="space-y-3">
            <ProfileField label="Full Name" name="fullName" defaultValue={profile?.fullName ?? ''} placeholder="e.g. Jane Mwangi" />
            <ProfileField label="Phone" name="tel" defaultValue={profile?.tel ?? ''} placeholder="e.g. 0712345678" />
            <ProfileField label="M-Pesa No." name="mpesaNumber" defaultValue={profile?.mpesaNumber ?? ''} placeholder="e.g. 0712345678" />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setEditing(false)} className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={isPending} className="flex-1 rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 py-2 text-sm font-bold text-white disabled:opacity-60 transition-all">
                {isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}

        {/* Roles / admin links */}
        {isAdmin && !editing && (
          <div className="border-t border-gray-100 pt-3 space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Manage</p>
            <button
              onClick={onOpenItemsPanel}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
            >
              <span>🌾</span> Commodities
            </button>
            <button
              onClick={onOpenEmailPanel}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
            >
              <span>🔐</span> User Access
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400 text-xs font-medium">{label}</span>
      <span className="text-gray-700 font-medium">{value || <span className="text-gray-300">—</span>}</span>
    </div>
  )
}

function ProfileField({ label, name, defaultValue, placeholder }: {
  label: string; name: string; defaultValue: string; placeholder: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all"
      />
    </div>
  )
}

/* ─── Items Panel ────────────────────────────────────────────────── */

const PAGE_SIZE = 10

function ItemsPanel({
  items, onEdit, onDone,
}: { items: ItemInfo[]; onEdit: (item: ItemInfo) => void; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pageCount, setPageCount] = useState(1)

  const handleDelete = (id: string) => {
    if (!confirm('Delete this commodity? This will fail if prices are still attached.')) return
    setDeletingId(id)
    setError(null)
    startTransition(async () => {
      const result = await deleteItem(id)
      setDeletingId(null)
      if (result.success) onDone()
      else setError(result.error)
    })
  }

  const q = search.trim().toLowerCase()
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.unitMeasure.toLowerCase().includes(q)) : items
  const visible = filtered.slice(0, pageCount * PAGE_SIZE)
  const hasMore = visible.length < filtered.length

  return (
    <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-5 py-3.5 flex items-center gap-2">
        <span className="text-base">🌾</span>
        <h2 className="text-sm font-bold text-white">Manage Products</h2>
        <span className="ml-auto text-xs text-white/50">{filtered.length}/{items.length}</span>
      </div>
      <div className="p-4 space-y-3">
        <input
          type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPageCount(1) }}
          placeholder="Search products…"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No products match your search.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5 text-left">Name</th>
                    <th className="px-4 py-2.5 text-left">Unit</th>
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-right w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${itemBadgeColor(item.name)}`}>
                          {item.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{item.unitMeasure}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold ${item.type === 'labour' ? 'text-amber-600' : 'text-gray-400'}`}>
                          {item.type === 'labour' ? '🔧 Labour' : '📦 Commodity'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => onEdit(item)} className="rounded px-2 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-50">Edit</button>
                        <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id || isPending}
                          className="rounded px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-40 ml-1">
                          {deletingId === item.id ? '…' : 'Del'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <button onClick={() => setPageCount((p) => p + 1)}
                className="w-full rounded-xl border border-gray-200 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                Show more ({filtered.length - visible.length} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Agent Role Editor ──────────────────────────────────────────── */

const ROLE_OPTIONS = [
  { value: 'market', label: '🏪 Market' },
  { value: 'needs', label: '📋 Needs' },
  { value: 'fares', label: '🚌 Fares' },
  { value: 'drop-ship', label: '📦 Drop Ship' },
  { value: 'challenge', label: '🏆 Challenge' },
  { value: 'news', label: '📰 News' },
]

function AgentRoleEditor({ emailEntry, counties, onDone }: {
  emailEntry: AllowedEmailInfo
  counties: CountyInfo[]
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [selectedRoles, setSelectedRoles] = useState<string[]>(emailEntry.roles)
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(emailEntry.marketIds)
  const [expandedCounty, setExpandedCounty] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const toggleRole = (v: string) =>
    setSelectedRoles(prev => prev.includes(v) ? prev.filter(r => r !== v) : [...prev, v])
  const toggleMarket = (id: string) =>
    setSelectedMarkets(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  const toggleCountyAll = (markets: MarketInfo[]) => {
    const ids = markets.map(m => m.id)
    const allOn = ids.every(id => selectedMarkets.includes(id))
    setSelectedMarkets(prev => allOn ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])])
  }

  const handleSave = () => {
    setError(null); setSaved(false)
    startTransition(async () => {
      const r = await updateAgentRoles(emailEntry.id, selectedRoles, selectedMarkets)
      if (r.success) { setSaved(true); setOpen(false); onDone() }
      else setError(r.error)
    })
  }

  return (
    <div className="w-full mt-1">
      <div className="flex flex-wrap items-center gap-1">
        {emailEntry.roles.length > 0
          ? emailEntry.roles.map(r => (
            <span key={r} className="inline-flex items-center rounded-full bg-violet-100 border border-violet-200 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
              {ROLE_OPTIONS.find(o => o.value === r)?.label ?? r}
            </span>
          ))
          : <span className="text-[10px] text-gray-400 italic">No roles assigned</span>
        }
        {emailEntry.marketIds.length > 0 && (
          <span className="text-[10px] text-gray-500 ml-1">
            · {emailEntry.marketIds.length} market{emailEntry.marketIds.length !== 1 ? 's' : ''}
          </span>
        )}
        <button onClick={() => setOpen(v => !v)}
          className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-500 hover:border-violet-300 hover:text-violet-700 transition-colors ml-1">
          {open ? 'Close' : 'Assign Roles'}
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Roles</p>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={selectedRoles.includes(opt.value)} onChange={() => toggleRole(opt.value)} className="accent-violet-600 rounded" />
                  <span className="text-xs text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">
              Allowed Markets <span className="font-normal text-gray-400">({selectedMarkets.length} selected)</span>
            </p>
            <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
              {counties.filter(c => c.markets.length > 0).map(county => {
                const mids = county.markets.map(m => m.id)
                const selCount = mids.filter(id => selectedMarkets.includes(id)).length
                const isExpanded = expandedCounty === county.id
                return (
                  <div key={county.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                    <button type="button"
                      onClick={() => setExpandedCounty(prev => prev === county.id ? null : county.id)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-gray-50">
                      <span className="text-xs font-semibold text-gray-700">{county.name}</span>
                      <span className="text-[10px] text-gray-400">
                        {selCount > 0 ? `${selCount}/${county.markets.length}` : county.markets.length} {isExpanded ? '▴' : '▾'}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-2 pt-1 border-t border-gray-100 space-y-1">
                        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-gray-400 mb-1">
                          <input type="checkbox"
                            checked={mids.every(id => selectedMarkets.includes(id))}
                            onChange={() => toggleCountyAll(county.markets)}
                            className="accent-violet-600 rounded" />
                          Select all in {county.name}
                        </label>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                          {county.markets.map(m => (
                            <label key={m.id} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={selectedMarkets.includes(m.id)} onChange={() => toggleMarket(m.id)} className="accent-violet-600 rounded" />
                              <span className="text-[11px] text-gray-700 truncate">{m.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {saved && <p className="text-xs text-emerald-600 font-semibold">Saved ✓</p>}
          <button onClick={handleSave} disabled={isPending}
            className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60 transition-all">
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Email Access Panel ─────────────────────────────────────────── */

function EmailAccessPanel({
  emails, counties, onDone,
}: { emails: AllowedEmailInfo[]; counties: CountyInfo[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const handleAdd = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    ;(e.currentTarget as HTMLFormElement).reset()
    startTransition(async () => {
      const result = await addAllowedEmail(formData)
      if (result.success) onDone()
      else setError(result.error)
    })
  }

  const handleRemove = (id: string) => {
    setRemovingId(id)
    startTransition(async () => {
      await removeAllowedEmail(id)
      setRemovingId(null)
      onDone()
    })
  }

  const handleAssign = (id: string, countyId: string | null) => {
    setAssigningId(id)
    startTransition(async () => {
      await assignEmailToCounty(id, countyId)
      setAssigningId(null)
      onDone()
    })
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-5 py-3.5 flex items-center gap-2">
        <span className="text-base">🔐</span>
        <h2 className="text-sm font-bold text-white">Allowed Login Emails</h2>
        {emails.length === 0 && (
          <span className="ml-2 rounded-full bg-amber-400/30 border border-amber-300/40 px-2 py-0.5 text-xs text-amber-200 font-semibold">Open access</span>
        )}
      </div>
      <div className="p-5 space-y-4">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input type="email" name="email" required placeholder="user@example.com"
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all" />
          <button type="submit" disabled={isPending}
            className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-bold text-white hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 transition-all">
            Add
          </button>
        </form>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {emails.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">No emails added — everyone can sign in.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {emails.map((e) => (
              <li key={e.id} className="py-2.5 space-y-1">
                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                  <span className="text-sm text-gray-700 font-mono flex-1 min-w-0 truncate">{e.email}</span>
                  <select
                    value={e.countyId ?? ''}
                    onChange={(ev) => handleAssign(e.id, ev.target.value || null)}
                    disabled={assigningId === e.id || isPending}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:border-violet-400 focus:outline-none disabled:opacity-50 max-w-36"
                  >
                    <option value="">Global admin</option>
                    {counties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button
                    onClick={() => handleRemove(e.id)}
                    disabled={removingId === e.id || isPending}
                    className="rounded-lg px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors shrink-0"
                  >
                    {removingId === e.id ? '…' : 'Remove'}
                  </button>
                </div>
                {e.countyId !== null && (
                  <AgentRoleEditor
                    key={`${e.id}|${e.roles.join(',')}|${e.marketIds.join(',')}`}
                    emailEntry={e} counties={counties} onDone={onDone}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ─── Drop Ship Panel ────────────────────────────────────────────── */

function TargetPicker({ counties, defaultTarget = 'NATIONAL', defaultCountyIds = [] }: {
  counties: CountyInfo[]
  defaultTarget?: 'NATIONAL' | 'REGIONAL'
  defaultCountyIds?: string[]
}) {
  const [target, setTarget] = useState<'NATIONAL' | 'REGIONAL'>(defaultTarget)
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-gray-500">Target <span className="text-red-400">*</span></label>
      <div className="flex gap-4">
        {(['NATIONAL', 'REGIONAL'] as const).map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="radio"
              name="target"
              value={opt}
              checked={target === opt}
              onChange={() => setTarget(opt)}
              className="accent-violet-600"
            />
            <span className="text-sm font-medium text-gray-700">
              {opt === 'NATIONAL' ? 'National (all counties)' : 'Regional (specific counties)'}
            </span>
          </label>
        ))}
      </div>
      {target === 'REGIONAL' && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 mt-1">
          <p className="text-xs font-semibold text-gray-500 mb-2">Select counties <span className="text-red-400">*</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
            {counties.map((c) => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="targetCountyIds"
                  value={c.id}
                  defaultChecked={defaultCountyIds.includes(c.id)}
                  className="accent-violet-600 rounded"
                />
                <span className="text-xs text-gray-700 truncate">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DropShipForm({
  counties, item, isPending, error, onSubmit, onCancel, isAdd,
}: {
  counties: CountyInfo[]
  item?: DropShipItemInfo
  isPending: boolean
  error: string | null
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCancel: () => void
  isAdd: boolean
}) {
  const todayISO = new Date().toISOString().split('T')[0]
  const itemDateISO = item ? item.date.split('T')[0] : todayISO

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
      {!isAdd && <input type="hidden" name="id" value={item?.id} />}
      <p className="text-xs font-bold text-violet-700 uppercase tracking-wider">
        {isAdd ? 'New Drop Ship Item' : 'Edit Drop Ship Item'}
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Organization Name <span className="text-red-400">*</span></label>
          <input type="text" name="orgName" required defaultValue={item?.orgName ?? ''} placeholder="e.g. Nairobi Medical Ltd" className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Phone / Tel <span className="text-red-400">*</span></label>
          <input type="tel" name="tel" required defaultValue={item?.tel ?? ''} placeholder="e.g. 0712345678" className={fieldClass} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Location <span className="text-red-400">*</span></label>
          <input type="text" name="location" required defaultValue={item?.location ?? ''} placeholder="e.g. Nairobi, Kenya" className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Date <span className="text-red-400">*</span></label>
          <input type="date" name="date" required defaultValue={itemDateISO} className={fieldClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">Description <span className="text-red-400">*</span></label>
        <input type="text" name="description" required defaultValue={item?.description ?? ''} placeholder="e.g. Medical supplies" className={fieldClass} />
      </div>

      <TargetPicker
        counties={counties}
        defaultTarget={item?.target ?? 'NATIONAL'}
        defaultCountyIds={item?.targetCountyIds ?? []}
      />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">
          {isAdd ? <>File (Excel, Word, or PDF) <span className="text-red-400">*</span></> : <>Replace file <span className="text-gray-400 font-normal">(optional — keep current: {item?.fileName})</span></>}
        </label>
        <input
          type="file"
          name="file"
          required={isAdd}
          accept=".xlsx,.xls,.doc,.docx,.pdf"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-violet-700 hover:file:bg-violet-200 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={isPending}
          className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-bold text-white hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 transition-all">
          {isPending ? 'Saving…' : isAdd ? 'Save item' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

function DropShipPanel({ items, counties, onDone }: { items: DropShipItemInfo[]; counties: CountyInfo[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<DropShipItemInfo | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  function fileExt(name: string) { return (name.split('.').pop() ?? 'file').toUpperCase() }

  function resolveTarget(item: DropShipItemInfo) {
    if (item.target === 'NATIONAL') return <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">National</span>
    const names = item.targetCountyIds.map((id) => counties.find((c) => c.id === id)?.name).filter(Boolean)
    return <span className="text-xs text-gray-600">{names.length ? names.join(', ') : '—'}</span>
  }

  const handleAdd = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createDropShipItem(formData)
      if (result.success) { setShowAddForm(false); onDone() }
      else setError(result.error)
    })
  }

  const handleEdit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateDropShipItem(formData)
      if (result.success) { setEditingItem(null); onDone() }
      else setError(result.error)
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this drop ship item?')) return
    setDeletingId(id)
    startTransition(async () => {
      await deleteDropShipItem(id)
      setDeletingId(null)
      onDone()
    })
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-5 py-3.5 flex items-center gap-2">
        <span className="text-base">📦</span>
        <h2 className="text-sm font-bold text-white">Manage Drop Ship</h2>
        <span className="ml-2 text-xs text-white/50">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        {!editingItem && (
          <button
            onClick={() => { setShowAddForm((v) => !v); setError(null) }}
            className="ml-auto flex items-center gap-1 rounded-lg bg-white/20 border border-white/30 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/30 transition-colors"
          >
            {showAddForm ? 'Cancel' : '+ Add item'}
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        {showAddForm && !editingItem && (
          <DropShipForm
            counties={counties} isAdd isPending={isPending} error={error}
            onSubmit={handleAdd} onCancel={() => { setShowAddForm(false); setError(null) }}
          />
        )}

        {!showAddForm && error && <p className="text-sm text-red-500">{error}</p>}

        {items.length === 0 && !showAddForm ? (
          <p className="text-sm text-gray-400 text-center py-4">No drop ship items yet. Click <strong className="text-violet-600">+ Add item</strong> to create one.</p>
        ) : items.length > 0 && (
          <>
            <div className="hidden sm:grid grid-cols-[2rem_1fr_1fr_1fr_6rem_5rem_5rem_5rem_5rem] gap-2 bg-gray-50 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-500 border border-gray-200">
              <span>#</span>
              <span>Organization</span>
              <span>Description</span>
              <span>Target</span>
              <span>Tel</span>
              <span className="text-center">Location</span>
              <span className="text-center">Date</span>
              <span className="text-center">File</span>
              <span />
            </div>

            <ul className="divide-y divide-gray-100">
              {items.map((item, i) => (
                <li key={item.id}>
                  {editingItem?.id === item.id ? (
                    <div className="my-2">
                      <DropShipForm
                        counties={counties} item={item} isAdd={false}
                        isPending={isPending} error={error}
                        onSubmit={handleEdit}
                        onCancel={() => { setEditingItem(null); setError(null) }}
                      />
                    </div>
                  ) : (
                    <div className="py-3">
                      {/* Desktop */}
                      <div className="hidden sm:grid grid-cols-[2rem_1fr_1fr_1fr_6rem_5rem_5rem_5rem_5rem] gap-2 items-center">
                        <span className="text-xs text-gray-400 font-mono">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{item.orgName}</p>
                          <p className="text-xs text-gray-400 truncate">{item.location}</p>
                        </div>
                        <span className="text-sm text-gray-600 truncate">{item.description}</span>
                        <div>{resolveTarget(item)}</div>
                        <span className="text-xs text-gray-600 font-mono truncate">{item.tel}</span>
                        <span className="text-xs text-gray-500 text-center truncate">{item.location}</span>
                        <span className="text-xs text-gray-500 text-center">{fmtDate(item.date)}</span>
                        <div className="flex justify-center">
                          <a href={`/api/dropship/${item.id}`} download={item.fileName}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                            </svg>
                            {fileExt(item.fileName)}
                          </a>
                        </div>
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => { setEditingItem(item); setShowAddForm(false); setError(null) }} className="rounded-lg px-2 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-50">Edit</button>
                          <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id || isPending}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-40">
                            {deletingId === item.id ? '…' : 'Del'}
                          </button>
                        </div>
                      </div>
                      {/* Mobile */}
                      <div className="sm:hidden flex items-start gap-3">
                        <span className="text-xs text-gray-400 font-mono pt-0.5 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-gray-800">{item.orgName}</p>
                          <p className="text-xs text-gray-600">{item.description}</p>
                          <div className="flex flex-wrap gap-2 items-center">
                            {resolveTarget(item)}
                            <span className="text-xs text-gray-400">{item.tel}</span>
                            <span className="text-xs text-gray-400">{fmtDate(item.date)}</span>
                            <span className="text-xs text-gray-400">{fmtTime(item.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0 items-end">
                          <a href={`/api/dropship/${item.id}`} download={item.fileName}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                            {fileExt(item.fileName)}
                          </a>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingItem(item); setShowAddForm(false); setError(null) }} className="rounded px-2 py-0.5 text-xs font-semibold text-violet-600 hover:bg-violet-50">Edit</button>
                            <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id || isPending}
                              className="rounded px-2 py-0.5 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-40">
                              {deletingId === item.id ? '…' : 'Del'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Challenge Panel ────────────────────────────────────────────── */

const PLATFORM_LABELS: Record<string, string> = { ig: 'Instagram', x: 'X / Twitter', tiktok: 'TikTok', fb: 'Facebook' }
const PLATFORMS_LIST = [
  { id: 'ig', label: 'Instagram' },
  { id: 'x', label: 'X / Twitter' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'fb', label: 'Facebook' },
]

function mpesaCharge(amount: number): number {
    if (amount <= 49) return 0
  if (amount <= 100) return 0
  if (amount <= 500) return 7
  if (amount <= 1000) return 13
  if (amount <= 1500) return 23
  if (amount <= 2500) return 33
  if (amount <= 3500) return 53
  if (amount <= 5000) return 57
  if (amount <= 7500) return 78
  if (amount <= 10000) return 90
   if (amount <= 15000) return 100
  if (amount <= 20000) return 105
  if (amount <= 35000) return 108
  if (amount <= 50000) return 108
  if (amount <= 250000) return 108
  return 300
}
function orgCost(amount: number) { const w = Math.ceil(amount * 1.15); return w + mpesaCharge(w) }
function totalCost(ranges: RangeEntry[]) { return ranges.reduce((s, r) => s + orgCost(r.amount) * r.count, 0) }

type DraftRange = { count: string; amount: string }

type PlatformDraft = { targetCount: string; ranges: DraftRange[] }

function initDrafts(platformConfigs: PlatformConfig[]): Record<string, PlatformDraft> {
  return Object.fromEntries(platformConfigs.map((pc) => [
    pc.platform,
    { targetCount: String(pc.targetCount), ranges: pc.ranges.map((r) => ({ count: String(r.count), amount: String(r.amount) })) },
  ]))
}

function PlatformDraftEditor({ platform, draft, onChange }: { platform: string; draft: PlatformDraft; onChange: (d: PlatformDraft) => void }) {
  const tc = parseInt(draft.targetCount) || 0
  const rangeSum = draft.ranges.reduce((s, r) => s + (parseInt(r.count) || 0), 0)
  return (
    <div className="rounded-xl border border-violet-200 bg-white p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-violet-600 text-white px-2.5 py-0.5 text-xs font-bold">{PLATFORM_LABELS[platform] ?? platform}</span>
        {tc > 0 && <span className={`text-xs font-semibold ${rangeSum === tc ? 'text-emerald-600' : 'text-red-500'}`}>
          {rangeSum === tc ? `✓ covers ${tc}` : `ranges cover ${rangeSum}/${tc}`}
        </span>}
      </div>
      <div className="flex gap-2 items-center">
        <label className="text-xs text-gray-500 whitespace-nowrap">Target:</label>
        <input type="number" min={1} placeholder="e.g. 400" value={draft.targetCount}
          onChange={(e) => onChange({ ...draft, targetCount: e.target.value })}
          className={`flex-1 ${fieldClass}`} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 font-semibold">Prize ranges</span>
          <button type="button" onClick={() => onChange({ ...draft, ranges: [...draft.ranges, { count: '', amount: '' }] })}
            className="text-xs text-violet-600 font-semibold hover:text-violet-800">+ Add</button>
        </div>
        {draft.ranges.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
              <span className="text-xs text-gray-400">Top</span>
              <input type="number" min={1} placeholder="100" value={r.count}
                onChange={(e) => onChange({ ...draft, ranges: draft.ranges.map((x, j) => j === i ? { ...x, count: e.target.value } : x) })}
                className="w-14 text-sm font-semibold outline-none bg-transparent text-gray-800" />
              <span className="text-xs text-gray-400">→ KSh</span>
              <input type="number" min={1} placeholder="500" value={r.amount}
                onChange={(e) => onChange({ ...draft, ranges: draft.ranges.map((x, j) => j === i ? { ...x, amount: e.target.value } : x) })}
                className="flex-1 text-sm font-semibold outline-none bg-transparent text-gray-800" />
            </div>
            {draft.ranges.length > 1 && (
              <button type="button" onClick={() => onChange({ ...draft, ranges: draft.ranges.filter((_, j) => j !== i) })}
                className="text-red-400 hover:text-red-600 text-lg">×</button>
            )}
          </div>
        ))}
        {(() => {
          const grand = draft.ranges.reduce((s, r) => {
            const c = parseInt(r.count) || 0; const a = parseInt(r.amount) || 0
            return c > 0 && a > 0 ? s + orgCost(a) * c : s
          }, 0)
          if (!grand) return null
          return <div className="text-xs font-bold text-indigo-700 text-right">Cost: KSh {grand.toLocaleString()}</div>
        })()}
      </div>
    </div>
  )
}

function ChallengeForm({
  challenge, isPending, error, onSubmit, onCancel, isAdd,
}: {
  challenge?: ChallengeInfo
  isPending: boolean
  error: string | null
  onSubmit: (fd: FormData) => void
  onCancel: () => void
  isAdd: boolean
}) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(challenge?.platforms ?? [])
  const [platformDrafts, setPlatformDrafts] = useState<Record<string, PlatformDraft>>(
    challenge ? initDrafts(challenge.platformConfigs) : {}
  )

  const togglePlatform = (id: string) => {
    if (selectedPlatforms.includes(id)) {
      setSelectedPlatforms((prev) => prev.filter((p) => p !== id))
      setPlatformDrafts((prev) => { const next = { ...prev }; delete next[id]; return next })
    } else {
      setSelectedPlatforms((prev) => [...prev, id])
      setPlatformDrafts((prev) => ({ ...prev, [id]: { targetCount: '', ranges: [{ count: '', amount: '' }] } }))
    }
  }

  const toLocalDT = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    selectedPlatforms.forEach((p) => {
      formData.append('platforms', p)
      const draft = platformDrafts[p]; if (!draft) return
      formData.set(`pc_${p}_targetCount`, draft.targetCount)
      draft.ranges.forEach((r) => { formData.append(`pc_${p}_rangeCount`, r.count); formData.append(`pc_${p}_rangeAmount`, r.amount) })
    })
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
      {!isAdd && <input type="hidden" name="id" value={challenge?.id} />}
      <p className="text-xs font-bold text-violet-700 uppercase tracking-wider">{isAdd ? 'New Challenge' : 'Edit Challenge'}</p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Organization <span className="text-red-400">*</span></label>
          <input type="text" name="orgName" required defaultValue={challenge?.orgName ?? ''} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Phone / Tel <span className="text-red-400">*</span></label>
          <input type="tel" name="tel" required defaultValue={challenge?.tel ?? ''} placeholder="07XXXXXXXX" maxLength={10} className={fieldClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">Challenge Description <span className="text-red-400">*</span></label>
        <input type="text" name="description" required defaultValue={challenge?.description ?? ''} className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">Repost URL <span className="text-red-400">*</span></label>
        <input type="url" name="repostUrl" required defaultValue={challenge?.repostUrl ?? ''} className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">Platforms <span className="text-red-400">*</span></label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS_LIST.map((p) => (
            <button key={p.id} type="button" onClick={() => togglePlatform(p.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${selectedPlatforms.includes(p.id) ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-violet-300'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {selectedPlatforms.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500">Per-platform targets &amp; ranges <span className="text-red-400">*</span></p>
          {selectedPlatforms.map((p) => (
            <PlatformDraftEditor key={p} platform={p}
              draft={platformDrafts[p] ?? { targetCount: '', ranges: [{ count: '', amount: '' }] }}
              onChange={(d) => setPlatformDrafts((prev) => ({ ...prev, [p]: d }))} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">M-Pesa No. (tracking(payments)) <span className="text-red-400">*</span></label>
        <input type="tel" name="mpesaNo" required defaultValue={challenge?.mpesaNo ?? ''} placeholder="07XXXXXXXX" maxLength={10} className={fieldClass} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Submission Deadline <span className="text-red-400">*</span></label>
          <input type="datetime-local" name="closingTime" required defaultValue={challenge ? toLocalDT(challenge.closingTime) : ''} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Results &amp; Payment By <span className="text-red-400">*</span></label>
          <input type="datetime-local" name="paymentTime" required defaultValue={challenge ? toLocalDT(challenge.paymentTime) : ''} className={fieldClass} />
        </div>
      </div>

      {!isAdd && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-500">Published</label>
          <input type="hidden" name="published" value="0" />
          <input type="checkbox" name="published" value="1" defaultChecked={challenge?.published}
            className="h-4 w-4 accent-violet-600 rounded" />
          <span className="text-xs text-gray-500">(visible to public)</span>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={isPending}
          className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60 transition-all">
          {isPending ? 'Saving…' : isAdd ? 'Create' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

function SubmissionsList({ challengeId, onDone }: { challengeId: string; onDone: () => void }) {
  const [submissions, setSubmissions] = useState<SubmissionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSubmissions(challengeId).then((rows) => { setSubmissions(rows); setLoading(false) })
  }, [challengeId])

  function fmtDT(iso: string) {
    return new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }

  const handleApprove = (id: string) => {
    setError(null)
    startTransition(async () => {
      const r = await approveSubmission(id)
      if (r.success) {
        setSubmissions((prev) => prev.map((s) => s.id === id ? { ...s, status: 'APPROVED', rejectReason: null } : s))
        onDone()
      } else setError(r.error)
    })
  }

  const handleReject = (id: string) => {
    if (!rejectReason.trim()) return
    setError(null)
    startTransition(async () => {
      const r = await rejectSubmission(id, rejectReason)
      if (r.success) {
        setSubmissions((prev) => prev.map((s) => s.id === id ? { ...s, status: 'REJECTED', rejectReason } : s))
        setRejectId(null); setRejectReason('')
        onDone()
      } else setError(r.error)
    })
  }

  const statusCfg = {
    PENDING:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-700' },
    APPROVED: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700' },
    REJECTED: { label: 'Rejected', cls: 'bg-red-100 text-red-600' },
  }

  if (loading) return <p className="text-xs text-gray-400 py-3 px-4">Loading submissions…</p>
  if (submissions.length === 0) return <p className="text-xs text-gray-400 py-3 px-4 text-center">No submissions yet.</p>

  return (
    <div className="border-t border-gray-100 bg-gray-50">
      {error && <p className="text-xs text-red-500 px-4 py-2">{error}</p>}
      <div className="divide-y divide-gray-200">
        {submissions.map((s, i) => {
          const cfg = statusCfg[s.status]
          return (
            <div key={s.id} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 font-mono w-5">{i + 1}</span>
                <span className="font-mono text-sm font-semibold text-gray-800">{s.mpesaNo}</span>
                <span className="inline-flex rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {PLATFORM_LABELS[s.platform] ?? s.platform}
                </span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${cfg.cls}`}>{cfg.label}</span>
                <span className="text-xs text-gray-400 ml-auto">{fmtDT(s.createdAt)}</span>
              </div>
              <a href={s.submitUrl} target="_blank" rel="noopener noreferrer"
                className="block text-xs text-indigo-600 underline truncate pl-7 hover:text-indigo-800">
                {s.submitUrl}
              </a>
              {s.status === 'REJECTED' && s.rejectReason && (
                <p className="text-xs text-red-500 pl-7">Reason: {s.rejectReason}</p>
              )}
              {s.status === 'PENDING' && (
                <div className="flex gap-2 pl-7">
                  <button onClick={() => handleApprove(s.id)} disabled={isPending}
                    className="rounded-lg px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40 transition-colors">
                    Approve
                  </button>
                  {rejectId === s.id ? (
                    <div className="flex gap-1.5 flex-1">
                      <input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason…" className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-violet-400" />
                      <button onClick={() => handleReject(s.id)} disabled={isPending || !rejectReason.trim()}
                        className="rounded-lg px-3 py-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-40 transition-colors">
                        Send
                      </button>
                      <button onClick={() => { setRejectId(null); setRejectReason('') }}
                        className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 transition-colors">×</button>
                    </div>
                  ) : (
                    <button onClick={() => setRejectId(s.id)}
                      className="rounded-lg px-3 py-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
                      Reject
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChallengePayments({ payments }: { payments: PaymentRecord[] }) {
  const fmtDT = (iso: string) =>
    new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  const totalPaid = payments.filter(p => p.status === 'success').reduce((s, p) => s + (p.amount ?? 0), 0)
  const totalAll  = payments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const sc = (s: string) => s === 'success' ? 'bg-emerald-100 text-emerald-700' : s === 'cancelled' ? 'bg-amber-100 text-amber-700' : s === 'pending' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'

  if (payments.length === 0) return (
    <p className="text-xs text-gray-400 text-center py-6">No payments recorded yet for this challenge.</p>
  )

  return (
    <div className="p-3 space-y-3">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-center">
          <p className="text-sm font-black text-emerald-700">KSh {totalPaid.toLocaleString()}</p>
          <p className="text-[10px] text-emerald-600">Confirmed</p>
        </div>
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-center">
          <p className="text-sm font-black text-gray-700">KSh {totalAll.toLocaleString()}</p>
          <p className="text-[10px] text-gray-400">All attempts</p>
        </div>
        <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-center">
          <p className="text-sm font-black text-violet-700">{payments.length}</p>
          <p className="text-[10px] text-violet-500">Transactions</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500">Payer Phone</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-500">Amount (KSh)</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500">M-Pesa Ref</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${sc(p.status)}`}>{p.status}</span>
                </td>
                <td className="px-3 py-2 font-mono text-gray-700">{p.phone ?? '—'}</td>
                <td className="px-3 py-2 text-right font-semibold text-gray-800">{p.amount != null ? p.amount.toLocaleString() : '—'}</td>
                <td className="px-3 py-2 font-mono text-gray-500 text-[10px]">{p.mpesaRef || '—'}</td>
                <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDT(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ChallengePanel({ challenges, onDone }: { challenges: ChallengeInfo[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<ChallengeInfo | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<Record<string, 'info' | 'entries' | 'payments'>>({})
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [extendingId, setExtendingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const handleFormSubmit = (fd: FormData, isAdd: boolean) => {
    setError(null)
    startTransition(async () => {
      const result = isAdd ? await createChallenge(fd) : await updateChallenge(fd)
      if (result.success) { setShowAddForm(false); setEditingItem(null); onDone() }
      else setError(result.error)
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this challenge and all its submissions?')) return
    setDeletingId(id)
    startTransition(async () => { await deleteChallenge(id); setDeletingId(null); onDone() })
  }

  const handleExtend = (e: React.SyntheticEvent<HTMLFormElement>, id: string) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const closingTime = String(fd.get('closingTime') ?? '')
    const paymentTime = String(fd.get('paymentTime') ?? '')
    setError(null)
    startTransition(async () => {
      const r = await extendChallenge(id, closingTime, paymentTime)
      if (r.success) { setExtendingId(null); onDone() }
      else setError(r.error)
    })
  }

  const handleTogglePublish = (id: string, current: boolean) => {
    setTogglingId(id)
    startTransition(async () => { await toggleChallengePublished(id, !current); setTogglingId(null); onDone() })
  }

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
    setDetailTab(prev => ({ ...prev, [id]: prev[id] ?? 'info' }))
  }

  const totalCollected = challenges.reduce((s, ch) =>
    s + ch.payments.filter(p => p.status === 'success').reduce((ps, p) => ps + (p.amount ?? 0), 0), 0)
  const totalSubmissions = challenges.reduce((s, ch) => s + ch.submissionCount, 0)

  const q = search.trim().toLowerCase()
  const filtered = q
    ? challenges.filter(ch =>
        ch.description.toLowerCase().includes(q) ||
        ch.orgName.toLowerCase().includes(q) ||
        ch.tel.includes(q))
    : challenges

  return (
    <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-5 py-3.5 flex items-center gap-2 flex-wrap">
        <span className="text-base">🏆</span>
        <h2 className="text-sm font-bold text-white">Challenges</h2>
        {!editingItem && (
          <button onClick={() => { setShowAddForm(v => !v); setError(null) }}
            className="ml-auto flex items-center gap-1 rounded-lg bg-white/20 border border-white/30 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/30 transition-colors">
            {showAddForm ? 'Cancel' : '+ New'}
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-4 py-2.5 text-center">
          <p className="text-lg font-black text-indigo-700">{challenges.length}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Challenges</p>
        </div>
        <div className="px-4 py-2.5 text-center">
          <p className="text-lg font-black text-emerald-700">KSh {totalCollected.toLocaleString()}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Collected</p>
        </div>
        <div className="px-4 py-2.5 text-center">
          <p className="text-lg font-black text-violet-700">{totalSubmissions}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Submissions</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {showAddForm && !editingItem && (
          <ChallengeForm isAdd isPending={isPending} error={error}
            onSubmit={(fd) => handleFormSubmit(fd, true)}
            onCancel={() => { setShowAddForm(false); setError(null) }} />
        )}
        {!showAddForm && error && <p className="text-xs text-red-500">{error}</p>}

        {/* Search */}
        {challenges.length > 0 && (
          <input
            type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, org or phone…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-300" />
        )}

        {filtered.length === 0 && !showAddForm ? (
          <p className="text-xs text-gray-400 text-center py-4">
            {q ? 'No challenges match your search.' : 'No challenges yet.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((ch) => {
              const isOpen = expandedId === ch.id
              const tab = detailTab[ch.id] ?? 'info'
              const pool = ch.platformConfigs.reduce((s, pc) => s + totalCost(pc.ranges), 0)
              const paid = ch.payments.filter(p => p.status === 'success').reduce((s, p) => s + (p.amount ?? 0), 0)

              const isClosed = new Date(ch.closingTime) < new Date()
              const canExtend = isClosed && ch.submissionCount === 0

              return (
                <li key={ch.id} className={`rounded-xl border transition-colors ${isOpen ? 'border-violet-300 bg-violet-50/40' : 'border-gray-200 bg-white hover:border-violet-200'}`}>
                  {editingItem?.id === ch.id ? (
                    <div className="p-3">
                      <ChallengeForm challenge={ch} isAdd={false} isPending={isPending} error={error}
                        onSubmit={(fd) => handleFormSubmit(fd, false)}
                        onCancel={() => { setEditingItem(null); setError(null) }} />
                    </div>
                  ) : extendingId === ch.id ? (
                    <div className="p-3 space-y-2">
                      <p className="text-xs font-bold text-amber-700">Extend Closed Challenge</p>
                      <form onSubmit={(e) => handleExtend(e, ch.id)} className="space-y-2">
                        <div className="grid sm:grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-semibold text-gray-500">New Closing Time <span className="text-red-400">*</span></label>
                            <input type="datetime-local" name="closingTime" required
                              defaultValue={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                              className={fieldClass} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-semibold text-gray-500">New Payment By <span className="text-red-400">*</span></label>
                            <input type="datetime-local" name="paymentTime" required
                              defaultValue={new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                              className={fieldClass} />
                          </div>
                        </div>
                        {error && <p className="text-xs text-red-500">{error}</p>}
                        <div className="flex gap-2">
                          <button type="submit" disabled={isPending}
                            className="rounded-lg bg-amber-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-amber-700 disabled:opacity-60">
                            {isPending ? 'Saving…' : 'Save new times'}
                          </button>
                          <button type="button" onClick={() => { setExtendingId(null); setError(null) }}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <>
                      {/* Collapsed row — always visible */}
                      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleExpand(ch.id)}>
                        <span className="text-gray-400 text-xs w-3 shrink-0">{isOpen ? '▾' : '▸'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-semibold text-gray-800 truncate">{ch.description}</p>
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ch.published ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {ch.published ? 'Live' : 'Draft'}
                            </span>
                            {isClosed && ch.submissionCount === 0 && (
                              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-600">Closed · No entries</span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 truncate">{ch.orgName} · {fmtDate(ch.closingTime)} · {ch.submissionCount} entries · KSh {paid > 0 ? paid.toLocaleString() + ' paid' : pool.toLocaleString() + ' pool'}</p>
                        </div>
                        {/* Quick actions — stop propagation so row click doesn't toggle */}
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          {canExtend && (
                            <button onClick={() => { setExtendingId(ch.id); setEditingItem(null); setShowAddForm(false); setError(null) }}
                              className="rounded px-2 py-1 text-[10px] font-bold text-amber-600 hover:bg-amber-50 transition-colors">
                              Extend
                            </button>
                          )}
                          <button onClick={() => handleTogglePublish(ch.id, ch.published)}
                            disabled={togglingId === ch.id || isPending}
                            className={`rounded px-2 py-1 text-[10px] font-bold transition-colors disabled:opacity-40 ${ch.published ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                            {togglingId === ch.id ? '…' : ch.published ? 'Unpublish' : 'Publish'}
                          </button>
                          <button onClick={() => { setEditingItem(ch); setShowAddForm(false); setExtendingId(null); setError(null) }}
                            className="rounded px-2 py-1 text-[10px] font-bold text-violet-600 hover:bg-violet-50 transition-colors">Edit</button>
                          <button onClick={() => handleDelete(ch.id)} disabled={deletingId === ch.id || isPending}
                            className="rounded px-2 py-1 text-[10px] font-bold text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors">
                            {deletingId === ch.id ? '…' : 'Del'}
                          </button>
                        </div>
                      </div>

                      {/* Expanded detail section */}
                      {isOpen && (
                        <div className="border-t border-violet-200 bg-white rounded-b-xl">
                          {/* Tab bar */}
                          <div className="flex border-b border-gray-100">
                            {(['info', 'entries', 'payments'] as const).map(t => (
                              <button key={t} onClick={() => setDetailTab(prev => ({ ...prev, [ch.id]: t }))}
                                className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors capitalize ${tab === t ? 'text-violet-700 border-b-2 border-violet-600 bg-violet-50' : 'text-gray-500 hover:text-gray-700'}`}>
                                {t === 'entries' ? `Entries (${ch.submissionCount})` : t === 'payments' ? `Payments (${ch.payments.length})` : 'Info'}
                              </button>
                            ))}
                            <a href={`/api/challenge/${ch.id}/results`} target="_blank" rel="noopener noreferrer"
                              className="flex-1 py-1.5 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 text-center transition-colors">
                              PDF
                            </a>
                          </div>

                          {tab === 'info' && (
                            <div className="p-3 space-y-2 text-xs text-gray-600">
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                <span className="text-gray-400">Org</span><span className="font-medium">{ch.orgName}</span>
                                <span className="text-gray-400">Phone</span><span className="font-mono">{ch.tel}</span>
                                <span className="text-gray-400">M-Pesa No.</span><span className="font-mono">{ch.mpesaNo}</span>
                                <span className="text-gray-400">Closes</span><span>{new Date(ch.closingTime).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                <span className="text-gray-400">Pay by</span><span>{new Date(ch.paymentTime).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                <span className="text-gray-400">Prize pool</span><span className="font-bold text-violet-700">KSh {pool.toLocaleString()}</span>
                              </div>
                              <div className="space-y-1 pt-1 border-t border-gray-100">
                                {ch.platformConfigs.map(pc => (
                                  <div key={pc.platform} className="flex items-start gap-2">
                                    <span className="rounded bg-indigo-100 text-indigo-700 px-1.5 py-0.5 text-[10px] font-bold shrink-0">{PLATFORM_LABELS[pc.platform] ?? pc.platform}</span>
                                    <span className="text-gray-500">{pc.targetCount.toLocaleString()} targets · {pc.ranges.map(r => `top ${r.count}→KSh${r.amount.toLocaleString()}`).join(', ')}</span>
                                  </div>
                                ))}
                              </div>
                              <a href={ch.repostUrl} target="_blank" rel="noopener noreferrer"
                                className="block text-[10px] text-indigo-500 underline truncate">{ch.repostUrl}</a>
                            </div>
                          )}

                          {tab === 'entries' && (
                            <div className="p-2">
                              <SubmissionsList challengeId={ch.id} onDone={onDone} />
                            </div>
                          )}

                          {tab === 'payments' && (
                            <ChallengePayments payments={ch.payments} />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ─── CRUD Market Section ────────────────────────────────────────── */

type SectionProps = {
  market: { id: string; name: string; countyName: string }
  rows: PriceRow[]
  onAddPrice: () => void
  onEdit: (price: PriceRow) => void
  onDelete: (id: string) => void
  deletingId: string | null
}

function CrudMarketSection({ market, rows, onAddPrice, onEdit, onDelete, deletingId }: SectionProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between bg-linear-to-r from-indigo-800 to-violet-800 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">{market.countyName}</p>
          <h3 className="mt-0.5 text-base font-bold text-white">{market.name}</h3>
        </div>
        <button
          onClick={onAddPrice}
          className="flex items-center gap-1.5 shrink-0 rounded-lg bg-white/20 border border-white/30 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/30 transition-colors"
        >
          <span className="text-base leading-none">+</span> Price
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-gray-400">
          No prices recorded. Click <strong className="text-violet-600">+ Price</strong> to add one.
        </div>
      ) : (
        <>
          <div className="hidden sm:grid grid-cols-[2.5rem_1fr_8rem_10rem_7rem_6rem_5rem] gap-2 bg-indigo-50 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-indigo-600 border-b border-indigo-100">
            <span>#</span><span>Commodity</span>
            <span className="text-right">Price</span>
            <span className="text-right">Change</span>
            <span className="text-right">%</span>
            <span className="text-right">Time</span>
            <span />
          </div>
          <ul>
            {rows.map((row, i) => {
              const dev = deviation(row.price, row.prevPrice)
              const badgeColor = itemBadgeColor(row.item.name)
              const isDeleting = deletingId === row.id
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-[2.5rem_1fr] sm:grid-cols-[2.5rem_1fr_8rem_10rem_7rem_6rem_5rem] gap-2 items-center bg-linear-to-r from-violet-700 to-indigo-700 px-4 sm:px-5 py-3.5 border-b border-violet-600/30 last:border-b-0 group"
                >
                  <span className="text-xs text-white/50 font-mono">{i + 1}</span>
                  <div>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold text-white ${badgeColor}`}>
                      {row.item.name}
                    </span>
                    <span className="ml-1.5 text-xs text-white/40">{row.item.unitMeasure}</span>
                  </div>
                  <div className="hidden sm:block text-right font-mono font-bold text-white">KSh {row.price.toLocaleString()}</div>
                  <div className="hidden sm:flex justify-end">
                    {dev ? (
                      <span className={`font-bold text-sm ${dev.up ? 'text-emerald-300' : 'text-red-300'}`}>
                        {dev.up ? '▲' : '▼'} {dev.up ? '+' : ''}{dev.diff}
                      </span>
                    ) : <span className="text-white/30 text-sm">—</span>}
                  </div>
                  <div className="hidden sm:block text-right text-sm font-semibold">
                    {dev ? (
                      <span className={dev.up ? 'text-emerald-300' : 'text-red-300'}>{dev.pct}%</span>
                    ) : <span className="text-white/30">—</span>}
                  </div>
                  <div className="hidden sm:block text-right font-mono text-xs text-white/60"><LiveTime /></div>
                  <div className="hidden sm:flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onEdit(row)} title="Edit" className="grid h-7 w-7 place-items-center rounded-md bg-white/10 text-white/70 hover:bg-white/25 hover:text-white transition-colors text-xs">✏</button>
                    <button onClick={() => onDelete(row.id)} disabled={isDeleting} title="Delete" className="grid h-7 w-7 place-items-center rounded-md bg-white/10 text-white/70 hover:bg-red-400/40 hover:text-red-200 disabled:opacity-40 transition-colors text-xs">
                      {isDeleting ? '…' : '✕'}
                    </button>
                  </div>
                  {/* Mobile */}
                  <div className="col-span-2 flex items-center justify-between sm:hidden pt-1">
                    <span className="font-mono font-bold text-white text-sm">KSh {row.price.toLocaleString()}</span>
                    {dev && (
                      <span className={`text-xs font-bold ${dev.up ? 'text-emerald-300' : 'text-red-300'}`}>
                        {dev.up ? '▲' : '▼'} {dev.diff} ({dev.pct}%)
                      </span>
                    )}
                    <div className="flex gap-1">
                      <button onClick={() => onEdit(row)} className="px-2 py-1 rounded-md text-xs bg-white/15 text-white hover:bg-white/25">✏</button>
                      <button onClick={() => onDelete(row.id)} disabled={isDeleting} className="px-2 py-1 rounded-md text-xs bg-white/15 text-white hover:bg-red-400/40 disabled:opacity-40">✕</button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

const selectClass =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-colors disabled:opacity-50 shadow-sm'

const fieldClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all'

const primaryBtnClass =
  'flex items-center gap-1.5 rounded-lg bg-linear-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-bold text-white shadow hover:from-violet-500 hover:to-indigo-500 transition-all'

const secondaryBtnClass =
  'flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50'

/* ─── Routes / Fares Panel ───────────────────────────────────────── */

function RoutesPanel({ routes, counties, onDone }: { routes: RouteInfo[]; counties: CountyInfo[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingFareId, setDeletingFareId] = useState<string | null>(null)
  const [formCountyId, setFormCountyId] = useState('')

  const handleAddRoute = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(null)
    const fd = new FormData(e.currentTarget)
    ;(e.currentTarget as HTMLFormElement).reset()
    startTransition(async () => {
      const r = await createRoute(fd)
      if (r.success) onDone()
      else setError(r.error)
    })
  }

  const handleDeleteRoute = (id: string) => {
    if (!confirm('Delete this route and all its fares?')) return
    setDeletingId(id)
    startTransition(async () => { await deleteRoute(id); setDeletingId(null); onDone() })
  }

  const handleUpsertFare = (e: React.SyntheticEvent<HTMLFormElement>, routeId: string) => {
    e.preventDefault(); setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('routeId', routeId)
    ;(e.currentTarget as HTMLFormElement).reset()
    startTransition(async () => {
      const r = await upsertFare(fd)
      if (r.success) onDone()
      else setError(r.error)
    })
  }

  const handleDeleteFare = (id: string) => {
    setDeletingFareId(id)
    startTransition(async () => { await deleteFare(id); setDeletingFareId(null); onDone() })
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-5 py-3.5 flex items-center gap-2">
        <span className="text-base">🚌</span>
        <h2 className="text-sm font-bold text-white">Transport Fares</h2>
        <span className="ml-auto text-xs text-white/50">{routes.length} route{routes.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="p-5 space-y-4">
        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Add route form */}
        <form onSubmit={handleAddRoute} className="rounded-xl border border-violet-100 bg-violet-50 p-4 space-y-3">
          <p className="text-xs font-bold text-violet-700 uppercase tracking-wider">Add Route</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">From <span className="text-red-400">*</span></label>
              <input type="text" name="from" required placeholder="e.g. Nairobi" className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">To <span className="text-red-400">*</span></label>
              <input type="text" name="to" required placeholder="e.g. Githurai" className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">County <span className="text-gray-400 font-normal">(optional)</span></label>
              <select name="countyId" value={formCountyId} onChange={(e) => setFormCountyId(e.target.value)} className={fieldClass}>
                <option value="">— Select county</option>
                {counties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Market <span className="text-gray-400 font-normal">(ties route to market)</span></label>
              <select name="marketId" className={fieldClass} disabled={!formCountyId}>
                <option value="">— Select market</option>
                {(counties.find((c) => c.id === formCountyId)?.markets ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" disabled={isPending}
            className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60 hover:from-violet-500 hover:to-indigo-500 transition-all">
            {isPending ? 'Saving…' : '+ Add Route'}
          </button>
        </form>

        {/* Routes list */}
        {routes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No routes yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {routes.map((route) => (
              <li key={route.id} className="py-3 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-sm text-gray-800">{route.from} → {route.to}</span>
                  {route.marketName && (
                    <span className="rounded-full bg-violet-50 border border-violet-100 px-2 py-0.5 text-xs text-violet-700">{route.marketName}</span>
                  )}
                  {route.countyName && (
                    <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{route.countyName}</span>
                  )}
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => setExpandedId((p) => p === route.id ? null : route.id)}
                      className="rounded-lg px-3 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-50 transition-colors">
                      {expandedId === route.id ? 'Hide fares' : `Fares (${route.fares.length})`}
                    </button>
                    <button onClick={() => handleDeleteRoute(route.id)} disabled={deletingId === route.id || isPending}
                      className="rounded-lg px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors">
                      {deletingId === route.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>

                {expandedId === route.id && (
                  <div className="ml-4 space-y-2 border-l-2 border-violet-100 pl-4">
                    {route.fares.length > 0 && (
                      <ul className="space-y-1">
                        {route.fares.map((fare) => (
                          <li key={fare.id} className="flex items-center gap-3 text-sm">
                            <span className="capitalize text-gray-600 w-16">{fare.transportType}</span>
                            <span className="font-mono font-semibold text-gray-800">KSh {fare.amount.toLocaleString()}</span>
                            <button onClick={() => handleDeleteFare(fare.id)} disabled={deletingFareId === fare.id || isPending}
                              className="ml-auto text-xs text-red-500 hover:bg-red-50 rounded px-2 py-0.5 disabled:opacity-40">
                              {deletingFareId === fare.id ? '…' : '×'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form onSubmit={(e) => handleUpsertFare(e, route.id)} className="flex gap-2 flex-wrap">
                      <select name="transportType" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 focus:border-violet-400 focus:outline-none">
                        <option value="psv">PSV / Matatu</option>
                        <option value="bike">Bodaboda</option>
                        <option value="other">Other</option>
                      </select>
                      <input type="number" name="amount" required min={1} placeholder="Fare (KSh)"
                        className="w-32 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-violet-400 focus:outline-none" />
                      <button type="submit" disabled={isPending}
                        className="rounded-lg bg-violet-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-violet-700 disabled:opacity-60">
                        {isPending ? '…' : 'Save fare'}
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ─── News Panel ─────────────────────────────────────────────────── */

function NewsForm({
  item, counties, isPending, error, onSubmit, onCancel,
}: {
  item?: NewsInfo
  counties: CountyInfo[]
  isPending: boolean
  error: string | null
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCancel: () => void
}) {
  const [newsTarget, setNewsTarget] = useState(item?.target ?? 'NATIONAL')
  const [checkedCounties, setCheckedCounties] = useState<string[]>(item?.targetCountyIds ?? [])
  const [newsMarketCountyId, setNewsMarketCountyId] = useState('')
  const [newsMarketId, setNewsMarketId] = useState(item?.marketId ?? '')

  const toggleCounty = (id: string) =>
    setCheckedCounties(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const marketsForCounty = counties.find(c => c.id === newsMarketCountyId)?.markets ?? []

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-violet-100 bg-violet-50 p-4 space-y-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      {item && <input type="hidden" name="existingFileUrl" value={item.fileUrl ?? ''} />}
      <input type="hidden" name="targetCountyIds" value={checkedCounties.join(',')} />
      <input type="hidden" name="marketId" value={newsMarketId} />
      <p className="text-xs font-bold text-violet-700 uppercase tracking-wider">{item ? 'Edit News' : 'New Alert / News'}</p>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">Title <span className="text-red-400">*</span></label>
        <input type="text" name="title" required defaultValue={item?.title ?? ''} placeholder="e.g. Market closure notice" className={fieldClass} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">Description <span className="text-red-400">*</span></label>
        <textarea name="description" required rows={3} defaultValue={item?.description ?? ''} placeholder="Full details…"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 resize-none transition-all" />
      </div>

      {/* Target selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">Target audience</label>
        <select name="target" value={newsTarget} onChange={e => { setNewsTarget(e.target.value); setCheckedCounties([]); setNewsMarketId('') }} className={fieldClass}>
          <option value="NATIONAL">National (everyone)</option>
          <option value="REGIONAL">Regional (multiple counties)</option>
          <option value="COUNTY">County (specific county)</option>
          <option value="MARKET">Market (specific market)</option>
        </select>
      </div>

      {/* County checkboxes for REGIONAL / COUNTY */}
      {(newsTarget === 'REGIONAL' || newsTarget === 'COUNTY') && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">Select counties <span className="text-red-400">*</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
            {counties.map(c => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={checkedCounties.includes(c.id)} onChange={() => toggleCounty(c.id)} className="accent-violet-600 rounded" />
                <span className="text-xs text-gray-700 truncate">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Market selector for MARKET */}
      {newsTarget === 'MARKET' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">County</label>
            <select value={newsMarketCountyId} onChange={e => { setNewsMarketCountyId(e.target.value); setNewsMarketId('') }} className={fieldClass}>
              <option value="">— Select county</option>
              {counties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Market</label>
            <select value={newsMarketId} onChange={e => setNewsMarketId(e.target.value)} className={fieldClass} disabled={!newsMarketCountyId}>
              <option value="">— Select market</option>
              {marketsForCounty.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Event Date / Time <span className="text-gray-400 font-normal">(when activity happens)</span></label>
          <input type="datetime-local" name="eventTime"
            defaultValue={item ? item.eventTime.slice(0, 16) : new Date().toISOString().slice(0, 16)}
            className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">
            {item ? <>Replace file <span className="text-gray-400 font-normal">(optional)</span></> : <>Attachment <span className="text-gray-400 font-normal">(PDF or image)</span></>}
          </label>
          <input type="file" name="file" accept=".pdf,image/*"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-violet-700 hover:file:bg-violet-200 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all" />
          {item?.fileUrl && <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">Current attachment</a>}
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={isPending}
          className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60 hover:from-violet-500 hover:to-indigo-500 transition-all">
          {isPending ? 'Saving…' : item ? 'Save changes' : 'Publish'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

function NewsPanel({ news, counties, onDone }: { news: NewsInfo[]; counties: CountyInfo[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<NewsInfo | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fmtDT = (iso: string) =>
    new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>, isEdit: boolean) => {
    e.preventDefault(); setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = isEdit ? await updateNews(fd) : await createNews(fd)
      if (r.success) { setShowAdd(false); setEditingItem(null); onDone() }
      else setError(r.error)
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this news item?')) return
    setDeletingId(id)
    startTransition(async () => { await deleteNews(id); setDeletingId(null); onDone() })
  }

  function resolveNewsTarget(item: NewsInfo) {
    if (item.target === 'NATIONAL') {
      return <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">National</span>
    }
    if (item.target === 'MARKET' && item.marketId) {
      const county = counties.find(c => c.markets.some(m => m.id === item.marketId))
      const market = county?.markets.find(m => m.id === item.marketId)
      const label = county && market ? `${county.name} · ${market.name}` : '—'
      return <span className="inline-flex items-center rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{label}</span>
    }
    const names = (item.targetCountyIds ?? []).map(id => counties.find(c => c.id === id)?.name).filter(Boolean)
    if (names.length === 0) return null
    return <span className="inline-flex items-center rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{names.join(', ')}</span>
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-5 py-3.5 flex items-center gap-2">
        <span className="text-base">📰</span>
        <h2 className="text-sm font-bold text-white">News & Alerts</h2>
        <span className="ml-2 text-xs text-white/50">{news.length} item{news.length !== 1 ? 's' : ''}</span>
        {!editingItem && (
          <button onClick={() => { setShowAdd((v) => !v); setError(null) }}
            className="ml-auto flex items-center gap-1 rounded-lg bg-white/20 border border-white/30 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/30 transition-colors">
            {showAdd ? 'Cancel' : '+ New'}
          </button>
        )}
      </div>
      <div className="p-5 space-y-4">
        {showAdd && !editingItem && (
          <NewsForm
            key="add"
            counties={counties} isPending={isPending} error={error}
            onSubmit={(e) => handleSubmit(e, false)}
            onCancel={() => { setShowAdd(false); setError(null) }}
          />
        )}
        {editingItem && (
          <NewsForm
            key={editingItem.id}
            item={editingItem} counties={counties} isPending={isPending} error={error}
            onSubmit={(e) => handleSubmit(e, true)}
            onCancel={() => { setEditingItem(null); setError(null) }}
          />
        )}

        {news.length === 0 && !showAdd ? (
          <p className="text-sm text-gray-400 text-center py-4">No news items yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {news.map((item) => (
              <li key={item.id} className="py-3 space-y-1">
                {editingItem?.id === item.id ? null : (
                  <>
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-gray-800 flex-1">{item.title}</p>
                      <span className="text-xs text-gray-400 shrink-0">Event: {fmtDT(item.eventTime)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {resolveNewsTarget(item)}
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2">{item.description}</p>
                    {item.fileUrl && (
                      <a href={item.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-indigo-600 underline">Attachment</a>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setEditingItem(item); setShowAdd(false) }}
                        className="rounded-lg px-3 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-50 transition-colors">Edit</button>
                      <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id || isPending}
                        className="rounded-lg px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors">
                        {deletingId === item.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ─── Drop Ship Sales Admin Panel ────────────────────────────────── */

const SALE_STATUSES = ['PENDING', 'REVIEWED', 'PROCESSED', 'PAID']
const saleStatusColor: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  REVIEWED:  'bg-blue-100 text-blue-700',
  PROCESSED: 'bg-indigo-100 text-indigo-700',
  PAID:      'bg-emerald-100 text-emerald-700',
}

function DropShipSalesAdminPanel({
  sales, dropShipItems, onDone,
}: { sales: DropShipSaleInfo[]; dropShipItems: DropShipItemInfo[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('ALL')

  const handleUpdate = (e: React.SyntheticEvent<HTMLFormElement>, id: string) => {
    e.preventDefault(); setError(null)
    const fd = new FormData(e.currentTarget)
    const status = String(fd.get('status') ?? 'PENDING')
    const adminNotes = String(fd.get('adminNotes') ?? '')
    startTransition(async () => {
      const r = await updateDropShipSaleAdmin(id, status, adminNotes)
      if (r.success) { setExpandedId(null); onDone() }
      else setError(r.error)
    })
  }

  const fmtDT = (iso: string) =>
    new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

  const orgName = (id: string) => dropShipItems.find((d) => d.id === id)?.orgName ?? '—'

  const filtered = statusFilter === 'ALL' ? sales : sales.filter((s) => s.status === statusFilter)

  return (
    <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-5 py-3.5 flex items-center gap-2 flex-wrap">
        <span className="text-base">📊</span>
        <h2 className="text-sm font-bold text-white">Drop Ship Sales Reports</h2>
        <span className="ml-2 text-xs text-white/50">{sales.length} total</span>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="ml-auto rounded-lg border border-white/30 bg-white/15 px-2 py-1 text-xs text-white focus:outline-none">
          <option value="ALL">All statuses</option>
          {SALE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="p-5 space-y-2">
        {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No sales reports{statusFilter !== 'ALL' ? ` with status ${statusFilter}` : ''}.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((sale) => (
              <li key={sale.id} className="py-3 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${saleStatusColor[sale.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {sale.status}
                  </span>
                  <span className="font-mono text-sm font-semibold text-gray-800">{sale.mpesaNumber}</span>
                  <span className="text-xs text-gray-500">{orgName(sale.dropShipItemId)}</span>
                  <span className="text-xs text-gray-400 ml-auto">{fmtDT(sale.createdAt)}</span>
                </div>
                <div className="text-xs text-gray-600 space-y-0.5">
                  <p><span className="font-semibold">Comm:</span> {sale.commMethod}</p>
                  {sale.agentNotes && <p><span className="font-semibold">Agent notes:</span> {sale.agentNotes}</p>}
                  {sale.adminNotes && <p><span className="font-semibold">Admin notes:</span> {sale.adminNotes}</p>}
                  {sale.fileUrl && <a href={sale.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">View file</a>}
                </div>
                {expandedId === sale.id ? (
                  <form onSubmit={(e) => handleUpdate(e, sale.id)} className="space-y-2 pt-1">
                    <div className="flex gap-2 flex-wrap">
                      <select name="status" defaultValue={sale.status}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-violet-400 focus:outline-none">
                        {SALE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button type="submit" disabled={isPending}
                        className="rounded-lg bg-violet-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-violet-700 disabled:opacity-60">
                        {isPending ? '…' : 'Update'}
                      </button>
                      <button type="button" onClick={() => setExpandedId(null)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
                    <textarea name="adminNotes" rows={2} defaultValue={sale.adminNotes ?? ''} placeholder="Admin notes / quotation…"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:border-violet-400 focus:outline-none resize-none" />
                  </form>
                ) : (
                  <button onClick={() => setExpandedId(sale.id)}
                    className="rounded-lg px-3 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-50 transition-colors">
                    Review / Update
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ─── Agent Verifications Panel ──────────────────────────────────── */

const verifStatusColor: Record<string, string> = {
  NONE:     'bg-gray-100 text-gray-500',
  PENDING:  'bg-amber-100 text-amber-700',
  VERIFIED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-600',
}

function AgentVerificationsPanel({ verifications, onDone }: { verifications: AgentVerificationInfo[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('PENDING')

  const handleVerdict = (email: string, status: 'VERIFIED' | 'REJECTED') => {
    startTransition(async () => {
      const r = await updateVerificationStatus(email, status)
      if (r.success) { setExpandedId(null); onDone() }
      else setError(r.error)
    })
  }

  const filtered = statusFilter === 'ALL'
    ? verifications
    : verifications.filter((v) => v.verificationStatus === statusFilter)

  return (
    <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-5 py-3.5 flex items-center gap-2 flex-wrap">
        <span className="text-base">🪪</span>
        <h2 className="text-sm font-bold text-white">Agent Verifications</h2>
        <span className="ml-2 text-xs text-white/50">{verifications.filter(v => v.verificationStatus === 'PENDING').length} pending</span>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="ml-auto rounded-lg border border-white/30 bg-white/15 px-2 py-1 text-xs text-white focus:outline-none">
          <option value="ALL">All</option>
          {['PENDING', 'VERIFIED', 'REJECTED', 'NONE'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="p-5 space-y-2">
        {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No verifications{statusFilter !== 'ALL' ? ` with status ${statusFilter}` : ''}.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((v) => (
              <li key={v.id} className="py-3 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${verifStatusColor[v.verificationStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                    {v.verificationStatus}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{v.fullName ?? v.email}</p>
                    <p className="text-xs text-gray-400">{v.email}</p>
                  </div>
                  <button onClick={() => setExpandedId((p) => p === v.id ? null : v.id)}
                    className="ml-auto rounded-lg px-3 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-50 transition-colors">
                    {expandedId === v.id ? 'Hide' : 'Review'}
                  </button>
                </div>

                {expandedId === v.id && (
                  <div className="space-y-3 border-t border-gray-100 pt-3">
                    <div className="grid sm:grid-cols-2 gap-2 text-xs">
                      <div><span className="font-semibold text-gray-500">KRA PIN:</span> <span className="font-mono text-gray-800">{v.kraPin ?? '—'}</span></div>
                      <div><span className="font-semibold text-gray-500">ID No:</span> <span className="font-mono text-gray-800">{v.idNumber ?? '—'}</span></div>
                      <div><span className="font-semibold text-gray-500">Phone:</span> <span className="font-mono text-gray-800">{v.tel ?? '—'}</span></div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[{ label: 'Selfie', url: v.selfieUrl }, { label: 'ID Front', url: v.idFrontUrl }, { label: 'ID Back', url: v.idBackUrl }].map(({ label, url }) => (
                        <div key={label} className="space-y-1">
                          <p className="text-xs font-semibold text-gray-500">{label}</p>
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={label} className="w-full rounded-xl border border-gray-200 object-cover max-h-36 hover:opacity-90 transition-opacity" />
                            </a>
                          ) : (
                            <div className="w-full rounded-xl border-2 border-dashed border-gray-200 h-24 grid place-items-center text-xs text-gray-400">No photo</div>
                          )}
                        </div>
                      ))}
                    </div>
                    {v.verificationStatus === 'PENDING' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleVerdict(v.email, 'VERIFIED')} disabled={isPending}
                          className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                          ✓ Approve
                        </button>
                        <button onClick={() => handleVerdict(v.email, 'REJECTED')} disabled={isPending}
                          className="rounded-xl bg-red-500 text-white px-4 py-2 text-sm font-bold hover:bg-red-600 disabled:opacity-60 transition-colors">
                          × Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
