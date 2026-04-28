const BASE = 'https://sandbox.safaricom.co.ke'

function timestamp(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14)
}

function password(ts: string): string {
  const sc = process.env.MPESA_SHORTCODE!
  const pk = process.env.MPESA_PASSKEY!
  return Buffer.from(`${sc}${pk}${ts}`).toString('base64')
}

// Cache token for 50 min (tokens last 1 hour)
let _tokenCache: { value: string; expiresAt: number } | null = null

async function token(): Promise<string> {
  const now = Date.now()
  if (_tokenCache && now < _tokenCache.expiresAt) return _tokenCache.value

  const key = process.env.MPESA_CONSUMER_KEY!
  const sec = process.env.MPESA_CONSUMER_SECRET!
  const creds = Buffer.from(`${key}:${sec}`).toString('base64')
  const res = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
    cache: 'no-store',
  })
  const data = (await res.json()) as { access_token: string }
  _tokenCache = { value: data.access_token, expiresAt: now + 50 * 60 * 1000 }
  return _tokenCache.value
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) return `254${digits.slice(1)}`
  if (digits.startsWith('254')) return digits
  return `254${digits}`
}

export async function stkPush(phone: string, amount: number, ref: string) {
  const tok = await token()
  const ts = timestamp()
  const pw = password(ts)
  const sc = process.env.MPESA_SHORTCODE!
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/mpesa/callback`

  const res = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: sc,
      Password: pw,
      Timestamp: ts,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: normalizePhone(phone),
      PartyB: sc,
      PhoneNumber: normalizePhone(phone),
      CallBackURL: callbackUrl,
      AccountReference: ref.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'Challenge',
      TransactionDesc: 'Challenge Payment',
    }),
  })
  return res.json() as Promise<{
    MerchantRequestID?: string
    CheckoutRequestID?: string
    ResponseCode?: string
    ResponseDescription?: string
    CustomerMessage?: string
    errorCode?: string
    errorMessage?: string
  }>
}

export async function stkQuery(checkoutRequestId: string) {
  const tok = await token()
  const ts = timestamp()
  const pw = password(ts)
  const sc = process.env.MPESA_SHORTCODE!

  const res = await fetch(`${BASE}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: sc,
      Password: pw,
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
  })
  return res.json() as Promise<{
    ResponseCode?: string
    ResultCode?: string | number
    ResultDesc?: string
    errorCode?: string
    errorMessage?: string
  }>
}
