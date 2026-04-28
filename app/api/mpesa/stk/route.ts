import { NextRequest } from 'next/server'
import { stkPush } from '@/lib/mpesa'

export async function POST(req: NextRequest) {
  try {
    const { phone, amount, ref } = (await req.json()) as { phone: string; amount: number; ref: string }
    if (!phone || !amount) return Response.json({ error: 'Missing phone or amount' }, { status: 400 })

    const result = await stkPush(phone, amount, ref ?? 'Challenge')

    if (result.ResponseCode === '0' && result.CheckoutRequestID) {
      return Response.json({ checkoutId: result.CheckoutRequestID, message: result.CustomerMessage })
    }
    return Response.json({ error: result.errorMessage ?? result.ResponseDescription ?? 'STK push failed' }, { status: 400 })
  } catch (e) {
    console.error('STK push error', e)
    return Response.json({ error: 'M-Pesa service unavailable' }, { status: 500 })
  }
}
