'use client'

import { useState } from 'react'
import { initiatePayment } from '../actions'

type Status = 'idle' | 'loading' | 'polling' | 'success' | 'failed'

export default function PaymentForm({ id, amount }: { id: string; amount: number }) {
  const [mpesa, setMpesa] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  const busy = status === 'loading' || status === 'polling'

  async function handlePay() {
    if (!mpesa.trim() || !whatsapp.trim()) {
      setError('Please enter both your M-Pesa number and WhatsApp number.')
      return
    }
    setError('')
    setStatus('loading')

    try {
      const result = await initiatePayment(id, mpesa.trim(), whatsapp.trim())
      if (!result.ok) {
        setError(result.error)
        setStatus('idle')
        return
      }
      setStatus('polling')
      pollPayment(result.checkoutId)
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('idle')
    }
  }

  function pollPayment(checkoutId: string) {
    let attempts = 0
    const MAX = 30

    async function check() {
      if (attempts++ >= MAX) {
        setStatus('failed')
        setError('Payment timed out. Please try again.')
        return
      }
      try {
        const res = await fetch(`/api/mpesa/stk/${checkoutId}`)
        const data = (await res.json()) as { status: string; reason?: string }
        if (data.status === 'success') {
          setStatus('success')
          window.location.reload()
          return
        }
        if (data.status === 'cancelled' || data.status === 'failed') {
          setStatus('failed')
          setError(data.reason ?? 'Payment was not completed. Please try again.')
          return
        }
      } catch {
        // network hiccup — keep polling
      }
      setTimeout(check, 3000)
    }

    setTimeout(check, 3000)
  }

  if (status === 'success') {
    return <div className="text-center py-6 text-green-600 font-medium">Payment received — refreshing…</div>
  }

  return (
    <div className="space-y-5">
      <h2 className="font-semibold text-gray-800">
        Complete Payment —{' '}
        <span className="text-green-700">KES {amount.toLocaleString()}</span>
      </h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="mpesa">
          M-Pesa Number{' '}
          <span className="text-gray-400 font-normal">(used for payment &amp; tracking)</span>
        </label>
        <input
          id="mpesa" type="tel" value={mpesa}
          onChange={(e) => setMpesa(e.target.value)}
          placeholder="e.g. 0712 345 678" disabled={busy}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="whatsapp">
          WhatsApp Number
        </label>
        <input
          id="whatsapp" type="tel" value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="e.g. 0712 345 678" disabled={busy}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
        />
      </div>

      {error && (
        <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      {status === 'polling' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center space-y-1">
          <p className="text-blue-800 font-medium text-sm">STK push sent to your phone</p>
          <p className="text-blue-600 text-sm">Enter your M-Pesa PIN to complete payment. Waiting…</p>
          <div className="flex justify-center pt-2">
            <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      ) : (
        <button onClick={handlePay} disabled={busy}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm transition-colors">
          {status === 'loading' ? 'Initiating…' : `Pay KES ${amount.toLocaleString()} via M-Pesa`}
        </button>
      )}

      {status === 'failed' && (
        <button onClick={() => { setStatus('idle'); setError('') }}
          className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-xl py-3 text-sm transition-colors">
          Try Again
        </button>
      )}
    </div>
  )
}
