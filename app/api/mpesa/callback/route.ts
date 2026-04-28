import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

interface StkCallback {
  Body: {
    stkCallback: {
      CheckoutRequestID: string
      ResultCode: number
      ResultDesc: string
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value?: string | number }>
      }
    }
  }
}

function meta(items: Array<{ Name: string; Value?: string | number }>, name: string) {
  return items.find(i => i.Name === name)?.Value ?? null
}

function generateTrackingNumber(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'TRK'
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StkCallback
    const cb = body?.Body?.stkCallback
    if (!cb?.CheckoutRequestID) return new Response('OK', { status: 200 })

    const rc = cb.ResultCode
    const items = cb.CallbackMetadata?.Item ?? []

    let status: string
    if (rc === 0) status = 'success'
    else if (rc === 1032) status = 'cancelled'
    else status = 'failed'

    const payment = await db.mpesaPayment.upsert({
      where: { checkoutId: cb.CheckoutRequestID },
      create: {
        checkoutId: cb.CheckoutRequestID,
        status,
        resultCode: String(rc),
        resultDesc: cb.ResultDesc,
        mpesaRef: String(meta(items, 'MpesaReceiptNumber') ?? ''),
        amount: Number(meta(items, 'Amount') ?? 0),
        phone: String(meta(items, 'PhoneNumber') ?? ''),
      },
      update: {
        status,
        resultCode: String(rc),
        resultDesc: cb.ResultDesc,
        mpesaRef: String(meta(items, 'MpesaReceiptNumber') ?? ''),
        amount: Number(meta(items, 'Amount') ?? 0),
        phone: String(meta(items, 'PhoneNumber') ?? ''),
      },
    })

    // If this payment is for a NeedRequest and it succeeded, mark it paid
    if (status === 'success' && payment.needRequestId) {
      let trackingNumber = generateTrackingNumber()
      // Retry on collision (highly unlikely)
      const existing = await db.needRequest.findUnique({ where: { trackingNumber } })
      if (existing) trackingNumber = generateTrackingNumber()

      await db.needRequest.update({
        where: { id: payment.needRequestId },
        data: { status: 'PAID', trackingNumber },
      })
    }
  } catch (e) {
    console.error('MPesa callback error', e)
  }
  // Always return 200 — Safaricom expects it
  return new Response('OK', { status: 200 })
}
