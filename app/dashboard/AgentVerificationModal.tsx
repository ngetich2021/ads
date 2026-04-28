'use client'

import { useState, useRef, useTransition, useCallback } from 'react'
import { submitAgentVerification } from '@/app/market/actions'
import { uploadBase64 } from '@/app/actions'

const ic = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white'

type CaptureField = 'selfie' | 'idFront' | 'idBack'

function CameraCapture({ label, captured, onCapture }: {
  label: string
  captured: string | null
  onCapture: (dataUrl: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        setStreaming(true)
      }
    } catch {
      setError('Camera not accessible. Please allow camera access.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((t) => t.stop())
      videoRef.current.srcObject = null
    }
    setStreaming(false)
  }, [])

  const capture = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    onCapture(dataUrl)
    stopCamera()
  }, [onCapture, stopCamera])

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-gray-500">{label} <span className="text-red-400">*</span></label>
      {captured ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={captured} alt={label} className="w-full max-h-48 object-cover" />
          <button type="button" onClick={() => { onCapture(''); startCamera() }}
            className="absolute top-2 right-2 rounded-full bg-black/60 text-white text-xs px-2 py-1 font-semibold">
            Retake
          </button>
        </div>
      ) : streaming ? (
        <div className="space-y-2">
          <div className="rounded-xl overflow-hidden border border-gray-200 bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-48 object-cover" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={capture}
              className="flex-1 rounded-xl bg-emerald-600 text-white text-sm font-bold py-2 hover:bg-emerald-700">
              📸 Capture
            </button>
            <button type="button" onClick={stopCamera}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={startCamera}
          className="w-full rounded-xl border-2 border-dashed border-gray-300 py-8 text-center text-sm text-gray-400 hover:border-violet-400 hover:text-violet-500 transition-colors">
          <span className="block text-2xl mb-1">📷</span>
          Open camera to take photo
        </button>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

export default function AgentVerificationModal({ onClose }: { onClose: () => void }) {
  const [selfie, setSelfie] = useState<string | null>(null)
  const [idFront, setIdFront] = useState<string | null>(null)
  const [idBack, setIdBack] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    if (!selfie) { setError('Selfie photo is required.'); return }
    if (!idFront) { setError('ID front photo is required.'); return }
    if (!idBack) { setError('ID back photo is required.'); return }

    startTransition(async () => {
      try {
        const [selfieUrl, idFrontUrl, idBackUrl] = await Promise.all([
          uploadBase64(selfie, 'ads/verification'),
          uploadBase64(idFront, 'ads/verification'),
          uploadBase64(idBack, 'ads/verification'),
        ])
        const fd = new FormData(formRef.current!)
        fd.set('selfieUrl', selfieUrl)
        fd.set('idFrontUrl', idFrontUrl)
        fd.set('idBackUrl', idBackUrl)
        const res = await submitAgentVerification(fd)
        if (res.success) setDone(true)
        else setError(res.error)
      } catch {
        setError('Failed to upload photos. Please try again.')
      }
    })
  }

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6 text-center space-y-4">
        <div className="text-5xl">✅</div>
        <p className="text-lg font-black text-gray-800">Verification Submitted!</p>
        <p className="text-sm text-gray-500">Your details are under admin review. You will be notified once approved.</p>
        <button onClick={onClose} className="w-full rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 py-2.5 text-sm font-bold text-white">Close</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        <div className="bg-linear-to-r from-indigo-800 to-violet-800 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs text-white/60 uppercase tracking-widest">Agent Registration</p>
            <p className="text-sm font-bold text-white mt-0.5">Verify Your Identity</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 text-lg">×</button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
            All information is kept confidential and used only for agent verification purposes.
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">KRA PIN <span className="text-red-400">*</span></label>
              <input type="text" name="kraPin" required placeholder="A123456789B" className={ic} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">National ID Number <span className="text-red-400">*</span></label>
              <input type="text" name="idNumber" required placeholder="12345678" className={ic} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Phone Number <span className="text-red-400">*</span></label>
            <input type="tel" name="tel" required placeholder="07XXXXXXXX" maxLength={10} pattern="^(07|01)\d{8}$" className={ic} />
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">📷 Photo Verification — Camera Only (No File Upload)</p>
            <CameraCapture label="Selfie (Face clearly visible)" captured={selfie} onCapture={(d) => setSelfie(d || null)} />
            <CameraCapture label="National ID — Front" captured={idFront} onCapture={(d) => setIdFront(d || null)} />
            <CameraCapture label="National ID — Back" captured={idBack} onCapture={(d) => setIdBack(d || null)} />
          </div>

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

          <button type="submit" disabled={isPending}
            className="w-full rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-60 hover:from-violet-500 hover:to-indigo-500 transition-all">
            {isPending ? 'Uploading & Submitting…' : 'Submit Verification'}
          </button>
        </form>
      </div>
    </div>
  )
}
