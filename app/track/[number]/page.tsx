import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import FeedbackForm from './FeedbackForm'

const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  PAID:               { label: 'Confirmed & Processing',  color: 'text-purple-700', dot: 'bg-purple-500' },
  IN_PROGRESS:        { label: 'In Progress',              color: 'text-indigo-700', dot: 'bg-indigo-500' },
  AWAITING_FEEDBACK:  { label: 'Delivered — Awaiting Your Confirmation', color: 'text-orange-700', dot: 'bg-orange-500' },
  DELIVERED:          { label: 'Delivered ✓',             color: 'text-green-700',  dot: 'bg-green-500' },
}

function fmt(iso: Date) {
  return new Date(iso).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ number: string }>
}) {
  const { number } = await params
  const req = await db.needRequest.findUnique({
    where: { trackingNumber: number.toUpperCase() },
    include: { updates: { orderBy: { createdAt: 'asc' } } },
  })

  if (!req || !['PAID', 'IN_PROGRESS', 'AWAITING_FEEDBACK', 'DELIVERED'].includes(req.status)) {
    notFound()
  }

  const meta = STATUS_META[req.status]

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-4">

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Tracking</p>
              <p className="font-mono text-2xl font-bold text-gray-900 tracking-widest">{req.trackingNumber}</p>
            </div>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
              req.status === 'DELIVERED'         ? 'bg-green-50 border-green-200 text-green-700' :
              req.status === 'AWAITING_FEEDBACK' ? 'bg-orange-50 border-orange-200 text-orange-700' :
              req.status === 'IN_PROGRESS'       ? 'bg-indigo-50 border-indigo-200 text-indigo-700' :
                                                   'bg-purple-50 border-purple-200 text-purple-700'
            }`}>
              {meta.label}
            </span>
          </div>

          <div className="border-t border-gray-100 pt-3 space-y-0.5 text-sm text-gray-600">
            <p><span className="font-medium text-gray-800">{req.name}</span></p>
            <p className="text-gray-500 text-xs">{req.description}</p>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-5">Progress Updates</h2>

          {req.updates.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No updates yet. Check back soon.</p>
          ) : (
            <ol className="relative border-l-2 border-gray-100 space-y-0 ml-2">
              {req.updates.map((u, i) => {
                const isLast = i === req.updates.length - 1
                return (
                  <li key={u.id} className="ml-5 pb-6 last:pb-0">
                    {/* dot */}
                    <span className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${isLast ? meta.dot : 'bg-gray-300'}`} />
                    <p className="text-sm text-gray-800 font-medium leading-snug">{u.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmt(u.createdAt)}</p>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {/* Customer confirmation — shown when agent marks as awaiting */}
        {req.status === 'AWAITING_FEEDBACK' && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 space-y-4">
            <div className="space-y-1">
              <p className="font-semibold text-orange-800">Confirm you have received the goods</p>
              <p className="text-sm text-orange-700">
                Please confirm receipt and leave a short feedback. This closes the request.
              </p>
            </div>
            <FeedbackForm trackingNumber={req.trackingNumber!} />
          </div>
        )}

        {/* Delivered — show client feedback */}
        {req.status === 'DELIVERED' && req.clientFeedback && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 space-y-2">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Your Feedback</p>
            <p className="text-sm text-green-900 whitespace-pre-wrap">{req.clientFeedback}</p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          Thank you for trusting us with the task. It is our pleasure to serve you always.
          {' · '}
          <a href="/market" className="hover:text-indigo-600 transition-colors">Back to market</a>
        </p>

      </div>
    </div>
  )
}
