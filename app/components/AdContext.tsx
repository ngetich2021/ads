'use client'

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

export type AdSlot = {
  id: string
  title: string
  linkUrl: string | null
  videoSrc: string
  videoMime: string
  positions: string[]
  playsPerHour: number
}

/* ─── Data context (shared fetch, position-filtered by each component) ─── */

const Ctx = createContext<AdSlot[]>([])

export function useAds() { return useContext(Ctx) }

export function AdProvider({
  countyId, marketId, children,
}: {
  countyId?: string
  marketId?: string
  children: React.ReactNode
}) {
  const [slots, setSlots] = useState<AdSlot[]>([])

  useEffect(() => {
    const params = new URLSearchParams()
    if (countyId) params.set('countyId', countyId)
    if (marketId) params.set('marketId', marketId)
    const ctrl = new AbortController()
    fetch(`/api/ads/active?${params}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then((data: AdSlot[]) => setSlots(data))
      .catch(() => {})
    return () => ctrl.abort()
  }, [countyId, marketId])

  return <Ctx.Provider value={slots}>{children}</Ctx.Provider>
}

/* ─── Per-position rotation hook ──────────────────────────────────────── */
// Each ad position calls this independently — queues and advances separately.
// Videos advance on `onEnded`; a 35 s safety timer fires if the event never comes.
// Call the returned `advance` as the video's onEnded handler.

export function useAdRotation(ads: AdSlot[]) {
  const [idx, setIdx] = useState(0)
  const [fading, setFading] = useState(false)
  const guard = useRef(false)       // prevents double-advance per slot
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset when the pool changes (location filter changed)
  const key = ads.map(a => a.id).join(',')
  useEffect(() => {
    setIdx(0)
    setFading(false)
    guard.current = false
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => {
    if (ads.length <= 1 || guard.current) return
    guard.current = true
    if (fallbackRef.current) clearTimeout(fallbackRef.current)
    setFading(true)
    setTimeout(() => {
      setIdx(i => (i + 1) % ads.length)
      setFading(false)
      guard.current = false
    }, 350)
  }, [ads.length])

  // Safety fallback: move on after 35 s even if onEnded never fires
  useEffect(() => {
    if (ads.length <= 1) return
    guard.current = false
    fallbackRef.current = setTimeout(advance, 35_000)
    return () => { if (fallbackRef.current) clearTimeout(fallbackRef.current) }
  }, [idx, ads.length, advance])

  const ad = ads[idx] ?? null
  return { ad, idx, fading, advance, total: ads.length }
}
