import { redirect } from 'next/navigation'

export default function TrackPage() {
  async function goToTracking(formData: FormData) {
    'use server'
    const num = (formData.get('tracking') as string)?.trim().toUpperCase()
    if (num) redirect(`/track/${num}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-1">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 mb-2">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2a4 4 0 014-4h6m0 0l-3-3m3 3l-3 3M3 7h6m0 0V5m0 2v2" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Track your request</h1>
          <p className="text-sm text-gray-500">Enter the tracking number you received after payment.</p>
        </div>

        <form action={goToTracking} className="flex gap-2">
          <input
            name="tracking"
            type="text"
            required
            placeholder="e.g. TRKAB1234"
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
          />
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-5 text-sm transition-colors"
          >
            Track
          </button>
        </form>

        <p className="text-center text-xs text-gray-400">
          <a href="/market" className="hover:text-indigo-600 transition-colors">← Back to market</a>
        </p>
      </div>
    </div>
  )
}
