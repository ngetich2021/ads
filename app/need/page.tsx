'use client'

import { useActionState } from 'react'
import { createNeedRequest } from './actions'

const COMM_METHODS = [
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Call' },
]

export default function NeedPage() {
  const [state, formAction, pending] = useActionState(createNeedRequest, null)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-lg p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Tell us what you need</h1>
        <p className="text-gray-500 text-sm mb-7">Our agents will review your request and get back to you shortly.</p>

        <form action={formAction} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="name">
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. Alex Mwangi"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="description">
              Describe your need
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={4}
              placeholder="e.g. House hunting in Nairobi, Ruiru town. Single room, budget KES 4,000."
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Communication method */}
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">Preferred contact method</p>
            <div className="grid grid-cols-2 gap-2">
              {COMM_METHODS.map((m) => (
                <label
                  key={m.value}
                  className="flex items-center gap-2.5 border border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:border-blue-400 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 transition-colors"
                >
                  <input
                    type="radio"
                    name="commMethod"
                    value={m.value}
                    required
                    className="accent-blue-600 shrink-0"
                  />
                  <span className="text-sm font-medium text-gray-700">{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="phone">
              Phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              placeholder="e.g. 0712 345 678"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {state?.error && (
            <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
          >
            {pending ? 'Submitting…' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  )
}
