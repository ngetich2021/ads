'use client'

import { useState, useEffect } from 'react'

export function LiveTime() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString('en-KE', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    const id = setInterval(() => setTime(fmt()), 30_000)
    const init = setTimeout(() => setTime(fmt()), 0)
    return () => { clearInterval(id); clearTimeout(init) }
  }, [])

  return <span suppressHydrationWarning>{time}</span>
}
