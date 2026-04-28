'use server'

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { stkPush } from '@/lib/mpesa'

export async function createNeedRequest(
  _prev: { error?: string } | null,
  formData: FormData,
) {
  const name = (formData.get('name') as string)?.trim()
  const description = (formData.get('description') as string)?.trim()
  const commMethod = (formData.get('commMethod') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim()

  if (!name || !description || !commMethod || !phone) {
    return { error: 'Please fill in all fields.' }
  }

  const req = await db.needRequest.create({
    data: { name, description, commMethod, phone },
  })

  redirect(`/need/${req.id}`)
}

export async function checkStatusByPhone(
  _prev: { error?: string; results?: NeedStatusResult[] } | null,
  formData: FormData,
) {
  const phone = (formData.get('phone') as string)?.trim()
  if (!phone) return { error: 'Please enter your phone number.' }

  const requests = await db.needRequest.findMany({
    where: { phone },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      agentComments: true,
      requestedAmount: true,
      trackingNumber: true,
      createdAt: true,
    },
  })

  if (requests.length === 0) {
    return { error: 'No requests found for this phone number.' }
  }

  return {
    results: requests.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}

export type NeedStatusResult = {
  id: string
  name: string
  description: string
  status: string
  agentComments: string | null
  requestedAmount: number | null
  trackingNumber: string | null
  createdAt: string
}

export async function submitClientFeedback(
  trackingNumber: string,
  feedback: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!feedback.trim()) return { ok: false, error: 'Please write something before submitting.' }
  const req = await db.needRequest.findUnique({ where: { trackingNumber } })
  if (!req) return { ok: false, error: 'Tracking number not found.' }
  if (req.status !== 'AWAITING_FEEDBACK') return { ok: false, error: 'This request is not awaiting confirmation.' }
  try {
    await db.needRequest.update({
      where: { trackingNumber },
      data: { clientFeedback: feedback.trim(), status: 'DELIVERED' },
    })
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save your feedback. Please try again.' }
  }
}

export async function initiatePayment(
  id: string,
  mpesaNumber: string,
  whatsappNumber: string,
): Promise<{ ok: true; checkoutId: string } | { ok: false; error: string }> {
  const req = await db.needRequest.findUnique({ where: { id } })
  if (!req) return { ok: false, error: 'Request not found.' }
  if (req.status !== 'REVIEWED') return { ok: false, error: 'Request has not been reviewed yet.' }
  if (!req.requestedAmount) return { ok: false, error: 'Agent has not set a payment amount yet.' }

  await db.needRequest.update({
    where: { id },
    data: { mpesaNumber, whatsappNumber },
  })

  const result = await stkPush(mpesaNumber, req.requestedAmount, `NEED${id.slice(-8).toUpperCase()}`)

  if (result.ResponseCode === '0' && result.CheckoutRequestID) {
    await db.mpesaPayment.create({
      data: {
        checkoutId: result.CheckoutRequestID,
        status: 'pending',
        needRequestId: id,
      },
    })
    return { ok: true, checkoutId: result.CheckoutRequestID }
  }

  return {
    ok: false,
    error: result.errorMessage ?? result.ResponseDescription ?? 'STK push failed.',
  }
}
