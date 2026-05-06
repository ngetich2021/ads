'use client'

import { useState, useRef, useEffect } from 'react'
import { submitAd, type AdPackageInfo } from '../actions'

const POSITIONS: Record<string, string> = {
  banner: 'Top Banner',
  sidebar: 'Right Sidebar',
  sticky: 'Bottom Strip',
}

const MAX_MB = 100
const MAX_BYTES = MAX_MB * 1024 * 1024
const MAX_DURATION_S = 30

type CountyBasic = { id: string; name: string; markets: { id: string; name: string }[] }
type PayStep = 'idle' | 'initiating' | 'polling' | 'done' | 'failed'

export default function AdSubmitPage() {
  /* ── packages ── */
  const [packages, setPackages] = useState<AdPackageInfo[]>([])
  const [pkgLoading, setPkgLoading] = useState(true)
  const [pkgError, setPkgError] = useState('')
  const [selectedPkg, setSelectedPkg] = useState<AdPackageInfo | null>(null)
  const [days, setDays] = useState(1)

  /* ── counties / markets ── */
  const [counties, setCounties] = useState<CountyBasic[]>([])
  const [target, setTarget] = useState<'NATIONAL' | 'COUNTY' | 'MARKET'>('NATIONAL')
  const [selectedCountyIds, setSelectedCountyIds] = useState<string[]>([])
  const [marketFilterCountyId, setMarketFilterCountyId] = useState('')
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([])

  /* ── video ── */
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoPreview, setVideoPreview] = useState<string | null>(null)
  const [videoError, setVideoError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  /* ── form state ── */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [stage, setStage] = useState<'form' | 'pay' | 'submitting' | 'done'>('form')

  /* ── payment ── */
  const [mpesaPhone, setMpesaPhone] = useState('')
  const [payStep, setPayStep] = useState<PayStep>('idle')
  const [payError, setPayError] = useState('')
  const [checkoutId, setCheckoutId] = useState('')

  /* ── final ── */
  const [submitError, setSubmitError] = useState('')
  const [adId, setAdId] = useState('')

  /* saved form data for post-payment submit */
  const formDataRef = useRef<FormData | null>(null)

  useEffect(() => {
    fetch('/api/ads/packages')
      .then(r => r.json())
      .then((d: AdPackageInfo[]) => { setPackages(d); setPkgLoading(false) })
      .catch(() => { setPkgError('Could not load packages. Please refresh.'); setPkgLoading(false) })
    fetch('/api/counties')
      .then(r => r.json())
      .then((d: CountyBasic[]) => setCounties(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedPkg) setDays(selectedPkg.durationDays)
  }, [selectedPkg])

  const totalPrice = selectedPkg ? selectedPkg.price * days : 0

  /* ── video validation ── */
  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_BYTES) {
      setVideoError(`Video is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is ${MAX_MB} MB.`)
      setVideoFile(null); setVideoPreview(null); e.target.value = ''; return
    }
    const allowed = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/avi']
    if (!allowed.includes(file.type)) {
      setVideoError('Unsupported file type. Upload MP4, WebM, MOV, or AVI.')
      setVideoFile(null); setVideoPreview(null); e.target.value = ''; return
    }
    const url = URL.createObjectURL(file)
    const tmp = document.createElement('video')
    tmp.preload = 'metadata'
    tmp.onloadedmetadata = () => {
      URL.revokeObjectURL(tmp.src)
      if (tmp.duration > MAX_DURATION_S) {
        setVideoError(`Video is ${Math.ceil(tmp.duration)}s — maximum is ${MAX_DURATION_S} seconds.`)
        setVideoFile(null); setVideoPreview(null); e.target.value = ''; return
      }
      setVideoError(''); setVideoFile(file); setVideoPreview(URL.createObjectURL(file))
    }
    tmp.onerror = () => { setVideoError(''); setVideoFile(file); setVideoPreview(URL.createObjectURL(file)) }
    tmp.src = url
  }

  /* ── form validation & proceed to payment ── */
  function handleReviewAndPay(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const fd = new FormData(e.currentTarget)
    if (!fd.get('submitterName')?.toString().trim()) errs.name = 'Name is required.'
    if (!fd.get('submitterEmail')?.toString().trim()) errs.email = 'Email is required.'
    if (!fd.get('submitterPhone')?.toString().trim()) errs.phone = 'Phone is required.'
    if (!fd.get('title')?.toString().trim()) errs.title = 'Ad title is required.'
    if (!selectedPkg) errs.package = 'Please select a package.'
    if (!videoFile) errs.video = 'Please upload a video file.'
    if (videoError) errs.video = videoError
    if (target === 'COUNTY' && selectedCountyIds.length === 0) errs.targeting = 'Select at least one county.'
    if (target === 'MARKET' && selectedMarketIds.length === 0) errs.targeting = 'Select at least one market.'
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    fd.set('video', videoFile!)
    fd.set('target', target)
    fd.set('durationDays', String(days))
    selectedCountyIds.forEach(id => fd.append('targetCountyIds', id))
    selectedMarketIds.forEach(id => fd.append('targetMarketIds', id))
    formDataRef.current = fd
    setMpesaPhone(fd.get('submitterPhone')?.toString().trim() ?? '')
    setStage('pay')
  }

  /* ── M-Pesa payment flow ── */
  async function handlePay() {
    if (!mpesaPhone.trim()) { setPayError('Enter your M-Pesa number.'); return }
    setPayError(''); setPayStep('initiating')
    try {
      const res = await fetch('/api/mpesa/stk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: mpesaPhone.trim(), amount: totalPrice, ref: 'AdPayment' }),
      })
      const data = await res.json() as { checkoutId?: string; error?: string }
      if (!res.ok || !data.checkoutId) {
        setPayError(data.error ?? 'Could not initiate payment. Try again.'); setPayStep('failed'); return
      }
      setCheckoutId(data.checkoutId)
      setPayStep('polling')
      pollPayment(data.checkoutId)
    } catch {
      setPayError('Network error. Please try again.'); setPayStep('failed')
    }
  }

  function pollPayment(cid: string) {
    let attempts = 0
    async function check() {
      if (attempts++ >= 30) { setPayStep('failed'); setPayError('Payment timed out. Please try again.'); return }
      try {
        const r = await fetch(`/api/mpesa/stk/${cid}`)
        const d = await r.json() as { status: string; reason?: string }
        if (d.status === 'success') { setPayStep('done'); submitFormAfterPayment(cid); return }
        if (d.status === 'cancelled' || d.status === 'failed') {
          setPayStep('failed'); setPayError(d.reason ?? 'Payment was not completed.'); return
        }
      } catch { /* keep polling */ }
      setTimeout(check, 3000)
    }
    setTimeout(check, 4000)
  }

  async function submitFormAfterPayment(cid: string) {
    setStage('submitting')
    const fd = formDataRef.current!
    fd.set('checkoutId', cid)
    try {
      const result = await submitAd(fd)
      if (result.success) {
        setAdId(result.adId!)
      } else {
        setSubmitError(result.error)
        setPayStep('idle')
        setStage('pay')
      }
    } catch {
      setSubmitError('Submission failed. Your payment was received — please contact support with your M-Pesa ref.')
      setPayStep('idle')
      setStage('pay')
    }
  }

  /* ── helpers ── */
  function toggleCounty(id: string) {
    setSelectedCountyIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }
  function toggleMarket(id: string) {
    setSelectedMarketIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  const marketsForFilter = counties.find(c => c.id === marketFilterCountyId)?.markets ?? []

  /* ── SUCCESS ── */
  if (adId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800">Payment Received — Ad Submitted!</h2>
          <p className="text-gray-600 text-sm">
            Your ad is now under review. You will receive an email once it is approved or if it needs changes.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left">
            <p className="text-xs text-gray-500 mb-1">Ad ID (save this)</p>
            <p className="font-mono font-bold text-gray-900 text-sm break-all select-all">{adId}</p>
          </div>
          <a href={`/ads/${adId}/pay`} className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors">
            Check Ad Status
          </a>
          <a href="/market" className="block text-sm text-gray-500 hover:text-gray-700">Back to Market</a>
        </div>
      </div>
    )
  }

  /* ── PAYMENT STAGE ── */
  if (stage === 'pay' || stage === 'submitting') {
    const busy = payStep === 'initiating' || payStep === 'polling' || stage === 'submitting'
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-indigo-800 to-violet-800 shadow-lg">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
            <button onClick={() => { if (!busy) setStage('form') }} className="text-white/70 hover:text-white text-sm">← Back</button>
            <span className="text-white/40">/</span>
            <span className="text-white font-semibold text-sm">Pay & Submit</span>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
          {/* Summary */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-3">
            <h2 className="font-bold text-gray-900 text-lg">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Package</span><span className="font-medium">{selectedPkg?.name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Duration</span><span className="font-medium">{days} days</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Rate</span><span className="font-medium">KSh {selectedPkg?.price.toLocaleString()}/day</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Reach</span><span className="font-medium capitalize">{target.toLowerCase()}</span></div>
              <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="font-extrabold text-indigo-700 text-xl">KSh {totalPrice.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* M-Pesa payment */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Pay via M-Pesa</h2>

            {payStep === 'done' || stage === 'submitting' ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="font-semibold text-green-700">Payment confirmed!</p>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  Uploading video & creating ad…
                </div>
              </div>
            ) : payStep === 'polling' ? (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center space-y-3">
                <p className="font-medium text-blue-800">STK push sent to {mpesaPhone}</p>
                <p className="text-blue-600 text-sm">Enter your M-Pesa PIN on your phone to complete payment</p>
                <div className="flex justify-center">
                  <span className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-xs text-blue-500">Waiting for confirmation…</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">M-Pesa Number</label>
                  <input
                    type="tel" value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)}
                    placeholder="e.g. 0712345678" disabled={busy}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
                  />
                </div>
                {payError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{payError}</p>}
                {submitError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{submitError}</p>}
                <button onClick={handlePay} disabled={busy}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-xl py-3.5 text-sm transition-colors">
                  {payStep === 'initiating' ? 'Sending STK push…' : `Pay KSh ${totalPrice.toLocaleString()} via M-Pesa`}
                </button>
                {payStep === 'failed' && (
                  <button onClick={() => { setPayStep('idle'); setPayError(''); setSubmitError('') }}
                    className="w-full border border-gray-300 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50 transition-colors">
                    Try Again
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ── FORM STAGE ── */
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-800 to-violet-800 shadow-lg">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <a href="/market" className="text-white/70 hover:text-white text-sm">Market</a>
          <span className="text-white/40">/</span>
          <span className="text-white font-semibold text-sm">Advertise</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 pb-16">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Place Your Ad</h1>
          <p className="text-gray-500 mt-1 text-sm">Fill in your ad details — payment is required to submit.</p>
        </div>

        <form onSubmit={handleReviewAndPay} className="space-y-6" noValidate>

          {/* ── 1. Package + Duration ── */}
          <div className={`bg-white rounded-2xl border shadow-sm p-6 ${fieldErrors.package ? 'border-red-300' : 'border-gray-200'}`}>
            <h2 className="font-semibold text-gray-800 mb-1">1. Choose a Package & Duration</h2>
            {fieldErrors.package && <p className="text-xs text-red-600 mb-3">{fieldErrors.package}</p>}

            {pkgLoading && (
              <div className="flex items-center gap-2 py-6 justify-center text-gray-400">
                <span className="w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm">Loading packages…</span>
              </div>
            )}
            {!pkgLoading && pkgError && (
              <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm text-red-600">{pkgError}</p>
                <button type="button" onClick={() => {
                  setPkgLoading(true); setPkgError('')
                  fetch('/api/ads/packages').then(r => r.json()).then((d: AdPackageInfo[]) => { setPackages(d); setPkgLoading(false) })
                    .catch(() => { setPkgError('Still failing. Please refresh.'); setPkgLoading(false) })
                }} className="text-xs text-red-600 underline">Retry</button>
              </div>
            )}
            {!pkgLoading && !pkgError && packages.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No packages available. Contact admin.</p>
            )}
            {!pkgLoading && packages.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {packages.map(pkg => (
                  <button key={pkg.id} type="button"
                    onClick={() => { setSelectedPkg(pkg); setFieldErrors(p => ({ ...p, package: '' })) }}
                    className={`text-left border-2 rounded-xl p-4 transition-all ${selectedPkg?.id === pkg.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-bold text-gray-800">{pkg.name}</span>
                      <span className="font-bold text-indigo-600 text-sm whitespace-nowrap">KSh {pkg.price.toLocaleString()}<span className="font-normal text-gray-400 text-xs">/day</span></span>
                    </div>
                    {pkg.description && <p className="text-xs text-gray-500 mb-2">{pkg.description}</p>}
                    <div className="flex flex-wrap gap-1 mb-1">
                      {pkg.positions.map(pos => (
                        <span key={pos} className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">{POSITIONS[pos] ?? pos}</span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400">Min {pkg.durationDays} days · {pkg.playsPerHour}×/hour</p>
                  </button>
                ))}
              </div>
            )}
            {selectedPkg && (
              <>
                <input type="hidden" name="packageId" value={selectedPkg.id} />
                <div className="mt-5 bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-indigo-800">Number of Days</label>
                    <span className="text-xs text-indigo-600">Min {selectedPkg.durationDays} · Max 90</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input type="range" min={selectedPkg.durationDays} max={90} step={1} value={days}
                      onChange={e => setDays(Number(e.target.value))} className="flex-1 accent-indigo-600" />
                    <input type="number" min={selectedPkg.durationDays} max={90} value={days}
                      onChange={e => setDays(Math.max(selectedPkg.durationDays, Math.min(90, Number(e.target.value) || selectedPkg.durationDays)))}
                      className="w-16 text-center border border-indigo-300 rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-indigo-200">
                    <span className="text-sm text-indigo-700">{days} days × KSh {selectedPkg.price.toLocaleString()}/day</span>
                    <span className="text-lg font-extrabold text-indigo-900">KSh {totalPrice.toLocaleString()}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── 2. Your Details ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">2. Your Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input name="submitterName" type="text" placeholder="Jane Doe"
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${fieldErrors.name ? 'border-red-300' : 'border-gray-300'}`} />
                {fieldErrors.name && <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (M-Pesa)</label>
                <input name="submitterPhone" type="tel" placeholder="0712345678"
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${fieldErrors.phone ? 'border-red-300' : 'border-gray-300'}`} />
                {fieldErrors.phone && <p className="text-xs text-red-600 mt-1">{fieldErrors.phone}</p>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input name="submitterEmail" type="email" placeholder="jane@example.com"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${fieldErrors.email ? 'border-red-300' : 'border-gray-300'}`} />
              {fieldErrors.email && <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>}
            </div>
          </div>

          {/* ── 3. Ad Content ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">3. Ad Content</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ad Title</label>
              <input name="title" type="text" placeholder="e.g. Mozzart Bet — Win Big Today"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${fieldErrors.title ? 'border-red-300' : 'border-gray-300'}`} />
              {fieldErrors.title && <p className="text-xs text-red-600 mt-1">{fieldErrors.title}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea name="description" rows={2} placeholder="Brief description…"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Click-through URL <span className="text-gray-400 font-normal">(optional)</span></label>
              <input name="linkUrl" type="url" placeholder="https://yourwebsite.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <p className="mt-1 text-xs text-gray-400">Viewers who click your ad will open this link.</p>
            </div>

            {/* Video */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Video <span className="text-red-500">*</span>
                <span className="ml-2 text-xs font-normal text-gray-400">Max {MAX_DURATION_S}s · Max {MAX_MB} MB · MP4/WebM/MOV</span>
              </label>
              <label className={`block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${videoError ? 'border-red-400 bg-red-50' : videoFile ? 'border-indigo-400 bg-indigo-50' : fieldErrors.video ? 'border-red-300 bg-red-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}`}>
                <input type="file" accept="video/*" onChange={handleVideoChange} className="sr-only" />
                {videoFile ? (
                  <div className="space-y-1">
                    <svg className="w-8 h-8 text-indigo-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-sm font-medium text-indigo-700">{videoFile.name}</p>
                    <p className="text-xs text-gray-500">{(videoFile.size / 1024 / 1024).toFixed(1)} MB · Click to change</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <svg className="w-10 h-10 text-gray-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.277A1 1 0 0121 8.677V15.32a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                    <p className="text-sm text-gray-500">Click to upload video</p>
                    <p className="text-xs text-gray-400">Max {MAX_DURATION_S}s · Max {MAX_MB} MB</p>
                  </div>
                )}
              </label>
              {(videoError || fieldErrors.video) && (
                <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-600">{videoError || fieldErrors.video}</p>
                </div>
              )}
              {videoPreview && !videoError && (
                <div className="mt-3 rounded-xl overflow-hidden border border-gray-200 bg-black">
                  <video ref={videoRef} src={videoPreview} controls className="w-full max-h-48 object-contain" />
                </div>
              )}
            </div>
          </div>

          {/* ── 4. Ad Reach ── */}
          <div className={`bg-white rounded-2xl border shadow-sm p-6 space-y-4 ${fieldErrors.targeting ? 'border-red-300' : 'border-gray-200'}`}>
            <h2 className="font-semibold text-gray-800">4. Ad Reach</h2>
            <p className="text-xs text-gray-500">Choose who sees your ad.</p>
            <div className="grid grid-cols-3 gap-3">
              {(['NATIONAL', 'COUNTY', 'MARKET'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => { setTarget(t); setFieldErrors(p => ({ ...p, targeting: '' })) }}
                  className={`border-2 rounded-xl py-3 px-2 text-center text-sm font-semibold transition-all ${target === t ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                >
                  {t === 'NATIONAL' ? '🌍 National' : t === 'COUNTY' ? '📍 County' : '🏪 Market'}
                </button>
              ))}
            </div>

            {target === 'COUNTY' && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Select counties:</p>
                {counties.length === 0
                  ? <p className="text-xs text-gray-400">Loading…</p>
                  : <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                      {counties.map(c => (
                        <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={selectedCountyIds.includes(c.id)}
                            onChange={() => toggleCounty(c.id)} className="accent-indigo-600 rounded" />
                          <span className="text-sm text-gray-700 truncate">{c.name}</span>
                        </label>
                      ))}
                    </div>
                }
              </div>
            )}

            {target === 'MARKET' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Filter by county:</label>
                  <select value={marketFilterCountyId} onChange={e => { setMarketFilterCountyId(e.target.value); setSelectedMarketIds([]) }}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">— Select a county first —</option>
                    {counties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {marketFilterCountyId && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">
                      Select markets in {counties.find(c => c.id === marketFilterCountyId)?.name}:
                    </p>
                    {marketsForFilter.length === 0
                      ? <p className="text-xs text-gray-400">No markets in this county.</p>
                      : <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                          {marketsForFilter.map(m => (
                            <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={selectedMarketIds.includes(m.id)}
                                onChange={() => toggleMarket(m.id)} className="accent-indigo-600 rounded" />
                              <span className="text-sm text-gray-700 truncate">{m.name}</span>
                            </label>
                          ))}
                        </div>
                    }
                  </div>
                )}
              </div>
            )}

            {fieldErrors.targeting && <p className="text-xs text-red-600">{fieldErrors.targeting}</p>}
          </div>

          {/* Total bar */}
          {selectedPkg && (
            <div className="bg-indigo-600 text-white rounded-2xl px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-80">Total — paid via M-Pesa on next step</p>
                <p className="text-xs opacity-60 mt-0.5">{selectedPkg.name} · {days} days · {target.toLowerCase()}</p>
              </div>
              <p className="text-2xl font-extrabold">KSh {totalPrice.toLocaleString()}</p>
            </div>
          )}

          <button type="submit"
            className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold rounded-xl py-3.5 text-sm transition-colors">
            Continue to Payment →
          </button>

          <p className="text-center text-xs text-gray-400">
            Payment is processed via M-Pesa. Admin reviews content after payment. You will be notified by email.
          </p>
        </form>
      </div>
    </div>
  )
}
