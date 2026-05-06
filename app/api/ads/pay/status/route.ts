import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { stkQuery } from '@/lib/mpesa'
import { activateAdAfterPayment } from '@/app/ads/actions'

export async function GET(req: NextRequest) {
  const checkoutId = req.nextUrl.searchParams.get('checkoutId') ?? ''
  if (!checkoutId) return Response.json({ status: 'failed', reason: 'Missing checkoutId' })

  const stored = await db.adPayment.findUnique({ where: { checkoutId } })
  if (stored) {
    if (stored.status === 'success') return Response.json({ status: 'success' })
    if (stored.status === 'cancelled') return Response.json({ status: 'cancelled', reason: 'Payment cancelled' })
    if (stored.status === 'failed') return Response.json({ status: 'failed', reason: 'Payment failed' })
  }

  try {
    const result = await stkQuery(checkoutId)
    const rc = String(result.ResultCode ?? '')

    if (rc === '0') {
      if (stored?.adId) {
        await activateAdAfterPayment(stored.adId, checkoutId, stored.phone ?? '', stored.amount ?? 0)
      }
      await db.adPayment.updateMany({ where: { checkoutId }, data: { status: 'success' } })
      return Response.json({ status: 'success' })
    }
    if (rc === '1032') {
      await db.adPayment.updateMany({ where: { checkoutId }, data: { status: 'cancelled' } })
      return Response.json({ status: 'cancelled', reason: 'Payment cancelled by user' })
    }
    if (rc !== '' && rc !== 'undefined') {
      await db.adPayment.updateMany({ where: { checkoutId }, data: { status: 'failed' } })
      return Response.json({ status: 'failed', reason: result.ResultDesc ?? 'Payment failed' })
    }
    return Response.json({ status: 'pending' })
  } catch {
    return Response.json({ status: 'pending' })
  }
}
