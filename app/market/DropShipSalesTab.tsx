'use client'

import { useState, useTransition } from 'react'
import { submitDropShipSale, lookupDropShipSale } from './actions'
import type { DropShipItemInfo, DropShipSaleInfo } from './actions'

type Props = { dropShipItems: DropShipItemInfo[] }

const COMM_METHODS = [
  { value: 'whatsapp', label: '💬 WhatsApp' },
  { value: 'sms',      label: '📩 SMS' },
  { value: 'call',     label: '📞 Call' },
  { value: 'email',    label: '📧 Email' },
]

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: 'Pending Review', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  REVIEWED:  { label: 'Reviewed', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  PROCESSED: { label: 'Processed', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  PAID:      { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

const ic = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function DropShipSalesTab({ dropShipItems }: Props) {
  const [view, setView] = useState<'list' | 'report' | 'check'>('list')
  const [selectedItem, setSelectedItem] = useState<DropShipItemInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [checkMpesa, setCheckMpesa] = useState('')
  const [checkResult, setCheckResult] = useState<{ found: false } | { found: true; sales: DropShipSaleInfo[] } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [checkPending, startCheck] = useTransition()

  const handleReport = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const fd = new FormData(form)
    if (selectedItem) fd.set('dropShipItemId', selectedItem.id)
    startTransition(async () => {
      const res = await submitDropShipSale(fd)
      if (res.success) { setDone(true); form.reset() }
      else setError(res.error)
    })
  }

  const handleCheck = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCheckResult(null)
    startCheck(async () => { setCheckResult(await lookupDropShipSale(checkMpesa)) })
  }

  return (
    <div className="space-y-4 py-4">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {([['list', '📦 Products'], ['report', '📋 Report Sale'], ['check', '🔍 Check Status']] as const).map(([t, label]) => (
          <button key={t} onClick={() => { setView(t); setDone(false); setError(null) }}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${view === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Products list */}
      {view === 'list' && (
        <div className="space-y-3">
          {dropShipItems.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No products available.</div>
          ) : dropShipItems.map((item) => (
            <div key={item.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm">{item.orgName}</p>
                  <p className="text-xs text-gray-500">{item.description}</p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span>📍 {item.location}</span>
                    <span>📅 {fmtDate(item.date)}</span>
                  </div>
                </div>
                <button onClick={() => { setSelectedItem(item); setView('report'); setDone(false) }}
                  className="shrink-0 rounded-xl bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 hover:bg-indigo-700">
                  Report Sale
                </button>
              </div>
              {(item.fileUrl || item.fileName) && (
                <a href={item.fileUrl ?? `/api/dropship/${item.id}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                  📎 {item.fileName}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Report sale form */}
      {view === 'report' && (
        <div className="space-y-4">
          {done ? (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 text-center space-y-3">
              <div className="text-4xl">✅</div>
              <p className="font-bold text-emerald-700">Sale report submitted!</p>
              <p className="text-sm text-gray-500">Use <strong>Check Status</strong> with your M-Pesa number to track progress.</p>
              <button onClick={() => setDone(false)} className="text-xs text-indigo-600 font-semibold hover:underline">Submit another</button>
            </div>
          ) : (
            <form onSubmit={handleReport} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Product <span className="text-red-400">*</span></label>
                <select name="dropShipItemId" required defaultValue={selectedItem?.id ?? ''} className={ic}
                  onChange={(e) => setSelectedItem(dropShipItems.find((i) => i.id === e.target.value) ?? null)}>
                  <option value="">Select a product…</option>
                  {dropShipItems.map((i) => <option key={i.id} value={i.id}>{i.orgName} — {i.description.slice(0, 40)}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Your M-Pesa Number <span className="text-red-400">*</span></label>
                <input type="tel" name="mpesaNumber" required placeholder="07XXXXXXXX" maxLength={10} pattern="^(07|01)\d{8}$" className={ic} />
                <p className="text-xs text-gray-400">Used to track and receive payment.</p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Preferred Contact Method <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {COMM_METHODS.map((m) => (
                    <label key={m.value} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 cursor-pointer hover:border-violet-300 bg-white text-sm">
                      <input type="radio" name="commMethod" value={m.value} required className="accent-violet-600" />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Sale Notes</label>
                <textarea name="agentNotes" rows={3} placeholder="Describe what you sold, quantity, issues, etc."
                  className={`${ic} resize-none`} />
              </div>

              {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

              <button type="submit" disabled={isPending}
                className="w-full rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-60">
                {isPending ? 'Submitting…' : 'Submit Sale Report'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Check status */}
      {view === 'check' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Enter your M-Pesa number to track your sale reports.</p>
          <form onSubmit={handleCheck} className="flex gap-2">
            <input type="tel" value={checkMpesa} onChange={(e) => setCheckMpesa(e.target.value)}
              placeholder="07XXXXXXXX" maxLength={10} className={`flex-1 ${ic}`} />
            <button type="submit" disabled={checkPending}
              className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60 whitespace-nowrap">
              {checkPending ? '…' : 'Check'}
            </button>
          </form>

          {checkResult && (
            checkResult.found === false ? (
              <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-500 text-center">
                No sale reports found for this number.
              </div>
            ) : (
              <div className="space-y-3">
                {checkResult.sales.map((sale) => {
                  const st = STATUS_CFG[sale.status] ?? STATUS_CFG.PENDING
                  return (
                    <div key={sale.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                        <span className="text-xs text-gray-400">{fmtDate(sale.createdAt)}</span>
                      </div>
                      {sale.agentNotes && <p className="text-xs text-gray-600"><span className="font-semibold">Your notes:</span> {sale.agentNotes}</p>}
                      {sale.adminNotes && (
                        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                          <p className="text-xs font-bold text-blue-700 mb-0.5">Admin feedback:</p>
                          <p className="text-xs text-blue-600 whitespace-pre-line">{sale.adminNotes}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
