'use client'

import { useState, useTransition } from 'react'
import { submitDropShipSale, lookupDropShipSale } from './actions'
import type { DropShipItemInfo, DropShipSaleInfo, CountyInfo } from './actions'

type Props = {
  dropShipItems: DropShipItemInfo[]
  selectedCountyId: string
  counties: CountyInfo[]
}

const COMM_METHODS = [
  { value: 'whatsapp', label: '💬 WhatsApp' },
  { value: 'sms',      label: '📩 SMS' },
  { value: 'call',     label: '📞 Call' },
  { value: 'email',    label: '📧 Email' },
]

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: 'Pending Review', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  REVIEWED:  { label: 'Reviewed',       cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  PROCESSED: { label: 'Processed',      cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  PAID:      { label: 'Paid',           cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

const ic = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ReportForm({ item, onBack }: { item: DropShipItemInfo; onBack: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('dropShipItemId', item.id)
    startTransition(async () => {
      const res = await submitDropShipSale(fd)
      if (res.success) setDone(true)
      else setError(res.error)
    })
  }

  if (done) return (
    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 text-center space-y-3">
      <div className="text-4xl">✅</div>
      <p className="font-bold text-emerald-700">Sale report submitted!</p>
      <p className="text-sm text-gray-500">Use <strong>Check Status</strong> with your M-Pesa number to track progress.</p>
      <button onClick={onBack} className="text-sm text-indigo-600 font-semibold hover:underline">← Back to products</button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">Reporting for:</p>
          <p className="text-sm font-bold text-gray-800 truncate">{item.description}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <label className="text-xs font-semibold text-gray-500">
            Sale Report File <span className="text-gray-400 font-normal">(Excel / PDF — buyer&apos;s request)</span>
          </label>
          <input type="file" name="file" accept=".xlsx,.xls,.csv,.pdf"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-violet-700 hover:file:bg-violet-200 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Sale Notes</label>
          <textarea name="agentNotes" rows={2} placeholder="Describe what you sold, quantity, issues, etc."
            className={`${ic} resize-none`} />
        </div>

        {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

        <button type="submit" disabled={isPending}
          className="w-full rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-60">
          {isPending ? 'Submitting…' : 'Submit Sale Report'}
        </button>
      </form>
    </div>
  )
}

function CheckStatus() {
  const [checkMpesa, setCheckMpesa] = useState('')
  const [checkResult, setCheckResult] = useState<{ found: false } | { found: true; sales: DropShipSaleInfo[] } | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleCheck = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCheckResult(null)
    startTransition(async () => { setCheckResult(await lookupDropShipSale(checkMpesa)) })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Enter your M-Pesa number to track your sale reports.</p>
      <form onSubmit={handleCheck} className="flex gap-2">
        <input type="tel" value={checkMpesa} onChange={(e) => setCheckMpesa(e.target.value)}
          placeholder="07XXXXXXXX" maxLength={10} className={`flex-1 ${ic}`} />
        <button type="submit" disabled={isPending}
          className="rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60 whitespace-nowrap">
          {isPending ? '…' : 'Check'}
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
  )
}

export default function DropShipSalesTab({ dropShipItems, selectedCountyId, counties }: Props) {
  const [view, setView] = useState<'list' | 'check'>('list')
  const [reportingItem, setReportingItem] = useState<DropShipItemInfo | null>(null)

  const visibleItems = dropShipItems.filter(item => {
    if (item.target === 'NATIONAL') return true
    if (selectedCountyId && item.targetCountyIds.includes(selectedCountyId)) return true
    if (!selectedCountyId) return true
    return false
  })

  if (reportingItem) {
    return (
      <div className="py-4">
        <ReportForm item={reportingItem} onBack={() => setReportingItem(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-4 py-4">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {([['list', '📦 Products'], ['check', '🔍 Check Status']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setView(t)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${view === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Products table */}
      {view === 'list' && (
        visibleItems.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No products available.</div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-left w-32">Location</th>
                    <th className="px-4 py-3 text-left w-28">Date</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{item.description}</p>
                        {(item.fileUrl || item.fileName) && (
                          <a href={item.fileUrl ?? `/api/dropship/${item.id}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-0.5">
                            📎 View file
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">📍 {item.location}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">📅 {fmtDate(item.date)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setReportingItem(item)}
                          className="rounded-lg bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 hover:bg-indigo-700 transition-colors">
                          Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile list */}
            <ul className="sm:hidden divide-y divide-gray-100">
              {visibleItems.map((item) => (
                <li key={item.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-gray-800">{item.description}</p>
                    <p className="text-xs text-gray-400">📍 {item.location} · 📅 {fmtDate(item.date)}</p>
                    {(item.fileUrl || item.fileName) && (
                      <a href={item.fileUrl ?? `/api/dropship/${item.id}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                        📎 View file
                      </a>
                    )}
                  </div>
                  <button onClick={() => setReportingItem(item)}
                    className="shrink-0 rounded-lg bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 hover:bg-indigo-700 transition-colors">
                    Report
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {view === 'check' && <CheckStatus />}
    </div>
  )
}
