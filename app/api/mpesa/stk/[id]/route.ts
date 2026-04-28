import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { stkQuery } from '@/lib/mpesa'

function generateTrackingNumber(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'TRK'
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

async function settlePayment(checkoutId: string, status: 'success' | 'cancelled' | 'failed', resultDesc?: string) {
  // Only write if not already settled — prevents double-writes when both callback and polling fire
  const existing = await db.mpesaPayment.findUnique({ where: { checkoutId } })
  if (!existing || existing.status !== 'pending') return existing

  const payment = await db.mpesaPayment.update({
    where: { checkoutId },
    data: { status, resultDesc: resultDesc ?? null },
  })

  // Mark linked NeedRequest as paid and assign tracking number
  if (status === 'success' && payment.needRequestId) {
    const req = await db.needRequest.findUnique({ where: { id: payment.needRequestId } })
    if (req && req.status !== 'PAID') {
      let trackingNumber = generateTrackingNumber()
      const collision = await db.needRequest.findUnique({ where: { trackingNumber } })
      if (collision) trackingNumber = generateTrackingNumber()

      await db.needRequest.update({
        where: { id: payment.needRequestId },
        data: { status: 'PAID', trackingNumber },
      })
    }
  }

  return payment
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Fast path: callback already stored a terminal result
  const stored = await db.mpesaPayment.findUnique({ where: { checkoutId: id } })
  if (stored) {
    if (stored.status === 'success')   return Response.json({ status: 'success' })
    if (stored.status === 'cancelled') return Response.json({ status: 'cancelled', reason: 'Payment cancelled by user' })
    if (stored.status === 'failed')    return Response.json({ status: 'failed', reason: stored.resultDesc ?? 'Payment failed' })
    // status === 'pending' — fall through to query Safaricom
  }

  // Slow path: query Safaricom directly and write result to DB so subsequent
  // calls hit the fast path and the UI reflects the real state immediately.
  try {
    const result = await stkQuery(id)
    const rc = String(result.ResultCode ?? '')

    if (rc === '0') {
      await settlePayment(id, 'success', result.ResultDesc ?? 'Success')
      return Response.json({ status: 'success' })
    }
    if (rc === '1032') {
      await settlePayment(id, 'cancelled', 'Payment cancelled by user')
      return Response.json({ status: 'cancelled', reason: 'Payment cancelled by user' })
    }
    if (rc === '1037') {
      await settlePayment(id, 'failed', 'Transaction timed out')
      return Response.json({ status: 'failed', reason: 'Transaction timed out' })
    }
    if (rc !== '' && rc !== 'undefined') {
      await settlePayment(id, 'failed', result.ResultDesc ?? 'Payment failed')
      return Response.json({ status: 'failed', reason: result.ResultDesc ?? 'Payment failed' })
    }

    return Response.json({ status: 'pending' })
  } catch {
    return Response.json({ status: 'pending' })
  }
}
