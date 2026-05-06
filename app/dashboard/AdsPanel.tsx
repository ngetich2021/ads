'use client'

import { useState, useTransition } from 'react'
import {
  reviewAd, deactivateAd, deleteAd,
  seedDefaultPackages, createAdPackage, deleteAdPackage,
  type AdInfo, type AdPackageInfo,
} from '@/app/ads/actions'

function getCountdown(endsAt: string | null): { text: string; level: 'ok' | 'warn' | 'urgent' } | null {
  if (!endsAt) return null
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', level: 'urgent' }
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  return {
    text: days > 0 ? `${days}d ${hours}h left` : `${hours}h left`,
    level: days < 1 ? 'urgent' : days < 3 ? 'warn' : 'ok',
  }
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  REVIEWED: 'bg-blue-100 text-blue-700',
  AWAITING_PAYMENT: 'bg-indigo-100 text-indigo-700',
  ACTIVE: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
  REJECTED: 'bg-red-100 text-red-600',
}

const POSITIONS: Record<string, string> = {
  banner: 'Banner',
  sidebar: 'Sidebar',
  sticky: 'Sticky',
}

function AdRow({ ad, onRefresh }: { ad: AdInfo; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [adminNotes, setAdminNotes] = useState(ad.adminNotes ?? '')
  const [busy, startTransition] = useTransition()
  const [msg, setMsg] = useState('')

  function act(fn: () => Promise<{ success: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await fn()
      if (r.success) { setMsg(''); onRefresh() } else setMsg(r.error ?? 'Error')
    })
  }

  const videoSrc = ad.videoUrl ?? (ad.hasVideoData ? `/api/ads/${ad.id}/video` : null)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[ad.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {ad.status}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-800 truncate text-sm">{ad.title}</p>
          <p className="text-xs text-gray-400 truncate">{ad.submitterName} · {ad.submitterPhone} · {ad.packageName}</p>
        </div>
        <span className="text-gray-400 text-xs shrink-0">{new Date(ad.createdAt).toLocaleDateString()}</span>
        {ad.status === 'ACTIVE' && (() => {
          const cd = getCountdown(ad.endsAt)
          if (!cd) return null
          const cls = cd.level === 'urgent' ? 'text-red-600 bg-red-50 border border-red-200' : cd.level === 'warn' ? 'text-amber-600 bg-amber-50 border border-amber-200' : 'text-green-600 bg-green-50 border border-green-200'
          return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${cls}`}>{cd.text}</span>
        })()}
        <span className="text-gray-400 ml-1">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50">
          {/* Submitter info */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><span className="text-xs text-gray-400">Name</span><p className="font-medium">{ad.submitterName}</p></div>
            <div><span className="text-xs text-gray-400">Phone</span><p className="font-medium">{ad.submitterPhone}</p></div>
            <div><span className="text-xs text-gray-400">Email</span><p className="font-medium break-all">{ad.submitterEmail}</p></div>
            <div><span className="text-xs text-gray-400">Package</span><p className="font-medium">{ad.packageName} · {ad.packagePricePerDay.toLocaleString()}/day</p></div>
            <div><span className="text-xs text-gray-400">Duration</span><p className="font-medium">{ad.durationDays} days</p></div>
            <div>
              <span className="text-xs text-gray-400">Positions</span>
              <p className="font-medium">{ad.positions.map(p => POSITIONS[p] ?? p).join(', ')}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400">Targeting</span>
              <p className="font-medium capitalize">{ad.target.toLowerCase()}</p>
            </div>
            {ad.invoiceAmount && (
              <div><span className="text-xs text-gray-400">Invoice (auto)</span><p className="font-bold text-indigo-700">KSh {ad.invoiceAmount.toLocaleString()}</p></div>
            )}
          </div>

          {/* Video preview */}
          {videoSrc && (
            <div className="rounded-xl overflow-hidden bg-black" style={{ maxHeight: '180px' }}>
              <video src={videoSrc} controls className="w-full h-44 object-contain" />
            </div>
          )}

          {ad.description && (
            <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2">{ad.description}</p>
          )}

          {/* Dates + countdown */}
          {(ad.startsAt || ad.endsAt) && (
            <div className="space-y-2">
              <div className="flex gap-4 text-sm">
                {ad.startsAt && <span className="text-gray-500">Start: <strong>{new Date(ad.startsAt).toLocaleDateString()}</strong></span>}
                {ad.endsAt && <span className="text-gray-500">End: <strong>{new Date(ad.endsAt).toLocaleDateString()}</strong></span>}
              </div>
              {ad.status === 'ACTIVE' && (() => {
                const cd = getCountdown(ad.endsAt)
                if (!cd) return null
                const cls = cd.level === 'urgent'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : cd.level === 'warn'
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-green-50 border-green-200 text-green-700'
                return (
                  <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${cls}`}>
                    <span className="font-semibold">Time remaining:</span>
                    <span>{cd.text}</span>
                    {cd.level !== 'ok' && <span className="ml-auto text-xs opacity-80">Consider notifying advertiser</span>}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Review form — only for PENDING */}
          {ad.status === 'PENDING' && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-semibold text-gray-700">Review Content</p>
                {ad.invoiceAmount && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Auto-calculated invoice</p>
                    <p className="font-bold text-indigo-700 text-sm">KSh {ad.invoiceAmount.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">{ad.durationDays}d × KSh {ad.packagePricePerDay.toLocaleString()}/day</p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Notes to advertiser (optional)</label>
                <input
                  type="text" value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="e.g. Please trim the video to 30 seconds…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => act(() => reviewAd(ad.id, adminNotes, true))}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg py-2 transition-colors"
                >
                  Approve
                </button>
                <button
                  disabled={busy}
                  onClick={() => act(() => reviewAd(ad.id, adminNotes, false))}
                  className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm font-semibold rounded-lg py-2 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          {/* Payments */}
          {ad.payments.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Payments</p>
              {ad.payments.map(p => (
                <div key={p.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100 last:border-0">
                  <span className={`font-semibold px-2 py-0.5 rounded-full ${p.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                  {p.mpesaRef && <span className="font-mono text-gray-500">{p.mpesaRef}</span>}
                  {p.amount && <span className="font-medium text-gray-700">KSh {p.amount.toLocaleString()}</span>}
                  <span className="text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}

          {msg && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{msg}</p>}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {ad.status === 'ACTIVE' && (
              <button disabled={busy} onClick={() => act(() => deactivateAd(ad.id))}
                className="text-xs border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
                Deactivate
              </button>
            )}
            <button disabled={busy} onClick={() => { if (confirm('Delete this ad?')) act(() => deleteAd(ad.id)) }}
              className="text-xs border border-red-200 text-red-600 hover:bg-red-50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PackagesTab({ packages, onRefresh }: { packages: AdPackageInfo[]; onRefresh: () => void }) {
  const [busy, startTransition] = useTransition()
  const [msg, setMsg] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newPos, setNewPos] = useState<string[]>(['banner'])

  function act(fn: () => Promise<{ success: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await fn()
      if (r.success) { setMsg(''); onRefresh() } else setMsg(r.error ?? 'Error')
    })
  }

  const posOptions = ['banner', 'sidebar', 'sticky']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{packages.length} package{packages.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => act(seedDefaultPackages)}
            className="text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
            Seed Defaults
          </button>
          <button onClick={() => setShowCreate(v => !v)}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 transition-colors">
            + New Package
          </button>
        </div>
      </div>

      {showCreate && (
        <form
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            newPos.forEach(p => fd.append('positions', p))
            act(() => createAdPackage(fd).then(r => { if (r.success) { setShowCreate(false); setNewPos(['banner']) } return r }))
          }}
          className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-gray-700">New Package</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
              <input name="name" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Price (KSh/day)</label>
              <input name="price" type="number" min="1" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Min Days</label>
              <input name="durationDays" type="number" min="1" defaultValue="3" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Plays/hour</label>
              <input name="playsPerHour" type="number" min="1" defaultValue="2" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
              <input name="description" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Ad Positions</label>
            <div className="flex gap-3">
              {posOptions.map(p => (
                <label key={p} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={newPos.includes(p)}
                    onChange={e => setNewPos(prev => e.target.checked ? [...prev, p] : prev.filter(x => x !== p))} />
                  {POSITIONS[p]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2">Create</button>
            <button type="button" onClick={() => setShowCreate(false)} className="border border-gray-300 text-gray-600 text-sm rounded-lg px-4 py-2">Cancel</button>
          </div>
        </form>
      )}

      {msg && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{msg}</p>}

      <div className="space-y-2">
        {packages.map(pkg => (
          <div key={pkg.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800 text-sm">{pkg.name}</span>
                {!pkg.active && <span className="text-xs bg-gray-100 text-gray-500 rounded px-1.5">inactive</span>}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{pkg.description}</p>
              <div className="flex gap-2 mt-1 flex-wrap">
                {pkg.positions.map(p => (
                  <span key={p} className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">{POSITIONS[p] ?? p}</span>
                ))}
                <span className="text-xs text-gray-400">min {pkg.durationDays}d · {pkg.playsPerHour}×/hr</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-indigo-700 text-sm">KSh {pkg.price.toLocaleString()}<span className="font-normal text-gray-400 text-xs">/day</span></p>
            </div>
            <button disabled={busy} onClick={() => { if (confirm('Delete this package?')) act(() => deleteAdPackage(pkg.id)) }}
              className="text-xs text-red-500 hover:text-red-700 shrink-0">✕</button>
          </div>
        ))}
        {packages.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No packages. Click "Seed Defaults" to add standard packages.</p>
        )}
      </div>
    </div>
  )
}

type Props = {
  ads: AdInfo[]
  packages: AdPackageInfo[]
  onRefresh: () => void
}

const STATUSES = ['ALL', 'PENDING', 'ACTIVE', 'EXPIRED', 'REJECTED']

export default function AdsPanel({ ads, packages, onRefresh }: Props) {
  const [tab, setTab] = useState<'ads' | 'packages'>('ads')
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  const totalReceived = ads.reduce((sum, ad) =>
    sum + ad.payments.filter(p => p.status === 'success').reduce((s, p) => s + (p.amount ?? 0), 0), 0)
  const activeCount = ads.filter(a => a.status === 'ACTIVE').length
  const pendingCount = ads.filter(a => a.status === 'PENDING').length

  const filtered = ads
    .filter(a => filter === 'ALL' || a.status === filter)
    .filter(a => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        a.title.toLowerCase().includes(q) ||
        a.submitterName.toLowerCase().includes(q) ||
        a.submitterEmail.toLowerCase().includes(q) ||
        a.submitterPhone.includes(q)
      )
    })

  const counts: Record<string, number> = { ALL: ads.length }
  ads.forEach(a => { counts[a.status] = (counts[a.status] ?? 0) + 1 })

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        {(['ads', 'packages'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'ads' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
              <p className="text-xs text-indigo-500 font-medium">Total Received</p>
              <p className="font-bold text-indigo-800 text-lg">KSh {totalReceived.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              <p className="text-xs text-green-600 font-medium">Active Ads</p>
              <p className="font-bold text-green-800 text-lg">{activeCount}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-600 font-medium">Pending Review</p>
              <p className="font-bold text-amber-800 text-lg">{pendingCount}</p>
            </div>
          </div>

          {/* Search */}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, name, email or phone…"
            className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />

          {/* Status filter */}
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filter === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 text-gray-600 hover:border-indigo-400'
                }`}>
                {s} {counts[s] ? `(${counts[s]})` : ''}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No ads found.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(ad => <AdRow key={ad.id} ad={ad} onRefresh={onRefresh} />)}
            </div>
          )}
        </div>
      )}

      {tab === 'packages' && (
        <PackagesTab packages={packages} onRefresh={onRefresh} />
      )}
    </div>
  )
}
