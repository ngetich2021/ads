'use client'

import { useState, useEffect, useTransition, useCallback, useRef } from 'react'
import { submitToChallenge, lookupSubmission, submitNewChallenge, getOrganizerMonitor } from './actions'
import type { PublicChallengeInfo, PlatformConfig, RangeEntry, SubmissionInfo, CountyInfo } from './actions'

/* ── Calculator helpers ──────────────────────────────────────────── */

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
function organizerCost(win: number): number { const w = Math.ceil(win * 1.15); return w + mpesaCharge(w) }
function rangesCost(ranges: RangeEntry[]): number {
  return ranges.reduce((s, r) => s + organizerCost(r.amount) * r.count, 0)
}
function totalChallengeCost(configs: PlatformConfig[]): number {
  return configs.reduce((s, c) => s + rangesCost(c.ranges), 0)
}

/* ── Platform helpers ────────────────────────────────────────────── */

const PLATFORM_LABELS: Record<string, string> = { ig: 'Instagram', x: 'X / Twitter', tiktok: 'TikTok', fb: 'Facebook' }
const PLATFORMS = [
  { id: 'ig', label: 'Instagram' },
  { id: 'x', label: 'X / Twitter' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'fb', label: 'Facebook' },
]

const CLIENT_URL_PATTERNS: Record<string, RegExp> = {
  ig:     /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\//i,
  x:      /^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i,
  tiktok: /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\//i,
  fb:     /^https?:\/\/(www\.)?(facebook\.com|fb\.com|fb\.watch)\//i,
}

function platformLabel(p: string) { return PLATFORM_LABELS[p] ?? p.toUpperCase() }
function fmtDT(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

/* ── Countdown timer ─────────────────────────────────────────────── */

function useCountdown(isoTarget: string) {
  const calc = useCallback(() => {
    const diff = new Date(isoTarget).getTime() - Date.now()
    if (diff <= 0) return null
    const s = Math.floor(diff / 1000)
    return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 }
  }, [isoTarget])
  const [left, setLeft] = useState(calc)
  useEffect(() => { const id = setInterval(() => setLeft(calc()), 1000); return () => clearInterval(id) }, [calc])
  return left
}

function Countdown({ isoTarget }: { isoTarget: string }) {
  const left = useCountdown(isoTarget)
  if (!left) return <span className="text-xs font-bold text-red-500">Closed</span>
  const parts = []
  if (left.days > 0) parts.push(`${left.days}d`)
  if (left.hours > 0 || left.days > 0) parts.push(`${left.hours}h`)
  parts.push(`${left.minutes}m`)
  parts.push(`${String(left.seconds).padStart(2, '0')}s`)
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-xs font-bold text-amber-600">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse inline-block mr-0.5" />
      {parts.join(' ')}
    </span>
  )
}

function StatusBadge({ status }: { status: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
  const cfg = { PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-700 border-amber-200' }, APPROVED: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }, REJECTED: { label: 'Rejected', cls: 'bg-red-100 text-red-600 border-red-200' } }[status]
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${cfg.cls}`}>{cfg.label}</span>
}

/* ── Payment schedule (collapsible) ─────────────────────────────── */

type DraftRange = { count: string; amount: string }
type PlatformDraft = { targetCount: string; ranges: DraftRange[] }

function buildRows(draft: PlatformDraft) {
  const tc = parseInt(draft.targetCount) || 0
  const valid = draft.ranges.map((r) => ({ count: parseInt(r.count) || 0, amount: parseInt(r.amount) || 0 })).filter((r) => r.count > 0 && r.amount > 0)
  let cursor = 0
  const rows = valid.map((r) => { const s = cursor + 1; cursor += r.count; return { start: s, end: cursor, ...r, costEach: organizerCost(r.amount), total: organizerCost(r.amount) * r.count } })
  return { tc, rows, rangeSum: valid.reduce((s, r) => s + r.count, 0), subtotal: rows.reduce((s, r) => s + r.total, 0) }
}

function RangeTable({ rows }: { rows: { start: number; end: number; count: number; amount: number; costEach: number; total: number }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="bg-gray-50 text-gray-500 uppercase tracking-wider">
          <th className="text-left px-2 py-1.5">Position</th>
          <th className="text-right px-2 py-1.5">Winners</th>
          <th className="text-right px-2 py-1.5">Prize each</th>
          <th className="text-right px-2 py-1.5">Cost each*</th>
          <th className="text-right px-2 py-1.5">Subtotal</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={i} className="text-gray-700">
              <td className="px-2 py-1.5 font-mono">{r.start}–{r.end}</td>
              <td className="px-2 py-1.5 text-right font-semibold">{r.count}</td>
              <td className="px-2 py-1.5 text-right">KSh {r.amount.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right text-violet-700 font-semibold">KSh {r.costEach.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right font-bold text-indigo-700">KSh {r.total.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PaymentSchedule({ platformDrafts, platforms }: { platformDrafts: Record<string, PlatformDraft>; platforms: string[] }) {
  const [open, setOpen] = useState(false)
  const data = platforms.filter((p) => platformDrafts[p]).map((p) => ({ p, ...buildRows(platformDrafts[p]) }))
  if (data.every((d) => d.rows.length === 0) || platforms.length === 0) return null
  const grandTotal = data.reduce((s, d) => s + d.subtotal, 0)

  return (
    <div className="rounded-xl border border-indigo-200 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 transition-colors text-sm font-semibold text-indigo-700">
        <span className="flex items-center gap-2">
          <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          View Payment Schedule
        </span>
        <span className="text-xs font-bold text-indigo-600">Total: KSh {grandTotal.toLocaleString()}</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-white space-y-4">
          {data.map(({ p, tc, rows, rangeSum, subtotal }) => (
            <div key={p} className="space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">{platformLabel(p)}</span>
                <div className="flex gap-3 text-xs">
                  <span className="text-gray-500">Target: <strong>{tc.toLocaleString()}</strong></span>
                  {tc > 0 && <span className={rangeSum === tc ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>{rangeSum === tc ? `✓ covers ${tc}` : `covers ${rangeSum}/${tc}`}</span>}
                  <span className="font-bold text-indigo-600">KSh {subtotal.toLocaleString()}</span>
                </div>
              </div>
              {rows.length > 0 && <RangeTable rows={rows} />}
            </div>
          ))}
          <div className={`rounded-lg px-3 py-2 flex items-center justify-between ${platforms.length > 1 ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50'}`}>
            <span className="text-xs font-black text-indigo-800">{platforms.length > 1 ? `Grand Total (${platforms.length} platforms)` : 'Grand Total'}</span>
            <span className="text-sm font-black text-indigo-800">KSh {grandTotal.toLocaleString()}</span>
          </div>
          <p className="text-xs text-gray-400">*Cost includes 15% fee + M-Pesa send-money charge per winner</p>
        </div>
      )}
    </div>
  )
}

