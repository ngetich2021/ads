'use client'

import type { RouteInfo, CountyInfo } from './actions'

type Props = {
  routes: RouteInfo[]
  counties: CountyInfo[]
  selectedCountyId: string
}

const TRANSPORT_LABELS: Record<string, string> = {
  psv: '🚌 PSV / Matatu',
  bike: '🏍️ Boda Boda',
  other: '🚗 Other',
}

export default function FaresTab({ routes, counties, selectedCountyId }: Props) {
  const county = counties.find((c) => c.id === selectedCountyId)

  const filtered = selectedCountyId
    ? routes.filter((r) => r.countyId === selectedCountyId || r.countyId === null)
    : routes

  const grouped = filtered.reduce<Record<string, RouteInfo[]>>((acc, r) => {
    const key = r.countyId ? (counties.find((c) => c.id === r.countyId)?.name ?? 'General') : 'National'
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="text-5xl mb-4">🛣️</div>
        <p className="text-lg font-bold text-gray-700">No fares available</p>
        <p className="text-sm text-gray-400 mt-1">
          {selectedCountyId ? `No routes found for ${county?.name ?? 'this county'}.` : 'No fare routes have been added yet.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center gap-3 px-4 sm:px-0">
        <div>
          <h2 className="text-lg font-black text-gray-800">Transport Fares</h2>
          <p className="text-xs text-gray-500">
            {county ? `Routes for ${county.name}` : 'All routes'} · {filtered.length} route{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {Object.entries(grouped).map(([groupName, groupRoutes]) => (
        <div key={groupName}>
          <div className="px-4 sm:px-0 mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
              📍 {groupName}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groupRoutes.map((route) => (
              <div key={route.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-linear-to-r from-indigo-50 to-violet-50 px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800 text-sm">{route.from}</span>
                    <span className="text-gray-400 text-sm">→</span>
                    <span className="font-bold text-gray-800 text-sm">{route.to}</span>
                  </div>
                </div>
                {route.fares.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-gray-400 italic">No fares listed</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {route.fares.map((fare) => (
                      <div key={fare.id} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-gray-600">{TRANSPORT_LABELS[fare.transportType] ?? fare.transportType}</span>
                        <span className="text-sm font-black text-emerald-600">KSh {fare.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
