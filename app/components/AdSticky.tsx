'use client'

import { useRef, useEffect } from 'react'
import { useAds, useAdRotation } from './AdContext'

export default function AdSticky() {
  const slots = useAds()
  const ads   = slots.filter(s => s.positions.includes('sticky'))
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
    <div
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 w-[40vh] bg-black overflow-hidden rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.5)] select-none"
      style={{ opacity: fading ? 0 : 1, transition: 'opacity 350ms ease' }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="relative w-full h-[20vh]">
        {ad.linkUrl
          ? <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full">{vid}</a>
          : vid}

        {/* AD label */}
        <span className="absolute top-1 right-2 bg-black/60 text-white/60 text-[9px] leading-none rounded px-1.5 py-0.5 pointer-events-none">
          AD
        </span>

        {/* Advertise link */}
        <a
          href="/ads/submit"
          className="absolute bottom-1 right-2 text-[9px] text-white/40 hover:text-white/70 transition-colors"
        >
          Advertise
        </a>

        {/* Progress dots */}
        {total > 1 && (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
            {ads.map((_, i) => (
              <span
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === idx ? 'w-4 h-1 bg-white' : 'w-1 h-1 bg-white/35'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
