'use client'

import { useState, useEffect } from 'react'
import { getAdById, extendAd, type AdInfo } from '../../actions'

const STATUS_META: Record<string, { label: string; color: string; icon: string; desc: string }> = {
  PENDING:  { label: 'Under Review', color: 'text-amber-700 bg-amber-50 border-amber-200',  icon: '🔍', desc: 'Your payment was received. Our team is reviewing your ad content.' },
  ACTIVE:   { label: 'Live', color: 'text-green-700 bg-green-50 border-green-200', icon: '✅', desc: 'Your ad has been approved and is now running.' },
  EXPIRED:  { label: 'Expired', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: '🕐', desc: 'Your ad campaign has ended.' },
  REJECTED: { label: 'Not Approved', color: 'text-red-700 bg-red-50 border-red-200', icon: '❌', desc: 'Your ad was not approved. See the reason below.' },
}

type ExtendPayStep = 'idle' | 'initiating' | 'polling' | 'done' | 'failed'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {}) }}
      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${copied ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'}`}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function StatusLookup() {
  const [inputId, setInputId] = useState('')
  const [loading, setLoading] = useState(false)
  const [ad, setAd] = useState<AdInfo | null | 'not_found'>(null)

  async function lookup() {
    const id = inputId.trim()
    if (!id) return
    setLoading(true); setAd(null)
    const result = await getAdById(id)
    setAd(result ?? 'not_found')
    setLoading(false)
  }

  if (ad && ad !== 'not_found') return <AdStatus ad={ad} />

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full space-y-4">
        <h1 className="font-bold text-gray-900 text-lg">Check Ad Status</h1>
        <p className="text-sm text-gray-500">Enter your Ad ID to check status, see review results, or track your ad.</p>
        <input value={inputId} onChange={e => setInputId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          placeholder="Paste your Ad ID here…"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        {ad === 'not_found' && <p className="text-sm text-red-600">Ad not found. Check your ID.</p>}
        <button onClick={lookup} disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
          {loading ? 'Looking up…' : 'Check Status'}
        </button>
        <a href="/ads/submit" className="block text-center text-sm text-gray-400 hover:text-indigo-600">Submit a new ad</a>
      </div>
    </div>
  )
}

const EXTEND_OPTIONS = [3, 7, 14, 30]

