'use client'

import { useState, useTransition } from 'react'
import {
  reviewNeedRequest, addNeedRequestUpdate, markNeedRequestAwaiting,
  type NeedRequestInfo, type NeedUpdateInfo,
} from '@/app/market/actions'

const COMM_LABEL: Record<string, string> = {
  sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email', call: 'Call',
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  SUBMITTED:          { label: 'Pending Review',       cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  REVIEWED:           { label: 'Awaiting Payment',     cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  PAID:               { label: 'Paid',                 cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  IN_PROGRESS:        { label: 'In Progress',          cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  AWAITING_FEEDBACK:  { label: 'Awaiting Confirmation', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  DELIVERED:          { label: 'Delivered',            cls: 'bg-green-100 text-green-700 border-green-200' },
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500 border-gray-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${m.cls}`}>
      {m.label}
    </span>
  )
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

/* ── Review tab (SUBMITTED / REVIEWED) ──────────────────────────── */

function ReviewTab({
  req, onDone, onClose,
}: { req: NeedRequestInfo; onDone: () => void; onClose: () => void }) {
  const [, start] = useTransition()
  const [comments, setComments] = useState(req.agentComments ?? '')
  const [amount, setAmount] = useState(req.requestedAmount?.toString() ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function save() {
    const amt = parseInt(amount, 10)
    if (!comments.trim()) { setError('Please write a message for the user.'); return }
    if (!amt || amt <= 0)  { setError('Please enter a valid service fee.'); return }
    setError('')
    setSaving(true)
    start(async () => {
      const res = await reviewNeedRequest(req.id, comments, amt)
      setSaving(false)
      if (res.success) { onDone(); onClose() }
      else setError(res.error)
    })
  }

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Customer request</p>
        <p>{req.description}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message to customer</label>
        <textarea rows={5} value={comments} onChange={(e) => setComments(e.target.value)}
          placeholder="Describe what you found, availability, next steps…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Service fee (KES)</label>
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 500"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent" />
      </div>
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
      <button onClick={save} disabled={saving}
        className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
        {saving ? 'Saving…' : req.status === 'SUBMITTED' ? 'Send & Request Payment' : 'Update Message'}
      </button>
    </div>
  )
}

/* ── Tracking tab (PAID / IN_PROGRESS / AWAITING / DELIVERED) ───── */

function TrackingTab({
  req, onDone,
}: { req: NeedRequestInfo; onDone: () => void }) {
  const [, start] = useTransition()
  const [msg, setMsg] = useState('')
  const [adding, setAdding] = useState(false)
  const [awaiting, setAwaiting] = useState(false)
  const [error, setError] = useState('')

  function addUpdate() {
    if (!msg.trim()) { setError('Update message cannot be empty.'); return }
    setError('')
    setAdding(true)
    start(async () => {
      const res = await addNeedRequestUpdate(req.id, msg.trim())
      setAdding(false)
      if (res.success) { setMsg(''); onDone() }
      else setError(res.error)
    })
  }

  function markAwaiting() {
    if (!confirm('Mark as "Delivered — Awaiting Customer Confirmation"?')) return
    setAwaiting(true)
    start(async () => {
      await markNeedRequestAwaiting(req.id)
      setAwaiting(false)
      onDone()
    })
  }

  const canMarkAwaiting = ['PAID', 'IN_PROGRESS'].includes(req.status) && req.updates.length > 0

  return (
    <div className="space-y-4 px-5 py-4">
      {/* Tracking number */}
      {req.trackingNumber && (
        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
          <div>
            <p className="text-xs text-gray-400 font-medium">Tracking Number</p>
            <p className="font-mono font-bold text-gray-900 tracking-widest">{req.trackingNumber}</p>
          </div>
          <a href={`/track/${req.trackingNumber}`} target="_blank" rel="noopener noreferrer"
            className="text-xs text-indigo-600 hover:underline font-medium">
            View public page ↗
          </a>
        </div>
      )}

      {/* Existing updates */}
      {req.updates.length > 0 ? (
        <ol className="relative border-l-2 border-gray-100 space-y-0 ml-2">
          {req.updates.map((u: NeedUpdateInfo, i: number) => (
            <li key={u.id} className="ml-5 pb-5 last:pb-0">
              <span className={`absolute -left-2.25 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${i === req.updates.length - 1 ? 'bg-indigo-500' : 'bg-gray-300'}`} />
              <p className="text-sm text-gray-800">{u.message}</p>
              <p className="text-xs text-gray-400 mt-0.5">{fmtTime(u.createdAt)}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-gray-400 text-center py-2">No updates yet. Add the first one below.</p>
      )}

      {/* Delivered feedback */}
      {req.status === 'DELIVERED' && req.clientFeedback && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-1">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Customer feedback</p>
          <p className="text-sm text-green-900">{req.clientFeedback}</p>
        </div>
      )}

      {/* Add update form — only while active */}
      {!['AWAITING_FEEDBACK', 'DELIVERED'].includes(req.status) && (
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <label className="block text-sm font-medium text-gray-700">Add tracking update</label>
          <textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)}
            placeholder="e.g. Agent deployed to Ruiru. Viewing houses now."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none" />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button onClick={addUpdate} disabled={adding}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
              {adding ? 'Adding…' : 'Add Update'}
            </button>
            {canMarkAwaiting && (
              <button onClick={markAwaiting} disabled={awaiting}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                {awaiting ? '…' : 'Mark Delivered →'}
              </button>
            )}
          </div>
        </div>
      )}

      {req.status === 'AWAITING_FEEDBACK' && (
        <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-center">
          Waiting for customer to confirm receipt on the tracking page.
        </p>
      )}
    </div>
  )
}

/* ── Modal ───────────────────────────────────────────────────────── */

function RequestModal({
  req, onClose, onDone,
}: { req: NeedRequestInfo; onClose: () => void; onDone: () => void }) {
  const showTracking = ['PAID', 'IN_PROGRESS', 'AWAITING_FEEDBACK', 'DELIVERED'].includes(req.status)
  const showReview   = ['SUBMITTED', 'REVIEWED'].includes(req.status)
  const [tab, setTab] = useState<'review' | 'tracking'>(showTracking ? 'tracking' : 'review')

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
      onClick={handleBackdrop}>
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900">{req.name}</p>
            <p className="text-xs text-gray-400">{COMM_LABEL[req.commMethod] ?? req.commMethod} · {req.phone}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={req.status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1">×</button>
          </div>
        </div>

        {/* Tab bar — show both tabs when PAID+ so agent can still edit review */}
        {showTracking && (
          <div className="flex border-b border-gray-100">
            <button onClick={() => setTab('tracking')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === 'tracking' ? 'text-indigo-700 border-b-2 border-indigo-600 -mb-px' : 'text-gray-500 hover:text-gray-800'}`}>
              Tracking
            </button>
            <button onClick={() => setTab('review')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === 'review' ? 'text-indigo-700 border-b-2 border-indigo-600 -mb-px' : 'text-gray-500 hover:text-gray-800'}`}>
              Review / Message
            </button>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {tab === 'tracking' && showTracking && (
            <TrackingTab req={req} onDone={onDone} />
          )}
          {(tab === 'review' || showReview) && (
            <ReviewTab req={req} onDone={onDone} onClose={onClose} />
          )}
        </div>

      </div>
    </div>
  )
}

/* ── Panel ───────────────────────────────────────────────────────── */

const FILTER_OPTIONS = [
  { value: '',                  label: 'All' },
  { value: 'SUBMITTED',         label: 'Pending Review' },
  { value: 'REVIEWED',          label: 'Awaiting Payment' },
  { value: 'PAID',              label: 'Paid' },
  { value: 'IN_PROGRESS',       label: 'In Progress' },
  { value: 'AWAITING_FEEDBACK', label: 'Awaiting Confirmation' },
  { value: 'DELIVERED',         label: 'Delivered' },
]

export default function NeedRequestsPanel({
  requests,
  onDone,
}: {
  requests: NeedRequestInfo[]
  onDone: () => void
}) {
  const [filter, setFilter] = useState('')
  const [reviewing, setReviewing] = useState<NeedRequestInfo | null>(null)

  const visible = filter ? requests.filter((r) => r.status === filter) : requests

  const counts = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  const pendingCount = (counts['SUBMITTED'] ?? 0) + (counts['PAID'] ?? 0)

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-gray-900">Need Requests</h2>
            <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">{requests.length}</span>
            {pendingCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-semibold">
                {pendingCount} need attention
              </span>
            )}
          </div>
          {/* Filter chips */}
          <div className="flex gap-1 flex-wrap">
            {FILTER_OPTIONS.map((o) => (
              <button key={o.value} onClick={() => setFilter(o.value)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${filter === o.value ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {o.label}{o.value && counts[o.value] ? ` (${counts[o.value]})` : ''}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No requests found.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((r) => (
              <li key={r.id}>
                <button onClick={() => setReviewing(r)}
                  className="w-full flex items-start justify-between gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-gray-800">{r.name}</p>
                    <p className="text-xs text-gray-500 truncate">{r.description}</p>
                    <p className="text-xs text-gray-400">
                      {COMM_LABEL[r.commMethod] ?? r.commMethod} · {r.phone} · {new Date(r.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    {r.updates.length > 0 && (
                      <p className="text-xs text-indigo-500 font-medium">{r.updates.length} update{r.updates.length !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusBadge status={r.status} />
                    {r.requestedAmount && (
                      <span className="text-xs font-semibold text-green-700">KES {r.requestedAmount.toLocaleString()}</span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {reviewing && (
        <RequestModal
          req={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => { onDone(); setReviewing(null) }}
        />
      )}
    </>
  )
}
