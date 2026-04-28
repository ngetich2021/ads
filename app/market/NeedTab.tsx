'use client'

import { useActionState, useState } from 'react'
import { createNeedRequest, checkStatusByPhone, type NeedStatusResult } from '@/app/need/actions'

const COMM_METHODS = [
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Call' },
]

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  SUBMITTED:          { label: 'Pending Review',   cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  REVIEWED:           { label: 'Ready to Pay',     cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  PAID:               { label: 'Processing',       cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  IN_PROGRESS:        { label: 'In Progress',      cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  AWAITING_FEEDBACK:  { label: 'Confirm Receipt',  cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  DELIVERED:          { label: 'Delivered ✓',      cls: 'bg-green-100 text-green-700 border-green-200' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  )
}

/* ── Submit form ─────────────────────────────────────────────────── */

function SubmitForm() {
  const [state, formAction, pending] = useActionState(createNeedRequest, null)

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="need-name">Full Name</label>
        <input
          id="need-name" name="name" type="text" required
          placeholder="e.g. Alex Mwangi"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="need-description">Describe your need</label>
        <textarea
          id="need-description" name="description" required rows={4}
          placeholder="e.g. House hunting in Nairobi, Ruiru town. Single room, budget KES 4,000."
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none shadow-sm"
        />
      </div>

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Preferred contact method</p>
        <div className="grid grid-cols-2 gap-2">
          {COMM_METHODS.map((m) => (
            <label key={m.value} className="flex items-center gap-2.5 border border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:border-emerald-400 has-checked:border-emerald-500 has-checked:bg-emerald-50 transition-colors">
              <input type="radio" name="commMethod" value={m.value} required className="accent-emerald-600 shrink-0" />
              <span className="text-sm font-medium text-gray-700">{m.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="need-phone">Phone number</label>
        <input
          id="need-phone" name="phone" type="tel" required
          placeholder="e.g. 0712 345 678"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm"
        />
      </div>

      {state?.error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">{state.error}</p>
      )}

      <button type="submit" disabled={pending}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm transition-colors shadow-sm">
        {pending ? 'Submitting…' : 'Submit Request'}
      </button>
    </form>
  )
}

/* ── Check status form ───────────────────────────────────────────── */

function CheckStatusForm() {
  const [state, formAction, pending] = useActionState(checkStatusByPhone, null)

  return (
    <div className="space-y-5">
      <form action={formAction} className="flex gap-2">
        <input
          name="phone" type="tel" required
          placeholder="Enter your phone number"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm"
        />
        <button type="submit" disabled={pending}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors shadow-sm whitespace-nowrap">
          {pending ? '…' : 'Check'}
        </button>
      </form>

      {state?.error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">{state.error}</p>
      )}

      {state?.results && <ResultsList results={state.results} />}
    </div>
  )
}

/* ── Results list ────────────────────────────────────────────────── */

function ResultsList({ results }: { results: NeedStatusResult[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{results.length} request{results.length !== 1 ? 's' : ''} found</p>
      {results.map((r) => (
        <div key={r.id} className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Row */}
          <button
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            className="w-full flex items-start justify-between gap-3 px-4 py-4 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{r.description}</p>
              <p className="text-xs text-gray-400 mt-0.5">{new Date(r.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={r.status} />
              <span className="text-gray-400 text-xs">{expanded === r.id ? '▲' : '▼'}</span>
            </div>
          </button>

          {/* Expanded details */}
          {expanded === r.id && (
            <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3">
              {r.status === 'SUBMITTED' && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  Your request is pending agent review. You will be contacted via the method you selected.
                </p>
              )}

              {(r.status === 'REVIEWED' || r.status === 'PAID' || r.status === 'COMPLETED') && r.agentComments && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent message</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.agentComments}</p>
                </div>
              )}

              {r.status === 'REVIEWED' && r.requestedAmount && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    Service fee: <span className="font-bold text-green-700">KES {r.requestedAmount.toLocaleString()}</span>
                  </p>
                  <a href={`/need/${r.id}`}
                    className="block w-full text-center bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                    Proceed to Pay
                  </a>
                </div>
              )}

              {['PAID', 'IN_PROGRESS', 'AWAITING_FEEDBACK', 'DELIVERED'].includes(r.status) && r.trackingNumber && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Tracking number</span>
                    {r.status === 'AWAITING_FEEDBACK' && (
                      <span className="text-xs font-semibold text-orange-600 animate-pulse">Action needed</span>
                    )}
                  </div>
                  <p className="font-mono text-xl font-bold text-gray-900 tracking-widest">{r.trackingNumber}</p>
                  <a href={`/track/${r.trackingNumber}`}
                    className="block w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                    {r.status === 'AWAITING_FEEDBACK' ? 'Confirm Receipt →' : 'Track Order →'}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Main tab ────────────────────────────────────────────────────── */

export default function NeedTab() {
  const [view, setView] = useState<'submit' | 'check'>('submit')

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="max-w-lg mx-auto space-y-6">

        {/* View switcher */}
        <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
          <button onClick={() => setView('submit')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${view === 'submit' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            Submit Request
          </button>
          <button onClick={() => setView('check')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${view === 'check' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            Check Status
          </button>
        </div>

        {view === 'submit' && (
          <>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Tell us what you need</h2>
              <p className="text-sm text-gray-500 mt-0.5">Our agents will review your request and contact you.</p>
            </div>
            <SubmitForm />
          </>
        )}

        {view === 'check' && (
          <>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Check Request Status</h2>
              <p className="text-sm text-gray-500 mt-0.5">Enter the phone number you used when submitting your request.</p>
            </div>
            <CheckStatusForm />
          </>
        )}

      </div>
    </div>
  )
}
