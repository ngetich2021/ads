'use client'

import React, { useRef, useEffect } from 'react'
import { useAds, useAdRotation, type AdSlot } from './AdContext'

/* ─── Single independent ad slot ─────────────────────────────────────────── */

function AdSlotPanel({ ads, initialOffset = 0 }: { ads: AdSlot[]; initialOffset?: number }) {
  // Rotate the pool so this panel starts at a different point than its sibling
  const pool = initialOffset > 0 && ads.length > 1
    ? [...ads.slice(initialOffset), ...ads.slice(0, initialOffset)]
    : ads

  const { ad, idx, fading, advance, total } = useAdRotation(pool)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const resume = () => el.play().catch(() => {})
    el.addEventListener('pause', resume)
    el.play().catch(() => {})
    return () => el.removeEventListener('pause', resume)
  }, [idx])

  if (!ad) return null

  const vid = (
    <video
      ref={videoRef}
      key={ad.id + idx}
      src={ad.videoSrc}
      autoPlay muted playsInline
      onEnded={advance}
      onContextMenu={e => e.preventDefault()}
      className="w-full h-full object-cover pointer-events-none"
      aria-label={ad.title}
    >
      <source src={ad.videoSrc} type={ad.videoMime} />
    </video>
  )

  return (
    /*
      Portrait slot — matches the right-column ad panels in md.png / lg.png
      md  : column 220 px wide → 210 px tall (near-square)
      lg  : column 260 px wide → 250 px tall
      xl  : column 300 px wide → 300 px tall
    */
    <div
      className="relative w-full overflow-hidden rounded-xl bg-black select-none
                 h-[210px] lg:h-[250px] xl:h-[300px]"
      style={{ opacity: fading ? 0 : 1, transition: 'opacity 350ms ease' }}
    >
      {ad.linkUrl
        ? <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full">{vid}</a>
        : vid}

      {/* AD label */}
      <span className="absolute top-1.5 right-1.5 bg-black/60 text-white/70 text-[9px] leading-none rounded px-1.5 py-0.5 pointer-events-none">
        AD
      </span>

      {/* Progress dots */}
      {total > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
          {pool.map((_, i) => (
            <span
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === idx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Placeholder when no ads are available ──────────────────────────────── */

function EmptySlot() {
  return (
    <div className="flex items-center justify-center w-full rounded-xl border border-dashed border-gray-200 h-[210px] lg:h-[250px] xl:h-[300px]">
      <a href="/ads/submit" className="text-xs text-gray-400 hover:text-indigo-600 transition-colors">
        Advertise here
      </a>
    </div>
  )
}

/* ─── Sidebar: two stacked independent slots ─────────────────────────────── */

export default function AdSidebar() {
  const slots = useAds()
  const ads   = slots.filter(s => s.positions.includes('sidebar'))

  // Second slot starts midway through the ad pool so the two panels never
  // show the same ad at the same time.
  const mid = Math.ceil(ads.length / 2)

  return (
    <div className="flex flex-col gap-2">
      {/* Top slot */}
      {ads.length > 0 ? <AdSlotPanel ads={ads} initialOffset={0} /> : <EmptySlot />}

      {/* Bottom slot — only shown when there is at least one ad */}
      {ads.length > 0
        ? <AdSlotPanel ads={ads} initialOffset={mid} />
        : <EmptySlot />
      }

      <p className="text-center mt-1">
        <a href="/ads/submit" className="text-[10px] text-gray-400 hover:text-indigo-600 transition-colors">
          Advertise here
        </a>
      </p>
    </div>
  )
}
