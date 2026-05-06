'use client'

import React, { useRef, useEffect } from 'react'
import { useAds, useAdRotation } from './AdContext'

export default function AdBanner() {
  const slots = useAds()
  const ads   = slots.filter(s => s.positions.includes('banner'))
  const { ad, idx, fading, advance, total } = useAdRotation(ads)
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
      className="w-full h-full object-fill pointer-events-none"
      aria-label={ad.title}
    >
      <source src={ad.videoSrc} type={ad.videoMime} />
    </video>
  )

  return (
    <div className="flex justify-center py-2">
      <div
        className="relative w-[30vh] h-[15vh] bg-black overflow-hidden rounded-xl select-none"
        style={{ opacity: fading ? 0 : 1, transition: 'opacity 350ms ease' }}
      >
        {ad.linkUrl
          ? <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full">{vid}</a>
          : vid}

        {/* AD label top-right */}
        <span className="absolute top-1.5 right-2 bg-black/60 text-white/70 text-[9px] leading-none rounded px-1.5 py-0.5 pointer-events-none">
          AD
        </span>

        {/* Progress dots */}
        {total > 1 && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
            {ads.map((_, i) => (
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
    </div>
  )
}