/* ── Target / Region picker ──────────────────────────────────────── */

function RegionPicker({ counties, defaultTarget = 'NATIONAL', defaultIds = [] }: {
  counties: CountyInfo[]; defaultTarget?: 'NATIONAL' | 'REGIONAL'; defaultIds?: string[]
}) {
  const [target, setTarget] = useState<'NATIONAL' | 'REGIONAL'>(defaultTarget)
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-gray-500">Region <span className="text-red-400">*</span></label>
      <div className="flex gap-4">
        {(['NATIONAL', 'REGIONAL'] as const).map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="target" value={opt} checked={target === opt} onChange={() => setTarget(opt)} className="accent-violet-600" />
            <span className="text-sm text-gray-700 font-medium">{opt === 'NATIONAL' ? 'National (all counties)' : 'Regional (specific counties)'}</span>
          </label>
        ))}
      </div>
      {target === 'REGIONAL' && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 mt-1">
          <p className="text-xs font-semibold text-gray-500 mb-2">Select counties <span className="text-red-400">*</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
            {counties.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" name="targetCountyIds" value={c.id} defaultChecked={defaultIds.includes(c.id)} className="accent-violet-600 rounded" />
                <span className="text-xs text-gray-700 truncate">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── STK Push payment flow ───────────────────────────────────────── */

type PayStep = 'idle' | 'pushing' | 'waiting' | 'failed'

function useStkPush() {
  const [step, setStep] = useState<PayStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkoutIdRef = useRef<string | null>(null)

  const clear = () => {
    if (pollRef.current) clearTimeout(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const pay = useCallback(async (phone: string, amount: number, ref: string, onSuccess: () => Promise<void>) => {
    setError(null)
    setElapsed(0)
    setStep('pushing')
    checkoutIdRef.current = null

    let checkoutId: string
    try {
      const res = await fetch('/api/mpesa/stk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, amount, ref }),
      })
      const data = await res.json() as { checkoutId?: string; error?: string }
      if (!res.ok || !data.checkoutId) { setStep('failed'); setError(data.error ?? 'STK push failed'); return }
      checkoutId = data.checkoutId
      checkoutIdRef.current = checkoutId
    } catch {
      setStep('failed'); setError('Network error — could not initiate payment'); return
    }

    setStep('waiting')
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)

    const poll = async (attempt: number) => {
      if (attempt > 45) {
        clear(); setStep('failed'); setError('Payment timed out. Please try again.')
        return
      }
      try {
        const res = await fetch(`/api/mpesa/stk/${checkoutId}`)
        const data = await res.json() as { status: string; reason?: string }
        if (data.status === 'success') {
          clear(); await onSuccess(); return
        }
        if (data.status === 'cancelled') {
          clear(); setStep('failed'); setError('Payment cancelled. Please try again.'); return
        }
        if (data.status === 'failed') {
          clear(); setStep('failed'); setError(data.reason ?? 'Payment failed'); return
        }
      } catch { /* keep polling */ }
      pollRef.current = setTimeout(() => poll(attempt + 1), 2000)
    }
    pollRef.current = setTimeout(() => poll(0), 2000)
  }, [])

  const reset = useCallback(() => { clear(); setStep('idle'); setError(null); setElapsed(0) }, [])

  useEffect(() => () => clear(), [])

  return { step, error, elapsed, pay, reset, checkoutIdRef }
}

/* ── Create Challenge Modal ──────────────────────────────────────── */

function PlatformRangeSection({ platform, draft, onChange }: {
  platform: string
  draft: PlatformDraft
  onChange: (d: PlatformDraft) => void
}) {
  const tc = parseInt(draft.targetCount) || 0
  const rangeSum = draft.ranges.reduce((s, r) => s + (parseInt(r.count) || 0), 0)
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-violet-600 text-white px-3 py-0.5 text-xs font-bold">{platformLabel(platform)}</span>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">
          Target participants on {platformLabel(platform)} <span className="text-red-400">*</span>
        </label>
        <input type="number" min={1} placeholder="e.g. 400" value={draft.targetCount}
          onChange={(e) => onChange({ ...draft, targetCount: e.target.value })} className={ic} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-500">
            Prize ranges <span className="text-red-400">*</span>
            {tc > 0 && <span className={`ml-2 font-semibold ${rangeSum === tc ? 'text-emerald-600' : 'text-red-500'}`}>
              {rangeSum === tc ? `✓ covers ${tc}` : `covers ${rangeSum}/${tc}`}
            </span>}
          </label>
          <button type="button" onClick={() => onChange({ ...draft, ranges: [...draft.ranges, { count: '', amount: '' }] })}
            className="text-xs text-violet-600 font-semibold hover:text-violet-800">+ Add range</button>
        </div>
        {draft.ranges.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
              <span className="text-xs text-gray-400">Top</span>
              <input type="number" min={1} placeholder="100" value={r.count}
                onChange={(e) => onChange({ ...draft, ranges: draft.ranges.map((x, j) => j === i ? { ...x, count: e.target.value } : x) })}
                className="w-16 text-sm font-semibold outline-none bg-transparent text-gray-800" />
              <span className="text-xs text-gray-400">→ KSh</span>
              <input type="number" min={1} placeholder="500" value={r.amount}
                onChange={(e) => onChange({ ...draft, ranges: draft.ranges.map((x, j) => j === i ? { ...x, amount: e.target.value } : x) })}
                className="flex-1 text-sm font-semibold outline-none bg-transparent text-gray-800" />
              <span className="text-xs text-gray-400">each</span>
            </div>
            {draft.ranges.length > 1 && (
              <button type="button" onClick={() => onChange({ ...draft, ranges: draft.ranges.filter((_, j) => j !== i) })}
                className="text-red-400 hover:text-red-600 text-lg px-1">×</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CreateChallengeModal({ counties, onClose }: { counties: CountyInfo[]; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [platformDrafts, setPlatformDrafts] = useState<Record<string, PlatformDraft>>({})
  const formRef = useRef<HTMLFormElement>(null)
  const { step: payStep, error: payError, elapsed, pay, reset: resetPay, checkoutIdRef: _checkoutIdRef } = useStkPush()

  const togglePlatform = (id: string) => {
    if (selectedPlatforms.includes(id)) {
      setSelectedPlatforms((prev) => prev.filter((p) => p !== id))
      setPlatformDrafts((prev) => { const next = { ...prev }; delete next[id]; return next })
    } else {
      setSelectedPlatforms((prev) => [...prev, id])
      setPlatformDrafts((prev) => ({ ...prev, [id]: { targetCount: '', ranges: [{ count: '', amount: '' }] } }))
    }
  }

  const totalCost = selectedPlatforms.reduce((sum, p) => {
    const draft = platformDrafts[p]; if (!draft) return sum
    return sum + draft.ranges.reduce((s, r) => {
      const count = parseInt(r.count) || 0; const amount = parseInt(r.amount) || 0
      return count > 0 && amount > 0 ? s + organizerCost(amount) * count : s
    }, 0)
  }, 0)

  const handlePay = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault(); setFormError(null)
    if (selectedPlatforms.length === 0) { setFormError('Select at least one platform.'); return }
    for (const p of selectedPlatforms) {
      const draft = platformDrafts[p]; const label = platformLabel(p)
      if (!draft || !parseInt(draft.targetCount)) { setFormError(`Enter a target count for ${label}.`); return }
      const tc = parseInt(draft.targetCount)
      const rangeSum = draft.ranges.reduce((s, r) => s + (parseInt(r.count) || 0), 0)
      if (rangeSum !== tc) { setFormError(`${label}: ranges (${rangeSum}) must equal target (${tc}).`); return }
    }
    if (totalCost < 1) { setFormError('Add at least one valid prize range.'); return }
    const form = formRef.current!
    const tel = (form.elements.namedItem('tel') as HTMLInputElement).value
    const orgName = (form.elements.namedItem('orgName') as HTMLInputElement).value
    pay(tel, totalCost, orgName, async () => {
      const formData = new FormData(form)
      selectedPlatforms.forEach((p) => {
        formData.append('platforms', p)
        const draft = platformDrafts[p]; if (!draft) return
        formData.set(`pc_${p}_targetCount`, draft.targetCount)
        draft.ranges.forEach((r) => { formData.append(`pc_${p}_rangeCount`, r.count); formData.append(`pc_${p}_rangeAmount`, r.amount) })
      })
      // Pass payment metadata so server action links the record atomically
      if (_checkoutIdRef.current) formData.set('_checkoutId', _checkoutIdRef.current)
      formData.set('_payerPhone', tel)
      formData.set('_paidAmount', String(totalCost))
      await new Promise<void>((resolve, reject) => {
        startTransition(async () => {
          const result = await submitNewChallenge(formData)
          if (result.success && result.challengeId) { setDone(result.challengeId); resolve() }
          else reject(new Error(result.success ? 'Unknown error' : result.error))
        })
      })
    })
  }

  const [minDT] = useState(() => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16))

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl p-6 space-y-5 text-center">
        <div className="text-5xl">🎉</div>
        <p className="text-xl font-black text-gray-800">Payment Received!</p>
        <p className="text-sm text-gray-500">Your challenge has been submitted and is awaiting admin review.</p>
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-2 text-xs text-gray-400 font-mono">{done}</div>
        <button onClick={onClose} className="w-full rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 py-2.5 text-sm font-bold text-white">Done</button>
      </div>
    </div>
  )

  if (payStep === 'waiting' || payStep === 'pushing') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-8 text-center space-y-5">
        <div className="text-5xl animate-bounce">📱</div>
        {payStep === 'pushing' ? (
          <><p className="text-base font-bold text-gray-800">Sending M-Pesa prompt…</p><p className="text-sm text-gray-500">Please wait</p></>
        ) : (
          <><p className="text-base font-bold text-gray-800">Check your phone</p>
          <p className="text-sm text-gray-500">Complete the M-Pesa payment of <strong className="text-indigo-700">KSh {totalCost.toLocaleString()}</strong> when prompted.</p>
          <div className="font-mono text-xs text-gray-400">{elapsed}s elapsed…</div></>
        )}
        <div className="flex gap-1 justify-center">
          {[0,1,2].map((i) => <span key={i} className="h-2 w-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
        <button onClick={() => { resetPay(); setFormError('Payment cancelled.') }} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Cancel</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs text-white/60 uppercase tracking-widest">New Challenge</p>
            <p className="text-sm font-bold text-white mt-0.5">Create a Social Media Challenge</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 text-lg">×</button>
        </div>

        <form ref={formRef} onSubmit={handlePay} className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Organization / Name <span className="text-red-400">*</span></label>
              <input type="text" name="orgName" required placeholder="e.g. Nairobi Traders Ltd" className={ic} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Your Phone (M-Pesa payment) <span className="text-red-400">*</span></label>
              <input type="tel" name="tel" required placeholder="07XXXXXXXX" pattern="^(07|01)\d{8}$" maxLength={10} className={ic} />
              <p className="text-xs text-gray-400">STK push will be sent here</p>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Challenge Description <span className="text-red-400">*</span></label>
            <input type="text" name="description" required placeholder="e.g. Repost our product launch for a chance to win!" className={ic} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Repost / Action URL <span className="text-red-400">*</span></label>
            <input type="url" name="repostUrl" required placeholder="https://tiktok.com/@account/video/..." className={ic} />
            <p className="text-xs text-gray-400">The post participants must share/repost.</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Platforms <span className="text-red-400">*</span></label>
            <p className="text-xs text-gray-400">Select each platform — you ll set separate targets and prizes per platform.</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {PLATFORMS.map((p) => (
                <button key={p.id} type="button" onClick={() => togglePlatform(p.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${selectedPlatforms.includes(p.id) ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-violet-300'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Per-platform target + ranges */}
          {selectedPlatforms.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              Select at least one platform above to configure targets and prize ranges.
            </p>
          ) : (
            <div className="space-y-3">
              {selectedPlatforms.map((p) => (
                <PlatformRangeSection key={p} platform={p} draft={platformDrafts[p] ?? { targetCount: '', ranges: [{ count: '', amount: '' }] }}
                  onChange={(d) => setPlatformDrafts((prev) => ({ ...prev, [p]: d }))} />
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">M-Pesa No. (winners paid here) <span className="text-red-400">*</span></label>
            <input type="tel" name="mpesaNo" required placeholder="07XXXXXXXX" pattern="^(07|01)\d{8}$" maxLength={10} className={ic} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Submission Deadline <span className="text-red-400">*</span></label>
              <input type="datetime-local" name="closingTime" required min={minDT} className={ic} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Results &amp; Payment By <span className="text-red-400">*</span></label>
              <input type="datetime-local" name="paymentTime" required min={minDT} className={ic} />
            </div>
          </div>

          <PaymentSchedule platformDrafts={platformDrafts} platforms={selectedPlatforms} />
          <RegionPicker counties={counties} />

          {(formError || payError) && (
            <p className="text-xs text-red-500 font-medium">{formError ?? payError}</p>
          )}

          <button type="submit" disabled={isPending}
            className="w-full rounded-xl bg-linear-to-r from-emerald-600 to-teal-600 py-3 text-sm font-bold text-white disabled:opacity-60 hover:from-emerald-500 hover:to-teal-500 transition-all">
            {isPending ? 'Saving…' : totalCost > 0 ? `Pay KSh ${totalCost.toLocaleString()} & Submit` : 'Submit Challenge'}
          </button>
          <p className="text-xs text-gray-400 text-center">M-Pesa STK push will be sent to your phone. Complete payment to activate your challenge.</p>
        </form>
      </div>
    </div>
  )
}

/* ── Submission Modal ────────────────────────────────────────────── */

function SubmissionModal({ challenge, onClose }: { challenge: PublicChallengeInfo; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<'submit' | 'lookup' | 'monitor'>('submit')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [lookupMpesa, setLookupMpesa] = useState('')
  const [lookupResult, setLookupResult] = useState<({ found: false } | { found: true; submissions: SubmissionInfo[] }) | null>(null)
  const [lookupPending, startLookup] = useTransition()
  const [monitorMpesa, setMonitorMpesa] = useState('')
  const [monitorResult, setMonitorResult] = useState<({ authorized: false } | { authorized: true; submissions: SubmissionInfo[] }) | null>(null)
  const [monitorPending, startMonitor] = useTransition()
  const isClosed = new Date(challenge.closingTime) <= new Date()

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Validate each platform URL before submitting
    for (const p of challenge.platforms) {
      const el = e.currentTarget.elements.namedItem(`url_${p}`) as HTMLInputElement | null
      const url = el?.value.trim() ?? ''
      if (!url) { setError(`Enter your ${platformLabel(p)} post URL.`); return }
      const pat = CLIENT_URL_PATTERNS[p]
      if (pat && !pat.test(url)) { setError(`${platformLabel(p)}: URL doesn't look like a valid link.`); return }
    }
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set('challengeId', challenge.id)
    formData.set('consent', '1')
    startTransition(async () => {
      const result = await submitToChallenge(formData)
      if (result.success) setDone(true)
      else setError(result.error)
    })
  }

  const handleLookup = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLookupResult(null)
    startLookup(async () => { setLookupResult(await lookupSubmission(challenge.id, lookupMpesa)) })
  }

  const handleMonitor = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMonitorResult(null)
    startMonitor(async () => { setMonitorResult(await getOrganizerMonitor(challenge.id, monitorMpesa)) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
        <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/60 uppercase tracking-widest">Challenge</p>
            <p className="text-sm font-bold text-white mt-0.5 line-clamp-1">{challenge.description}</p>
          </div>
          <button onClick={onClose} className="ml-3 grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 text-lg shrink-0">×</button>
        </div>

        <div className="flex border-b border-gray-200 bg-gray-50 shrink-0">
          {(['submit', 'lookup', 'monitor'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${tab === t ? 'text-violet-700 border-b-2 border-violet-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'submit' ? 'Submit Entry' : t === 'lookup' ? 'Check Status' : 'Monitor'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {tab === 'submit' && (
            isClosed ? (
              <div className="rounded-2xl bg-red-50 border border-red-200 p-5 text-center space-y-2">
                <p className="text-base font-bold text-red-700">Submissions Closed</p>
                <p className="text-sm text-red-500">The deadline for this challenge has passed.</p>
              </div>
            ) : done ? (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 text-center space-y-3">
                <div className="text-4xl">🎉</div>
                <p className="text-base font-bold text-emerald-700">Submission received!</p>
                <p className="text-sm text-emerald-600">Your entry is under review. Use <strong>Check Status</strong> with your M-Pesa number to track it.</p>
                <p className="text-xs text-gray-500">Results by: {fmtDT(challenge.paymentTime)}</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-4 text-xs text-amber-800 space-y-1.5">
                  <p className="font-bold text-amber-900">Consent &amp; Terms</p>
                  <ul className="list-disc list-inside space-y-0.5 pl-1">
                    <li>The link belongs to your account and is publicly accessible.</li>
                    <li>You have performed the required action (repost/share).</li>
                    <li>Decisions are final and binding.</li>
                    <li>Your M-Pesa number will be used to track, payments winners.</li>
                    <li>Rejected entries will be notified with a reason.</li>
                  </ul>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {challenge.platforms.map((p) => (
                    <div key={p} className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-gray-500">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[10px] font-bold uppercase">{platformLabel(p)}</span>
                          Post URL <span className="text-red-400">*</span>
                        </span>
                      </label>
                      <input type="url" name={`url_${p}`} required
                        placeholder={p === 'ig' ? 'https://instagram.com/p/...' : p === 'x' ? 'https://x.com/...' : p === 'tiktok' ? 'https://tiktok.com/@...' : 'https://facebook.com/...'}
                        className={ic} />
                    </div>
                  ))}

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500">M-Pesa Number <span className="text-red-400">*</span></label>
                    <input type="tel" name="mpesaNo" required placeholder="e.g. 0712345678"
                      pattern="^(07|01)\d{8}$" maxLength={10} className={ic} />
                    <p className="text-xs text-gray-400">Used to track and pay winners. Format: 07XXXXXXXX or 01XXXXXXXX.</p>
                  </div>

                  <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-600">
                    <p>Closes: <span className="font-semibold text-gray-800">{fmtDT(challenge.closingTime)}</span></p>
                    <p className="mt-0.5">Results: <span className="font-semibold text-gray-800">{fmtDT(challenge.paymentTime)}</span></p>
                  </div>

                  {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

                  <button type="submit" disabled={isPending}
                    className="w-full rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-60 transition-all hover:from-violet-500 hover:to-indigo-500">
                    {isPending ? 'Submitting…' : 'I agree & Submit Entry'}
                  </button>
                </form>
              </>
            )
          )}

          {tab === 'lookup' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Enter your M-Pesa number to check your submission status.</p>
              <form onSubmit={handleLookup} className="flex gap-2">
                <input type="tel" value={lookupMpesa} onChange={(e) => setLookupMpesa(e.target.value)}
                  placeholder="07XXXXXXXX" maxLength={10} className={`flex-1 ${ic}`} />
                <button type="submit" disabled={lookupPending}
                  className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60 whitespace-nowrap">
                  {lookupPending ? '…' : 'Check'}
                </button>
              </form>

              {lookupResult && (
                lookupResult.found === false ? (
                  <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-500 text-center">
                    No submission found for this number.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lookupResult.submissions.map((sub) => (
                      <div key={sub.id} className={`rounded-xl border px-4 py-3 space-y-1.5 ${sub.status === 'APPROVED' ? 'bg-emerald-50 border-emerald-200' : sub.status === 'REJECTED' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-center justify-between">
                          <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[10px] font-bold uppercase">{platformLabel(sub.platform)}</span>
                          <StatusBadge status={sub.status} />
                        </div>
                        <a href={sub.submitUrl} target="_blank" rel="noopener noreferrer" className="block text-xs text-indigo-600 underline truncate">{sub.submitUrl}</a>
                        {sub.status === 'REJECTED' && sub.rejectReason && (
                          <p className="text-xs text-red-600 font-medium">Reason: {sub.rejectReason}</p>
                        )}
                        {sub.status === 'APPROVED' && (
                          <p className="text-xs text-emerald-700 font-semibold">Payment by {fmtDT(challenge.paymentTime)}</p>
                        )}
                        <p className="text-xs text-gray-400">Submitted {fmtDT(sub.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {tab === 'monitor' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800 space-y-1">
                <p className="font-bold text-blue-900">Organizer Monitor</p>
                <p>Enter the <strong>M-Pesa number used as the winners payout number</strong> when you created this challenge to view all participants in real time.</p>
              </div>
              <form onSubmit={handleMonitor} className="flex gap-2">
                <input type="tel" value={monitorMpesa} onChange={(e) => setMonitorMpesa(e.target.value)}
                  placeholder="07XXXXXXXX (winners M-Pesa)" maxLength={10} className={`flex-1 ${ic}`} />
                <button type="submit" disabled={monitorPending}
                  className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60 whitespace-nowrap">
                  {monitorPending ? '…' : 'View'}
                </button>
              </form>

              {monitorResult && (
                monitorResult.authorized === false ? (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 text-center">
                    No challenge found with that M-Pesa number. Only the organizer can monitor.
                  </div>
                ) : monitorResult.submissions.length === 0 ? (
                  <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-500 text-center">
                    No submissions yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="font-semibold">{monitorResult.submissions.length} participant{monitorResult.submissions.length !== 1 ? 's' : ''}</span>
                      <span>{monitorResult.submissions.filter(s => s.status === 'APPROVED').length} approved · {monitorResult.submissions.filter(s => s.status === 'PENDING').length} pending · {monitorResult.submissions.filter(s => s.status === 'REJECTED').length} rejected</span>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                            <th className="text-left px-3 py-2">#</th>
                            <th className="text-left px-3 py-2">M-Pesa</th>
                            <th className="text-left px-3 py-2">Platform</th>
                            <th className="text-left px-3 py-2">Status</th>
                            <th className="text-left px-3 py-2">Submitted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {monitorResult.submissions.map((s, i) => (
                            <tr key={s.id} className="text-gray-700 hover:bg-gray-50">
                              <td className="px-3 py-2 font-mono text-gray-400">{i + 1}</td>
                              <td className="px-3 py-2 font-mono font-semibold">{s.mpesaNo}</td>
                              <td className="px-3 py-2">
                                <span className="inline-flex rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{platformLabel(s.platform)}</span>
                              </td>
                              <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                              <td className="px-3 py-2 text-gray-400">{fmtDT(s.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2">
                      <a href={`/api/challenge/${challenge.id}/results`} target="_blank"
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-100 transition-colors">
                        🖨️ View Results
                      </a>
                      <a href={`/api/challenge/${challenge.id}/participants`} download
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors">
                        📊 Export Excel
                      </a>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Price distribution breakdown ───────────────────────────────── */

function PriceDistribution({ configs }: { configs: PlatformConfig[] }) {
  let totalPrizes = 0, totalFee = 0, totalMpesa = 0, grandTotal = 0
  for (const c of configs) {
    for (const r of c.ranges) {
      const prize = r.amount * r.count
      const fee = (Math.ceil(r.amount * 1.15) - r.amount) * r.count
      const mpesa = mpesaCharge(Math.ceil(r.amount * 1.15)) * r.count
      totalPrizes += prize; totalFee += fee; totalMpesa += mpesa; grandTotal += prize + fee + mpesa
    }
  }
  if (grandTotal === 0) return null
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
      <p className="text-xs font-bold text-violet-800 uppercase tracking-wide mb-3">💰 Cost Breakdown</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: '🏆 Winner Prizes', value: totalPrizes, sub: 'Paid to winners', color: 'text-emerald-700' },
          { label: '📊 Platform Fee (15%)', value: totalFee, sub: 'Competition management', color: 'text-blue-700' },
          { label: '📱 M-Pesa Charges', value: totalMpesa, sub: 'Transaction fees', color: 'text-amber-700' },
          { label: '💳 Your Total', value: grandTotal, sub: 'Grand total charged', color: 'text-violet-800 font-black' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white rounded-lg border border-violet-100 p-3">
            <div className="text-[10px] font-semibold text-gray-500 mb-1">{label}</div>
            <div className={`text-base font-bold ${color}`}>KSh {value.toLocaleString()}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Payment & Ranges Card ───────────────────────────────────────── */

function PaymentRangesCard({ challenge, onClose }: { challenge: PublicChallengeInfo; onClose: () => void }) {
  const grandTotal = totalChallengeCost(challenge.platformConfigs)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
        <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs text-white/60 uppercase tracking-widest">Prize Ranges</p>
            <p className="text-base font-bold text-white mt-0.5 line-clamp-1">{challenge.description}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 text-lg">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {challenge.platformConfigs.map((pc) => {
            let cursor = 0
            const rows = pc.ranges.map((r) => {
              const start = cursor + 1; cursor += r.count
              return { start, end: cursor, ...r, total: organizerCost(r.amount) * r.count }
            })
            const subtotal = rows.reduce((s, r) => s + r.total, 0)
            return (
              <div key={pc.platform} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">{platformLabel(pc.platform)}</span>
                  <span className="text-xs text-gray-500">Target: <strong>{pc.targetCount.toLocaleString()}</strong> · Subtotal: <strong className="text-indigo-700">KSh {subtotal.toLocaleString()}</strong></span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-indigo-100">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-indigo-50 text-indigo-600 uppercase tracking-wider">
                      <th className="text-left px-3 py-2">Position</th>
                      <th className="text-right px-3 py-2">Winners</th>
                      <th className="text-right px-3 py-2">Prize</th>
                      <th className="text-right px-3 py-2">Total</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((r, i) => (
                        <tr key={i} className="text-gray-700">
                          <td className="px-3 py-2 font-mono">{r.start}–{r.end}</td>
                          <td className="px-3 py-2 text-right font-semibold">{r.count}</td>
                          <td className="px-3 py-2 text-right">KSh {r.amount.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-bold text-indigo-700">KSh {r.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {challenge.platformConfigs.length > 1 && (
            <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-2.5 flex justify-between items-center">
              <span className="text-xs font-black text-indigo-800">Grand Total ({challenge.platformConfigs.length} platforms)</span>
              <span className="text-sm font-black text-indigo-800">KSh {grandTotal.toLocaleString()}</span>
            </div>
          )}

          <PriceDistribution configs={challenge.platformConfigs} />

          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-600 space-y-1">
            <p>Closes: <span className="font-semibold text-gray-800">{fmtDT(challenge.closingTime)}</span></p>
            <p>Results &amp; payment by: <span className="font-semibold text-gray-800">{fmtDT(challenge.paymentTime)}</span></p>
            <p className="text-gray-400 mt-1">Winners announced via downloadable PDF only.</p>
          </div>

          <a href={`/api/challenge/${challenge.id}/results`} download
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:from-violet-500 hover:to-indigo-500 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            Download Winners PDF
          </a>
        </div>
      </div>
    </div>
  )
}

/* ── Main ChallengeTab ───────────────────────────────────────────── */

export default function ChallengeTab({ challenges, counties }: { challenges: PublicChallengeInfo[]; counties: CountyInfo[] }) {
  const [submitting, setSubmitting] = useState<PublicChallengeInfo | null>(null)
  const [viewRanges, setViewRanges] = useState<PublicChallengeInfo | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  if (challenges.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed border-gray-200 bg-white py-16 text-center px-4">
          <div className="text-5xl">🏆</div>
          <div>
            <p className="text-xl font-bold text-gray-800">No active challenges</p>
            <p className="mt-1 text-sm text-gray-500">Be the first to create one!</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:from-violet-500 hover:to-indigo-500 transition-all">
            + Create Challenge
          </button>
        </div>
        {showCreate && <CreateChallengeModal counties={counties} onClose={() => setShowCreate(false)} />}
      </>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowCreate(true)}
          className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-bold text-white hover:from-violet-500 hover:to-indigo-500 transition-all">
          + Create Challenge
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="hidden sm:grid grid-cols-[2.5rem_1fr_16rem_14rem_8rem] gap-3 bg-gray-50 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">
          <span>s/no</span><span>challenge</span><span>prizes</span><span>closes in</span><span className="text-center">enter</span>
        </div>
        <div className="sm:hidden grid grid-cols-[2rem_1fr_6rem] gap-3 bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">
          <span>s/no</span><span>challenge</span><span className="text-center">enter</span>
        </div>

        <ul>
          {challenges.map((ch, i) => {
            const closed = new Date(ch.closingTime) <= new Date()
            const total = totalChallengeCost(ch.platformConfigs)
            return (
              <li key={ch.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                {/* Desktop */}
                <div className="hidden sm:grid grid-cols-[2.5rem_1fr_16rem_14rem_8rem] gap-3 items-center px-5 py-4">
                  <span className="text-xs text-gray-400 font-mono">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{ch.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {ch.platforms.map((p) => (
                        <span key={p} className="inline-flex rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-xs text-indigo-700 font-medium">{platformLabel(p)}</span>
                      ))}
                      {ch.target === 'NATIONAL'
                        ? <span className="inline-flex rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700 font-semibold">National</span>
                        : <span className="inline-flex rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-xs text-violet-700 font-semibold">Regional</span>
                      }
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {ch.platformConfigs.map((pc) => (
                      <span key={pc.platform} className="text-xs text-gray-600">
                        <span className="font-semibold text-indigo-600">{platformLabel(pc.platform)}</span>
                        {' '}({pc.targetCount.toLocaleString()}): top {pc.ranges[0]?.count ?? 0} → KSh {pc.ranges[0]?.amount.toLocaleString() ?? '—'}
                        {pc.ranges.length > 1 && <span className="text-gray-400"> +{pc.ranges.length - 1} more</span>}
                      </span>
                    ))}
                    <button onClick={() => setViewRanges(ch)} className="mt-1 text-xs text-violet-600 underline underline-offset-2 hover:text-violet-800 text-left">
                      Pool KSh {total.toLocaleString()} →
                    </button>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Countdown isoTarget={ch.closingTime} />
                    <span className="text-xs text-gray-400">{fmtDT(ch.closingTime)}</span>
                  </div>
                  <div className="flex justify-center">
                    <button onClick={() => setSubmitting(ch)} disabled={closed}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${closed ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-linear-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500'}`}>
                      {closed ? 'Closed' : 'Submit'}
                    </button>
                  </div>
                </div>

                {/* Mobile */}
                <div className="sm:hidden grid grid-cols-[2rem_1fr_6rem] gap-3 items-start px-4 py-3.5">
                  <span className="text-xs text-gray-400 font-mono pt-0.5">{i + 1}</span>
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{ch.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {ch.platforms.map((p) => <span key={p} className="inline-flex rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{platformLabel(p)}</span>)}
                    </div>
                    <Countdown isoTarget={ch.closingTime} />
                    <button onClick={() => setViewRanges(ch)} className="text-xs text-violet-600 text-left underline">View prizes →</button>
                  </div>
                  <div className="flex justify-center">
                    <button onClick={() => setSubmitting(ch)} disabled={closed}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${closed ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-linear-to-r from-violet-600 to-indigo-600 text-white'}`}>
                      {closed ? 'Closed' : 'Submit'}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {submitting && <SubmissionModal challenge={submitting} onClose={() => setSubmitting(null)} />}
      {viewRanges && <PaymentRangesCard challenge={viewRanges} onClose={() => setViewRanges(null)} />}
      {showCreate && <CreateChallengeModal counties={counties} onClose={() => setShowCreate(false)} />}
    </>
  )
}

const ic = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all'
