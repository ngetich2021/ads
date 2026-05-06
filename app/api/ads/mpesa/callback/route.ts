import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { activateAdAfterPayment } from '@/app/ads/actions'

interface StkCallback {
  Body: {
    stkCallback: {
      CheckoutRequestID: string
      ResultCode: number
      ResultDesc: string
      CallbackMetadata?: { Item: Array<{ Name: string; Value?: string | number }> }
    }
  }
}

function meta(items: Array<{ Name: string; Value?: string | number }>, name: string) {
  return items.find(i => i.Name === name)?.Value ?? null
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StkCallback
    const cb = body?.Body?.stkCallback
    if (!cb?.CheckoutRequestID) return new Response('OK', { status: 200 })

    const rc = cb.ResultCode
    const items = cb.CallbackMetadata?.Item ?? []
    const status = rc === 0 ? 'success' : rc === 1032 ? 'cancelled' : 'failed'
    const mpesaRef = String(meta(items, 'MpesaReceiptNumber') ?? '')
    const amount = Number(meta(items, 'Amount') ?? 0)
    const phone = String(meta(items, 'PhoneNumber') ?? '')

    const payment = await db.adPayment.upsert({
      where: { checkoutId: cb.CheckoutRequestID },
      create: { checkoutId: cb.CheckoutRequestID, adId: '', status, mpesaRef, amount, phone },
      update: { status, mpesaRef, amount, phone },
    })

    if (status === 'success' && payment.adId) {
      await activateAdAfterPayment(payment.adId, cb.CheckoutRequestID, phone, amount, mpesaRef)
    }
  } catch (e) {
    console.error('Ad MPesa callback error', e)
  }
  return new Response('OK', { status: 200 })
}
