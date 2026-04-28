'use client'

import { useState } from 'react'
import { submitClientFeedback } from '@/app/need/actions'

export default function FeedbackForm({ trackingNumber }: { trackingNumber: string }) {
  const [feedback, setFeedback] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!feedback.trim()) { setError('Please write something before submitting.'); return }
    setError('')
    setStatus('saving')
    const result = await submitClientFeedback(trackingNumber, feedback.trim())
    if (result.ok) {
      setStatus('done')
      window.location.reload()
    } else {
      setError(result.error)
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return <p className="text-green-600 font-medium text-center py-4">Submitted! Refreshing…</p>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        rows={4}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="e.g. Goods received in good condition. Very happy with the service!"
        className="w-full border border-orange-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none bg-white"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={status === 'saving'}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
      >
        {status === 'saving' ? 'Submitting…' : 'Confirm Receipt & Submit Feedback'}
      </button>
    </form>
  )
}
