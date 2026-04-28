import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import PaymentForm from './PaymentForm'

const COMM_LABEL: Record<string, string> = {
  sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email', call: 'Call',
}

export default async function NeedRequestPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const req = await db.needRequest.findUnique({ where: { id } })
  if (!req) notFound()

  const { status } = req

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">

        {/* Letter header — always shown */}
        <div className="space-y-1">
          <p className="text-lg font-semibold text-gray-900">Dear {req.name},</p>
          <p className="text-sm text-gray-500">
            {COMM_LABEL[req.commMethod] ?? req.commMethod} · {req.phone}
          </p>
        </div>

        <p className="text-gray-700 text-[15px] leading-relaxed">
          You requested: <span className="font-medium">{req.description}</span>
        </p>

        <hr className="border-gray-100" />

        {/* ── SUBMITTED: waiting for agent ── */}
        {status === 'SUBMITTED' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-xl">⏳</span>
              <p className="font-semibold text-amber-800">Pending agent review</p>
            </div>
            <p className="text-sm text-amber-700">
              Your request has been received. Our agent will review it and reach out via{' '}
              <span className="font-medium">{COMM_LABEL[req.commMethod] ?? req.commMethod}</span>.
            </p>
            <p className="text-sm text-amber-600">
              Once reviewed, come back here or use the{' '}
              <strong>Check Status</strong> tab on the market page to see the agent&apos;s message and complete payment.
            </p>
          </div>
        )}

        {/* ── REVIEWED: agent has responded, payment needed ── */}
        {status === 'REVIEWED' && (
          <>
            <div className="space-y-4 text-gray-800 text-[15px] leading-relaxed">
              {req.agentComments && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">Agent message</p>
                  <p className="text-blue-900 whitespace-pre-wrap">{req.agentComments}</p>
                </div>
              )}

              <p>You will be working closely with our agents.</p>

              <p>
                You will be required to pay{' '}
                <span className="font-bold text-green-700">
                  KES {req.requestedAmount?.toLocaleString()}
                </span>{' '}
                for this service. If the request is not fulfilled, you will be fully refunded.
              </p>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <p className="font-semibold text-gray-700 text-sm">Once paid:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 text-sm">
                  <li>You will be given a tracking number.</li>
                  <li>Stay on WhatsApp for easy communication and photo sharing.</li>
                </ul>
              </div>
            </div>

            <hr className="border-gray-100" />
            <PaymentForm id={req.id} amount={req.requestedAmount!} />
          </>
        )}

        {/* ── PAID: show tracking number ── */}
        {status === 'PAID' && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-800 font-semibold text-lg">Payment Confirmed!</p>
            <p className="text-gray-500 text-sm">Your tracking number</p>
            <p className="font-mono text-3xl font-bold text-gray-900 tracking-widest">{req.trackingNumber}</p>
            <p className="text-gray-500 text-sm">Use this number to track progress. Stay on WhatsApp.</p>
          </div>
        )}

        {/* ── COMPLETED ── */}
        {status === 'COMPLETED' && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 text-center space-y-2">
            <p className="text-gray-700 font-semibold text-lg">Request Completed ✓</p>
            {req.agentComments && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{req.agentComments}</p>
            )}
          </div>
        )}

        <p className="text-gray-400 text-sm italic text-center">
          Thank you for trusting us with the task. It is our pleasure to serve you always.
        </p>
      </div>
    </div>
  )
}