function AdStatus({ ad }: { ad: AdInfo }) {
  const meta = STATUS_META[ad.status] ?? { label: ad.status, color: 'text-gray-600 bg-gray-50 border-gray-200', icon: '•', desc: '' }
  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const statusUrl = `${appUrl}/ads/${ad.id}/pay`

  const [countdown, setCountdown] = useState('')
  const [currentEndsAt, setCurrentEndsAt] = useState(ad.endsAt)

  const [extendDays, setExtendDays] = useState(7)
  const [extendPhone, setExtendPhone] = useState(ad.submitterPhone)
  const [extendPayStep, setExtendPayStep] = useState<ExtendPayStep>('idle')
  const [extendError, setExtendError] = useState('')
  const [extendSuccess, setExtendSuccess] = useState(false)

  const extendCost = extendDays * ad.packagePricePerDay
  const canExtend = ad.status === 'ACTIVE' || ad.status === 'EXPIRED'

  useEffect(() => {
    if (!currentEndsAt) return
    function update() {
      const ms = new Date(currentEndsAt!).getTime() - Date.now()
      if (ms <= 0) { setCountdown('Expired'); return }
      const days = Math.floor(ms / 86400000)
      const hours = Math.floor((ms % 86400000) / 3600000)
      const mins = Math.floor((ms % 3600000) / 60000)
      if (days > 0) setCountdown(`${days}d ${hours}h remaining`)
      else if (hours > 0) setCountdown(`${hours}h ${mins}m remaining`)
      else setCountdown(`${mins}m remaining`)
    }
    update()
    const t = setInterval(update, 60000)
    return () => clearInterval(t)
  }, [currentEndsAt])

  async function handleExtendPay() {
    if (!extendPhone.trim()) { setExtendError('Enter your M-Pesa number.'); return }
    setExtendError(''); setExtendPayStep('initiating')
    try {
      const res = await fetch('/api/mpesa/stk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: extendPhone.trim(), amount: extendCost, ref: 'AdExtension' }),
      })
      const data = await res.json() as { checkoutId?: string; error?: string }
      if (!res.ok || !data.checkoutId) {
        setExtendError(data.error ?? 'Could not initiate payment.'); setExtendPayStep('failed'); return
      }
      setExtendPayStep('polling')
      pollExtendPayment(data.checkoutId, extendPhone.trim())
    } catch {
      setExtendError('Network error. Please try again.'); setExtendPayStep('failed')
    }
  }

  function pollExtendPayment(cid: string, phone: string) {
    let attempts = 0
    async function check() {
      if (attempts++ >= 30) { setExtendPayStep('failed'); setExtendError('Payment timed out. Please try again.'); return }
      try {
        const r = await fetch(`/api/mpesa/stk/${cid}`)
        const d = await r.json() as { status: string; reason?: string }
        if (d.status === 'success') {
          const result = await extendAd(ad.id, extendDays, cid, phone, extendCost)
          if (result.success) {
            const base = currentEndsAt && new Date(currentEndsAt) > new Date() ? new Date(currentEndsAt) : new Date()
            const ne = new Date(base)
            ne.setDate(ne.getDate() + extendDays)
            setCurrentEndsAt(ne.toISOString())
            setExtendPayStep('done')
            setExtendSuccess(true)
          } else {
            setExtendError(result.error ?? 'Extension failed. Contact support.')
            setExtendPayStep('failed')
          }
          return
        }
        if (d.status === 'cancelled' || d.status === 'failed') {
          setExtendPayStep('failed'); setExtendError(d.reason ?? 'Payment was not completed.'); return
        }
      } catch { /* keep polling */ }
      setTimeout(check, 3000)
    }
    setTimeout(check, 4000)
  }

  const urgentCountdown = countdown && !countdown.includes('d') && !countdown.includes('Expired')
  const warnCountdown = countdown.startsWith('1d') || countdown.startsWith('2d')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-linear-to-r from-indigo-800 to-violet-800 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <a href="/market" className="text-white/70 hover:text-white text-sm">Market</a>
          <span className="text-white/40">/</span>
          <a href="/ads/submit" className="text-white/70 hover:text-white text-sm">Advertise</a>
          <span className="text-white/40">/</span>
          <span className="text-white font-semibold text-sm">Ad Status</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* Status card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-bold text-gray-900 text-lg">{ad.title}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{ad.packageName} · {ad.durationDays} days</p>
            </div>
            <span className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border ${meta.color}`}>
              {meta.icon} {meta.label}
            </span>
          </div>
          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">{meta.desc}</p>
        </div>

        {/* REJECTION — show prominently */}
        {ad.status === 'REJECTED' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-semibold text-red-700">Reason for rejection</p>
            </div>
            <p className="text-sm text-red-800 bg-white border border-red-200 rounded-xl px-4 py-3">
              {ad.adminNotes ?? 'No specific reason provided. Please contact support.'}
            </p>
            <p className="text-xs text-red-600">A rejection email has been sent to {ad.submitterEmail}. You may submit a new ad addressing this issue.</p>
            <a href="/ads/submit" className="inline-block mt-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl px-5 py-2.5 transition-colors">
              Submit New Ad
            </a>
          </div>
        )}

        {/* ACTIVE — show run dates + countdown */}
        {ad.status === 'ACTIVE' && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 space-y-3">
            <p className="font-semibold text-green-700">Your ad is live!</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {ad.startsAt && <div><span className="text-xs text-gray-400">Started</span><p className="font-medium">{new Date(ad.startsAt).toLocaleDateString()}</p></div>}
              {currentEndsAt && <div><span className="text-xs text-gray-400">Ends</span><p className="font-medium">{new Date(currentEndsAt).toLocaleDateString()}</p></div>}
            </div>
            {countdown && (
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${
                urgentCountdown ? 'bg-red-100 text-red-700 border border-red-200' :
                warnCountdown   ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                  'bg-green-100 text-green-700 border border-green-200'
              }`}>
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {countdown}
              </div>
            )}
          </div>
        )}

        {/* EXPIRED — countdown shows "Expired" */}
        {ad.status === 'EXPIRED' && currentEndsAt && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-2">
            <p className="font-semibold text-gray-600">Campaign ended</p>
            <p className="text-sm text-gray-500">Ended on {new Date(currentEndsAt).toLocaleDateString()}. Extend below to reactivate your ad.</p>
          </div>
        )}

        {/* Admin notes for non-rejection */}
        {ad.adminNotes && ad.status !== 'REJECTED' && (
          <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-2xl px-5 py-4">
            <p className="text-xs font-semibold text-gray-500 mb-1">Note from admin</p>
            <p className="text-sm text-gray-700">{ad.adminNotes}</p>
          </div>
        )}

        {/* Extend Ad section */}
        {canExtend && (
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <h2 className="font-semibold text-gray-800">{ad.status === 'EXPIRED' ? 'Reactivate Your Ad' : 'Extend Your Ad'}</h2>
            </div>

            {extendSuccess ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center space-y-2">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="font-semibold text-green-700">Ad extended successfully!</p>
                {currentEndsAt && (
                  <p className="text-sm text-green-600">New end date: <strong>{new Date(currentEndsAt).toLocaleDateString()}</strong></p>
                )}
                <button onClick={() => { setExtendSuccess(false); setExtendPayStep('idle'); setExtendError('') }}
                  className="text-xs text-indigo-600 hover:underline mt-1">Extend again</button>
              </div>
            ) : extendPayStep === 'polling' ? (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center space-y-3">
                <p className="font-medium text-blue-800">STK push sent to {extendPhone}</p>
                <p className="text-blue-600 text-sm">Enter your M-Pesa PIN on your phone to complete</p>
                <span className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin block mx-auto" />
                <p className="text-xs text-blue-500">Waiting for confirmation…</p>
              </div>
            ) : extendPayStep === 'done' ? (
              <div className="flex items-center justify-center gap-2 py-4 text-green-600">
                <span className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Processing extension…</span>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Additional days</p>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {EXTEND_OPTIONS.map(d => (
                      <button key={d} type="button" onClick={() => setExtendDays(d)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${extendDays === d ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                        +{d}d
                      </button>
                    ))}
                    <input type="number" min={1} max={90} value={extendDays}
                      onChange={e => setExtendDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                      className="w-20 text-center border-2 border-gray-200 rounded-xl px-2 py-2 text-sm font-semibold focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
                    <span className="text-indigo-700">{extendDays} days × KSh {ad.packagePricePerDay.toLocaleString()}/day</span>
                    <span className="font-extrabold text-indigo-900 text-lg">KSh {extendCost.toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">M-Pesa Number</label>
                  <input type="tel" value={extendPhone} onChange={e => setExtendPhone(e.target.value)}
                    placeholder="e.g. 0712345678"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>

                {extendError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{extendError}</p>}

                <button onClick={handleExtendPay} disabled={extendPayStep === 'initiating'}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm transition-colors">
                  {extendPayStep === 'initiating' ? 'Sending STK push…' : `Pay KSh ${extendCost.toLocaleString()} to Extend`}
                </button>

                {extendPayStep === 'failed' && (
                  <button onClick={() => { setExtendPayStep('idle'); setExtendError('') }}
                    className="w-full border border-gray-300 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50">
                    Try Again
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Details */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-3">Ad Details</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-xs text-gray-400">Submitted</span><p className="font-medium">{new Date(ad.createdAt).toLocaleDateString()}</p></div>
            <div><span className="text-xs text-gray-400">Invoice</span><p className="font-bold text-indigo-700">{ad.invoiceAmount ? `KSh ${ad.invoiceAmount.toLocaleString()}` : '—'}</p></div>
            <div><span className="text-xs text-gray-400">Targeting</span><p className="font-medium capitalize">{ad.target.toLowerCase()}</p></div>
            <div><span className="text-xs text-gray-400">Positions</span><p className="font-medium">{ad.positions.join(', ')}</p></div>
          </div>
        </div>

        {/* Payment history */}
        {ad.payments.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-3">Payment History</h2>
            {ad.payments.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.status === 'success' ? 'bg-green-100 text-green-700' : p.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                  {p.mpesaRef && <span className="text-gray-500 font-mono text-xs">{p.mpesaRef}</span>}
                </div>
                {p.amount && <span className="text-gray-700 font-medium">KSh {p.amount.toLocaleString()}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Share status link */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2">
          <p className="text-xs text-gray-500 font-medium">Your status page link</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-600 flex-1 break-all">{statusUrl}</span>
            <CopyButton text={statusUrl} />
          </div>
        </div>

        <div className="text-center">
          <a href="/ads/submit" className="text-sm text-indigo-600 hover:underline">Submit another ad</a>
        </div>
      </div>
    </div>
  )
}

export default function AdPayPage({ params }: { params: Promise<{ id: string }> }) {
  const [ad, setAd] = useState<AdInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    params.then(p => {
      getAdById(p.id).then(a => { setAd(a); setLoading(false) })
    })
  }, [params])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!ad) return <StatusLookup />
  return <AdStatus ad={ad} />
}
