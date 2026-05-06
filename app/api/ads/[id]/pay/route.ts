import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { stkPush } from '@/lib/mpesa'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { phone } = (await req.json()) as { phone: string }
    if (!phone) return Response.json({ error: 'Phone number is required.' }, { status: 400 })

    const ad = await db.ad.findUnique({
      where: { id },
      select: { status: true, invoiceAmount: true, title: true },
    })
    if (!ad) return Response.json({ error: 'Ad not found.' }, { status: 404 })
    if (ad.status !== 'AWAITING_PAYMENT') return Response.json({ error: 'Ad is not awaiting payment.' }, { status: 400 })
    if (!ad.invoiceAmount) return Response.json({ error: 'No invoice amount set by admin.' }, { status: 400 })

    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/ads/mpesa/callback`
    const result = await stkPush(phone, ad.invoiceAmount, `Ad:${id.slice(-8)}`, callbackUrl)

    if (result.ResponseCode === '0' && result.CheckoutRequestID) {
      await db.adPayment.upsert({
        where: { checkoutId: result.CheckoutRequestID },
        create: { adId: id, checkoutId: result.CheckoutRequestID, status: 'PENDING', phone },
        update: { status: 'PENDING' },
      })
      return Response.json({ checkoutId: result.CheckoutRequestID, message: result.CustomerMessage })
    }
    return Response.json({ error: result.errorMessage ?? result.ResponseDescription ?? 'STK push failed' }, { status: 400 })
  } catch (e) {
    console.error('Ad STK push error', e)
    return Response.json({ error: 'M-Pesa service unavailable' }, { status: 500 })
  }
}
