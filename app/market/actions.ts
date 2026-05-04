'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { uploadFile } from '@/lib/cloudinary'

async function requireAuth(): Promise<{ success: false; error: string } | null> {
  const session = await auth()
  if (!session?.user) return { success: false, error: 'You must be signed in to perform this action.' }
  return null
}

async function requireAgentScope(targetCountyId: string | null): Promise<{ success: false; error: string } | null> {
  const session = await auth()
  if (!session?.user?.email) return { success: false, error: 'Not authenticated.' }
  const record = await db.allowedEmail.findUnique({ where: { email: session.user.email } })
  if (!record) return null // not in allowed list means open access — defer to caller
  if (record.countyId === null) return null // global admin — allow all
  if (!targetCountyId) return null // no county restriction on this resource
  const allowed = new Set<string>(parseArr(record.countyIds))
  if (record.countyId) allowed.add(record.countyId)
  if (!allowed.has(targetCountyId)) {
    return { success: false, error: 'You do not have permission to manage this county.' }
  }
  return null
}

function zodError(err: z.ZodError): { success: false; error: string } {
  return { success: false, error: err.issues[0].message }
}

function parseArr(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[]
  try { return JSON.parse(String(v)) } catch { return [] }
}
function jsonArr(arr: string[]): string { return JSON.stringify(arr) }

export type ActionResult = { success: true } | { success: false; error: string }

/* ── Schemas ─────────────────────────────────────────────────────── */

const PriceSchema = z.object({
  marketId: z.string().min(1, 'Market is required'),
  itemId:   z.string().min(1, 'Please select a commodity from the list'),
  price:    z.coerce.number().int().positive('Price must be a positive whole number'),
})

const ItemSchema = z.object({
  name:        z.string().min(1, 'Commodity name is required').trim(),
  unitMeasure: z.string().trim().default('kg'),
  type:        z.enum(['commodity', 'labour']).default('commodity'),
})

const UpdateItemSchema = ItemSchema.extend({
  id: z.string().min(1, 'Missing item ID'),
})

const MarketSchema = z.object({
  marketName: z.string().min(1, 'Market name is required').trim().transform((v) => v.toUpperCase()),
  countyId:   z.string().min(1, 'County is required'),
})

const CountySchema = z.object({
  countyName: z.string().min(1, 'County name is required').trim(),
  countryId:  z.string().optional().transform((v) => v?.trim() || undefined),
})

const CountrySchema = z.object({
  countryName: z.string().min(1, 'Country name is required').trim(),
})

const EmailSchema = z.object({
  email: z.email('A valid email address is required').toLowerCase().trim(),
})

const ProfileSchema = z.object({
  fullName:    z.string().trim().optional().transform((v) => v || null),
  tel:         z.string().trim().optional().transform((v) => v || null),
  mpesaNumber: z.string().trim().optional().transform((v) => v || null),
})

/* ── Types ───────────────────────────────────────────────────────── */

export type PriceRow = {
  id: string
  price: number
  prevPrice: number | null
  updatedAt: string
  item: { id: string; name: string; unitMeasure: string }
  market: { id: string; name: string; county: { id: string; name: string } }
}

export type MarketInfo = {
  id: string
  name: string
  countyId: string
}

export type CountryInfo = {
  id: string
  name: string
}

export type CountyInfo = {
  id: string
  name: string
  countryId: string | null
  markets: MarketInfo[]
}

export type ItemInfo = {
  id: string
  name: string
  unitMeasure: string
  type: 'commodity' | 'labour'
}

export type AllowedEmailInfo = {
  id: string; email: string
  countyId: string | null; countyName: string | null
  roles: string[]; countyIds: string[]
}

export type UserProfileInfo = {
  id: string
  email: string
  fullName: string | null
  tel: string | null
  mpesaNumber: string | null
  verificationStatus: string
}

export type DropShipItemInfo = {
  id: string
  orgName: string
  description: string
  location: string
  tel: string
  date: string
  target: 'NATIONAL' | 'REGIONAL'
  targetCountyIds: string[]
  fileName: string
  fileMime: string
  fileUrl: string | null
  createdAt: string
}

/* ── Queries ─────────────────────────────────────────────────────── */

export async function getAllData(): Promise<{
  countries: CountryInfo[]
  counties: CountyInfo[]
  items: ItemInfo[]
  prices: PriceRow[]
}> {
  const [rawCountries, rawCounties, items, rawPrices] = await Promise.all([
    db.country.findMany({ orderBy: { name: 'asc' } }),
    db.county.findMany({
      include: { markets: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    }),
    db.item.findMany({ orderBy: { name: 'asc' } }),
    db.marketPrice.findMany({
      include: { item: true, market: { include: { county: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  // Kenya first, then alphabetical; deduplicate by name (keep first occurrence)
  const countries: CountryInfo[] = rawCountries
    .map((c) => ({ id: c.id, name: c.name }))
    .filter((c, i, arr) => arr.findIndex((x) => x.name.toLowerCase() === c.name.toLowerCase()) === i)
    .sort((a, b) => a.name === 'Kenya' ? -1 : b.name === 'Kenya' ? 1 : a.name.localeCompare(b.name))

  // Nairobi first within each country, then alphabetical
  const counties: CountyInfo[] = rawCounties
    .map((c) => ({
      id: c.id,
      name: c.name,
      countryId: c.countryId,
      markets: c.markets.map((m) => ({ id: m.id, name: m.name, countyId: c.id })),
    }))
    .sort((a, b) => a.name === 'Nairobi' ? -1 : b.name === 'Nairobi' ? 1 : a.name.localeCompare(b.name))

  const prices: PriceRow[] = rawPrices.map((p) => ({
    id: p.id,
    price: p.price,
    prevPrice: p.prevPrice,
    updatedAt: p.updatedAt.toISOString(),
    item: { id: p.item.id, name: p.item.name, unitMeasure: p.item.unitMeasure, type: (p.item.type ?? 'commodity') as 'commodity' | 'labour' },
    market: {
      id: p.market.id,
      name: p.market.name,
      county: { id: p.market.county.id, name: p.market.county.name },
    },
  }))

  const typedItems: ItemInfo[] = items.map((i) => ({
    id: i.id, name: i.name, unitMeasure: i.unitMeasure, type: (i.type ?? 'commodity') as 'commodity' | 'labour',
  }))

  return { countries, counties, items: typedItems, prices }
}

export async function getAllowedEmails(): Promise<AllowedEmailInfo[]> {
  const rows = await db.allowedEmail.findMany({
    include: { county: true },
    orderBy: { email: 'asc' },
  })
  return rows.map((r) => ({
    id: r.id, email: r.email,
    countyId: r.county?.id ?? null, countyName: r.county?.name ?? null,
    roles: parseArr(r.roles), countyIds: parseArr(r.countyIds),
  }))
}

export async function getUserProfile(email: string): Promise<UserProfileInfo | null> {
  if (!email) return null
  const p = await db.userProfile.findUnique({ where: { email } })
  if (!p) return null
  return { id: p.id, email: p.email, fullName: p.fullName, tel: p.tel, mpesaNumber: p.mpesaNumber, verificationStatus: p.verificationStatus }
}

/* ── Mutations ───────────────────────────────────────────────────── */

export async function addAllowedEmail(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const parsed = EmailSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return zodError(parsed.error)
  try {
    await db.allowedEmail.create({ data: { email: parsed.data.email } })
    return { success: true }
  } catch {
    return { success: false, error: 'Email already exists or could not be added.' }
  }
}

export async function removeAllowedEmail(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const parsed = z.string().min(1).safeParse(id)
  if (!parsed.success) return { success: false, error: 'Invalid ID.' }
  try {
    await db.allowedEmail.delete({ where: { id: parsed.data } })
    return { success: true }
  } catch {
    return { success: false, error: 'Could not remove this email.' }
  }
}

export async function assignEmailToCounty(id: string, countyId: string | null): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const parsed = z.object({
    id:       z.string().min(1),
    countyId: z.string().min(1).nullable(),
  }).safeParse({ id, countyId })
  if (!parsed.success) return zodError(parsed.error)
  try {
    await db.allowedEmail.update({ where: { id: parsed.data.id }, data: { countyId: parsed.data.countyId } })
    return { success: true }
  } catch {
    return { success: false, error: 'Could not update user assignment.' }
  }
}

export async function upsertPrice(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const parsed = PriceSchema.safeParse({
    marketId: formData.get('marketId'),
    itemId:   formData.get('itemId'),
    price:    formData.get('price'),
  })
  if (!parsed.success) return zodError(parsed.error)
  const { marketId, itemId, price } = parsed.data
  const market = await db.market.findUnique({ where: { id: marketId }, select: { countyId: true } })
  if (!market) return { success: false, error: 'Market not found.' }
  const scopeDenied = await requireAgentScope(market.countyId)
  if (scopeDenied) return scopeDenied
  try {
    const existing = await db.marketPrice.findUnique({ where: { marketId_itemId: { marketId, itemId } } })
    if (existing) {
      await db.marketPrice.update({ where: { id: existing.id }, data: { price, prevPrice: existing.price } })
    } else {
      await db.marketPrice.create({ data: { marketId, itemId, price } })
    }
    revalidatePath('/market')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to save price. Please try again.' }
  }
}

export async function deletePrice(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const row = await db.marketPrice.findUnique({ where: { id }, include: { market: { select: { countyId: true } } } })
  if (!row) return { success: false, error: 'Price not found.' }
  const scopeDenied = await requireAgentScope(row.market.countyId)
  if (scopeDenied) return scopeDenied
  try {
    await db.marketPrice.delete({ where: { id } })
    revalidatePath('/market')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to delete this entry.' }
  }
}

export async function createItem(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const parsed = ItemSchema.safeParse({
    name:        formData.get('name'),
    unitMeasure: formData.get('unitMeasure') || 'kg',
    type:        formData.get('type') || 'commodity',
  })
  if (!parsed.success) return zodError(parsed.error)
  try {
    await db.item.create({ data: parsed.data })
    revalidatePath('/market')
    return { success: true }
  } catch {
    return { success: false, error: 'Commodity already exists or could not be created.' }
  }
}

export async function updateItem(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const parsed = UpdateItemSchema.safeParse({
    id:          formData.get('id'),
    name:        formData.get('name'),
    unitMeasure: formData.get('unitMeasure') || 'kg',
    type:        formData.get('type') || 'commodity',
  })
  if (!parsed.success) return zodError(parsed.error)
  const { id, name, unitMeasure, type } = parsed.data
  try {
    await db.item.update({ where: { id }, data: { name, unitMeasure, type } })
    revalidatePath('/market')
    return { success: true }
  } catch {
    return { success: false, error: 'Name already exists or could not be updated.' }
  }
}

export async function deleteItem(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.item.delete({ where: { id } })
    revalidatePath('/market')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not delete commodity (it may still have prices attached).' }
  }
}

export async function createCountry(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const parsed = CountrySchema.safeParse({ countryName: formData.get('countryName') })
  if (!parsed.success) return zodError(parsed.error)
  try {
    await db.country.create({ data: { name: parsed.data.countryName } })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Country already exists or could not be created.' }
  }
}

export async function createCounty(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const parsed = CountySchema.safeParse({
    countyName: formData.get('countyName'),
    countryId:  formData.get('countryId'),
  })
  if (!parsed.success) return zodError(parsed.error)
  try {
    await db.county.create({ data: { name: parsed.data.countyName, countryId: parsed.data.countryId ?? null } })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'County already exists or could not be created.' }
  }
}

export async function createMarket(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const parsed = MarketSchema.safeParse({
    marketName: formData.get('marketName'),
    countyId:   formData.get('countyId'),
  })
  if (!parsed.success) return zodError(parsed.error)
  try {
    await db.market.create({ data: { name: parsed.data.marketName, countyId: parsed.data.countyId } })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Market already exists in this county or could not be created.' }
  }
}

export async function upsertUserProfile(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { success: false, error: 'Not signed in.' }
  const parsed = ProfileSchema.safeParse({
    fullName:    formData.get('fullName'),
    tel:         formData.get('tel'),
    mpesaNumber: formData.get('mpesaNumber'),
  })
  if (!parsed.success) return zodError(parsed.error)
  try {
    await db.userProfile.upsert({
      where: { email },
      update: parsed.data,
      create: { email, ...parsed.data },
    })
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not save profile.' }
  }
}

/* ── Drop Ship ───────────────────────────────────────────────────── */

const ALLOWED_MIME_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
]

const DropShipMetaSchema = z.object({
  orgName:     z.string().min(1, 'Organization name is required').trim(),
  description: z.string().min(1, 'Description is required').trim(),
  location:    z.string().min(1, 'Location is required').trim(),
  tel:         z.string().min(1, 'Phone number is required').trim(),
  date:        z.string().min(1, 'Date is required'),
  target:      z.enum(['NATIONAL', 'REGIONAL']),
})

export async function getDropShipItems(): Promise<DropShipItemInfo[]> {
  const rows = await db.dropShipItem.findMany({
    select: {
      id: true, orgName: true, description: true, location: true,
      tel: true, date: true, target: true, targetCountyIds: true,
      fileName: true, fileMime: true, fileUrl: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((r) => ({
    id: r.id,
    orgName: r.orgName,
    description: r.description,
    location: r.location,
    tel: r.tel,
    date: r.date.toISOString(),
    target: r.target as 'NATIONAL' | 'REGIONAL',
    targetCountyIds: parseArr(r.targetCountyIds),
    fileName: r.fileName,
    fileMime: r.fileMime,
    fileUrl: r.fileUrl,
    createdAt: r.createdAt.toISOString(),
  }))
}

function parseDropShipMeta(formData: FormData) {
  const target = formData.get('target') as string
  const targetCountyIds = formData.getAll('targetCountyIds').map(String).filter(Boolean)

  const parsed = DropShipMetaSchema.safeParse({
    orgName:     formData.get('orgName'),
    description: formData.get('description'),
    location:    formData.get('location'),
    tel:         formData.get('tel'),
    date:        formData.get('date'),
    target,
  })
  if (!parsed.success) return { ok: false as const, error: zodError(parsed.error) }
  if (parsed.data.target === 'REGIONAL' && targetCountyIds.length === 0) {
    return { ok: false as const, error: { success: false as const, error: 'Select at least one county for Regional targeting.' } }
  }
  return { ok: true as const, data: { ...parsed.data, targetCountyIds, date: new Date(parsed.data.date) } }
}

export async function createDropShipItem(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied

  const meta = parseDropShipMeta(formData)
  if (!meta.ok) return meta.error

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { success: false, error: 'A file is required.' }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) return { success: false, error: 'Only Excel, Word, or PDF files are allowed.' }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    let fileUrl: string | null = null
    try {
      const uploaded = await uploadFile(buf, { folder: 'ads/dropship', filename: file.name, resourceType: 'raw' })
      fileUrl = uploaded.url
    } catch { /* fall back to DB storage */ }

    await db.dropShipItem.create({
      data: { ...meta.data, targetCountyIds: jsonArr(meta.data.targetCountyIds), fileName: file.name, fileData: fileUrl ? null : buf, fileMime: file.type, fileUrl },
    })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not create drop ship item.' }
  }
}

export async function updateDropShipItem(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied

  const id = z.string().min(1).safeParse(formData.get('id'))
  if (!id.success) return { success: false, error: 'Invalid ID.' }

  const meta = parseDropShipMeta(formData)
  if (!meta.ok) return meta.error

  const file = formData.get('file')
  const hasNewFile = file instanceof File && file.size > 0
  if (hasNewFile && !ALLOWED_MIME_TYPES.includes((file as File).type)) {
    return { success: false, error: 'Only Excel, Word, or PDF files are allowed.' }
  }

  try {
    let fileFields: Record<string, unknown> = {}
    if (hasNewFile) {
      const f = file as File
      const buf = Buffer.from(await f.arrayBuffer())
      let fileUrl: string | null = null
      try {
        const uploaded = await uploadFile(buf, { folder: 'ads/dropship', filename: f.name, resourceType: 'raw' })
        fileUrl = uploaded.url
      } catch { /* fall back */ }
      fileFields = { fileName: f.name, fileData: fileUrl ? null : buf, fileMime: f.type, fileUrl }
    }
    await db.dropShipItem.update({ where: { id: id.data }, data: { ...meta.data, targetCountyIds: jsonArr(meta.data.targetCountyIds), ...fileFields } })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not update drop ship item.' }
  }
}

export async function deleteDropShipItem(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const parsed = z.string().min(1).safeParse(id)
  if (!parsed.success) return { success: false, error: 'Invalid ID.' }
  try {
    await db.dropShipItem.delete({ where: { id: parsed.data } })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not delete drop ship item.' }
  }
}

/* ── Challenge ───────────────────────────────────────────────────── */

export type RangeEntry = { count: number; amount: number }

export type PlatformConfig = {
  platform: string
  targetCount: number
  ranges: RangeEntry[]
}

const CHALLENGE_PLATFORM_LABELS: Record<string, string> = { ig: 'Instagram', x: 'X / Twitter', tiktok: 'TikTok', fb: 'Facebook' }

export type PaymentRecord = {
  id: string
  checkoutId: string
  status: string
  mpesaRef: string | null
  amount: number | null
  phone: string | null
  createdAt: string
}

export type ChallengeInfo = {
  id: string
  orgName: string
  tel: string
  description: string
  repostUrl: string
  platforms: string[]
  mpesaNo: string
  closingTime: string
  paymentTime: string
  targetCount: number
  platformConfigs: PlatformConfig[]
  target: 'NATIONAL' | 'REGIONAL'
  targetCountyIds: string[]
  published: boolean
  createdAt: string
  submissionCount: number
  payments: PaymentRecord[]
}

export type PublicChallengeInfo = {
  id: string
  description: string
  closingTime: string
  paymentTime: string
  platformConfigs: PlatformConfig[]
  platforms: string[]
  target: 'NATIONAL' | 'REGIONAL'
  targetCountyIds: string[]
  createdAt: string
  submissionCount: number
}

export type SubmissionInfo = {
  id: string
  challengeId: string
  mpesaNo: string
  submitUrl: string
  platform: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejectReason: string | null
  createdAt: string
}

const PLATFORM_PATTERNS: Record<string, RegExp> = {
  ig:     /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\//i,
  x:      /^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i,
  tiktok: /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\//i,
  fb:     /^https?:\/\/(www\.)?(facebook\.com|fb\.com|fb\.watch)\//i,
}

const MPESA_RE = /^(07|01)\d{8}$/

function validatePlatformUrl(url: string, platform: string): boolean {
  const re = PLATFORM_PATTERNS[platform]
  return re ? re.test(url) : false
}

const ChallengeSchema = z.object({
  orgName:     z.string().min(1, 'Organization name is required').trim(),
  tel:         z.string().regex(/^(07|01)\d{8}$/, 'Invalid M-Pesa phone number (07xxxxxxxx or 01xxxxxxxx)'),
  description: z.string().min(1, 'Challenge description is required').trim(),
  repostUrl:   z.url('Must be a valid URL'),
  mpesaNo:     z.string().regex(/^(07|01)\d{8}$/, 'Invalid M-Pesa number'),
  closingTime: z.string().min(1, 'Closing time is required'),
  paymentTime: z.string().min(1, 'Payment time is required'),
})

function normalizePlatformConfigs(raw: unknown): PlatformConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  // New format: each element has a `platform` string key
  if (typeof raw[0] === 'object' && raw[0] !== null && 'platform' in raw[0]) {
    return (raw as PlatformConfig[]).map(c => ({
      ...c,
      ranges: Array.isArray(c.ranges) ? c.ranges : [],
    }))
  }
  // Old flat RangeEntry[] format — not renderable without platform info; return empty
  return []
}

export async function getPublicChallenges(): Promise<PublicChallengeInfo[]> {
  const rows = await db.challenge.findMany({
    where: { published: true },
    select: {
      id: true, description: true, closingTime: true, paymentTime: true,
      ranges: true, platforms: true, target: true, targetCountyIds: true, createdAt: true,
      _count: { select: { submissions: { where: { status: 'APPROVED' } } } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    closingTime: r.closingTime.toISOString(),
    paymentTime: r.paymentTime.toISOString(),
    platformConfigs: normalizePlatformConfigs(r.ranges),
    platforms: parseArr(r.platforms),
    target: r.target as 'NATIONAL' | 'REGIONAL',
    targetCountyIds: parseArr(r.targetCountyIds),
    createdAt: r.createdAt.toISOString(),
    submissionCount: r._count.submissions,
  }))
}

export async function getChallengesAdmin(): Promise<ChallengeInfo[]> {
  const denied = await requireAuth()
  if (denied) return []
  const rows = await db.challenge.findMany({
    include: {
      _count: { select: { submissions: true } },
      payments: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((r) => ({
    id: r.id,
    orgName: r.orgName,
    tel: r.tel,
    description: r.description,
    repostUrl: r.repostUrl,
    platforms: parseArr(r.platforms),
    mpesaNo: r.mpesaNo,
    closingTime: r.closingTime.toISOString(),
    paymentTime: r.paymentTime.toISOString(),
    targetCount: r.targetCount,
    platformConfigs: normalizePlatformConfigs(r.ranges),
    target: r.target as 'NATIONAL' | 'REGIONAL',
    targetCountyIds: parseArr(r.targetCountyIds),
    published: r.published,
    createdAt: r.createdAt.toISOString(),
    submissionCount: r._count.submissions,
    payments: r.payments.map((p) => ({
      id: p.id,
      checkoutId: p.checkoutId,
      status: p.status,
      mpesaRef: p.mpesaRef,
      amount: p.amount,
      phone: p.phone,
      createdAt: p.createdAt.toISOString(),
    })),
  }))
}

function err(msg: string) { return { ok: false as const, error: { success: false as const, error: msg } } }

function parsePlatformConfigs(formData: FormData, platforms: string[]): PlatformConfig[] | string {
  const configs: PlatformConfig[] = []
  for (const p of platforms) {
    const tc = parseInt(String(formData.get(`pc_${p}_targetCount`) ?? ''))
    const label = CHALLENGE_PLATFORM_LABELS[p] ?? p
    if (!tc || tc < 1) return `Enter a valid target count for ${label}.`
    const counts  = formData.getAll(`pc_${p}_rangeCount`).map(Number)
    const amounts = formData.getAll(`pc_${p}_rangeAmount`).map(Number)
    if (counts.length === 0 || counts.length !== amounts.length) return `Add at least one prize range for ${label}.`
    const ranges: RangeEntry[] = counts.map((count, i) => ({ count, amount: amounts[i] }))
    for (const r of ranges) {
      if (!Number.isFinite(r.count) || r.count < 1) return `Invalid range count for ${label}.`
      if (!Number.isFinite(r.amount) || r.amount < 1) return `Invalid prize amount for ${label}.`
    }
    const rangeSum = ranges.reduce((s, r) => s + r.count, 0)
    if (rangeSum !== tc) return `${label}: range totals (${rangeSum}) must equal target (${tc}).`
    configs.push({ platform: p, targetCount: tc, ranges })
  }
  return configs
}

function parseChallengeFormData(formData: FormData) {
  const parsed = ChallengeSchema.safeParse({
    orgName:     formData.get('orgName'),
    tel:         formData.get('tel'),
    description: formData.get('description'),
    repostUrl:   formData.get('repostUrl'),
    mpesaNo:     formData.get('mpesaNo'),
    closingTime: formData.get('closingTime'),
    paymentTime: formData.get('paymentTime'),
  })
  if (!parsed.success) return { ok: false as const, error: zodError(parsed.error) }

  const platforms = formData.getAll('platforms').map(String).filter(Boolean)
  if (platforms.length === 0) return err('Select at least one platform.')

  const configsOrErr = parsePlatformConfigs(formData, platforms)
  if (typeof configsOrErr === 'string') return err(configsOrErr)
  const platformConfigs = configsOrErr
  const targetCount = platformConfigs.reduce((s, c) => s + c.targetCount, 0)

  const target = (formData.get('target') as string) === 'REGIONAL' ? 'REGIONAL' : 'NATIONAL'
  const targetCountyIds = formData.getAll('targetCountyIds').map(String).filter(Boolean)
  if (target === 'REGIONAL' && targetCountyIds.length === 0) return err('Select at least one county for Regional targeting.')

  return { ok: true as const, data: { ...parsed.data, platforms, platformConfigs, targetCount, target, targetCountyIds } }
}

function mpesaChargeFn(amount: number): number {
    if (amount <= 49) return 0
  if (amount <= 100) return 0
  if (amount <= 500) return 7
  if (amount <= 1000) return 13
  if (amount <= 1500) return 23
  if (amount <= 2500) return 33
  if (amount <= 3500) return 53
  if (amount <= 5000) return 57
  if (amount <= 7500) return 78
  if (amount <= 10000) return 90
   if (amount <= 15000) return 100
  if (amount <= 20000) return 105
  if (amount <= 35000) return 108
  if (amount <= 50000) return 108
  if (amount <= 250000) return 108
  return 300
}
function calcTotalCost(platformConfigs: PlatformConfig[]): number {
  return platformConfigs.reduce((sum, pc) =>
    sum + pc.ranges.reduce((s, r) => {
      const w = Math.ceil(r.amount * 1.15); return s + (w + mpesaChargeFn(w)) * r.count
    }, 0), 0)
}

export async function submitNewChallenge(
  formData: FormData
): Promise<ActionResult & { challengeId?: string; totalCost?: number }> {
  const meta = parseChallengeFormData(formData)
  if (!meta.ok) return meta.error
  const { platformConfigs, ...rest } = meta.data
  const totalCost = calcTotalCost(platformConfigs)

  // Payment metadata passed from client after STK push confirmation
  const checkoutId = String(formData.get('_checkoutId') ?? '').trim()
  const payerPhone = String(formData.get('_payerPhone') ?? '').trim()
  const paidAmount = parseFloat(String(formData.get('_paidAmount') ?? '0')) || totalCost

  try {
    const challenge = await db.challenge.create({
      data: { ...rest, platforms: jsonArr(rest.platforms), targetCountyIds: jsonArr(rest.targetCountyIds), ranges: platformConfigs, published: false, closingTime: new Date(rest.closingTime), paymentTime: new Date(rest.paymentTime) },
    })

    // Link payment record atomically — called only after confirmed payment
    if (checkoutId) {
      await db.mpesaPayment.upsert({
        where: { checkoutId },
        create: { checkoutId, challengeId: challenge.id, phone: payerPhone, amount: paidAmount, status: 'success' },
        update: { challengeId: challenge.id, status: 'success' },
      })
    }

    revalidatePath('/dashboard')
    return { success: true, challengeId: challenge.id, totalCost }
  } catch {
    return { success: false, error: 'Could not submit challenge.' }
  }
}

export async function createChallenge(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const meta = parseChallengeFormData(formData)
  if (!meta.ok) return meta.error
  const { platformConfigs, ...rest } = meta.data
  try {
    await db.challenge.create({
      data: { ...rest, platforms: jsonArr(rest.platforms), targetCountyIds: jsonArr(rest.targetCountyIds), ranges: platformConfigs, closingTime: new Date(rest.closingTime), paymentTime: new Date(rest.paymentTime) },
    })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not create challenge.' }
  }
}

export async function toggleChallengePublished(id: string, published: boolean): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.challenge.update({ where: { id }, data: { published } })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not update challenge.' }
  }
}

export async function updateChallenge(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const id = z.string().min(1).safeParse(formData.get('id'))
  if (!id.success) return { success: false, error: 'Invalid ID.' }
  const meta = parseChallengeFormData(formData)
  if (!meta.ok) return meta.error
  const { platformConfigs, ...rest } = meta.data
  const published = formData.get('published') === '1'
  try {
    await db.challenge.update({
      where: { id: id.data },
      data: { ...rest, platforms: jsonArr(rest.platforms), targetCountyIds: jsonArr(rest.targetCountyIds), ranges: platformConfigs, published, closingTime: new Date(rest.closingTime), paymentTime: new Date(rest.paymentTime) },
    })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not update challenge.' }
  }
}

export async function deleteChallenge(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const parsed = z.string().min(1).safeParse(id)
  if (!parsed.success) return { success: false, error: 'Invalid ID.' }
  try {
    await db.challenge.delete({ where: { id: parsed.data } })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not delete challenge.' }
  }
}

// Each entry: { platform, submitUrl }
export type PlatformSubmission = { platform: string; submitUrl: string }

export async function submitToChallenge(
  formData: FormData
): Promise<ActionResult & { ids?: string[] }> {
  const challengeId = z.string().min(1).safeParse(formData.get('challengeId'))
  if (!challengeId.success) return { success: false, error: 'Invalid challenge.' }

  const mpesaNo = String(formData.get('mpesaNo') ?? '')
  const consent = formData.get('consent') === '1'

  if (!MPESA_RE.test(mpesaNo)) return { success: false, error: 'Invalid M-Pesa number format (07xxxxxxxx or 01xxxxxxxx).' }
  if (!consent) return { success: false, error: 'You must accept the terms to submit.' }

  // Collect per-platform URLs from formData (keys: url_<platform>)
  const entries: PlatformSubmission[] = []
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('url_')) {
      const platform = key.slice(4)
      const url = String(value).trim()
      if (url) entries.push({ platform, submitUrl: url })
    }
  }
  if (entries.length === 0) return { success: false, error: 'Provide at least one platform URL.' }

  for (const { platform, submitUrl } of entries) {
    if (!validatePlatformUrl(submitUrl, platform)) {
      const label = CHALLENGE_PLATFORM_LABELS[platform] ?? platform.toUpperCase()
      return { success: false, error: `${label}: URL does not look like a valid link.` }
    }
  }

  try {
    const ids: string[] = []
    for (const { platform, submitUrl } of entries) {
      // upsert so re-submitting same platform replaces (won't error on unique constraint)
      const row = await db.challengeSubmission.upsert({
        where: { challengeId_mpesaNo_platform: { challengeId: challengeId.data, mpesaNo, platform } },
        create: { challengeId: challengeId.data, mpesaNo, submitUrl, platform, consentGiven: true },
        update: { submitUrl, status: 'PENDING', rejectReason: null },
      })
      ids.push(row.id)
    }
    revalidatePath('/dashboard')
    return { success: true, ids }
  } catch {
    return { success: false, error: 'Could not submit. Please try again.' }
  }
}

export async function linkPaymentToChallenge(
  checkoutId: string, challengeId: string, phone: string, amount: number
): Promise<void> {
  try {
    // Called only after payment is confirmed — always write 'success'
    await db.mpesaPayment.upsert({
      where: { checkoutId },
      create: { checkoutId, challengeId, phone, amount, status: 'success' },
      // If callback already wrote the record, just stamp the challengeId + ensure success
      update: { challengeId, status: 'success' },
    })
    revalidatePath('/dashboard')
  } catch { /* best-effort */ }
}

export async function getOrganizerMonitor(
  challengeId: string,
  mpesaNo: string
): Promise<{ authorized: false } | { authorized: true; submissions: SubmissionInfo[] }> {
  if (!MPESA_RE.test(mpesaNo)) return { authorized: false }
  const challenge = await db.challenge.findFirst({
    where: { id: challengeId, mpesaNo },
    select: { id: true },
  })
  if (!challenge) return { authorized: false }
  const rows = await db.challengeSubmission.findMany({
    where: { challengeId },
    orderBy: { createdAt: 'asc' },
  })
  return {
    authorized: true,
    submissions: rows.map((r) => ({
      id: r.id,
      challengeId: r.challengeId,
      mpesaNo: r.mpesaNo,
      submitUrl: r.submitUrl,
      platform: r.platform,
      status: r.status as SubmissionInfo['status'],
      rejectReason: r.rejectReason,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}

export async function lookupSubmission(
  challengeId: string, mpesaNo: string
): Promise<{ found: false } | { found: true; submissions: SubmissionInfo[] }> {
  if (!MPESA_RE.test(mpesaNo)) return { found: false }
  const rows = await db.challengeSubmission.findMany({
    where: { challengeId, mpesaNo },
    orderBy: { createdAt: 'asc' },
  })
  if (rows.length === 0) return { found: false }
  return {
    found: true,
    submissions: rows.map((r) => ({
      id: r.id,
      challengeId: r.challengeId,
      mpesaNo: r.mpesaNo,
      submitUrl: r.submitUrl,
      platform: r.platform,
      status: r.status as SubmissionInfo['status'],
      rejectReason: r.rejectReason,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}

export async function getSubmissions(challengeId: string): Promise<SubmissionInfo[]> {
  const denied = await requireAuth()
  if (denied) return []
  const rows = await db.challengeSubmission.findMany({
    where: { challengeId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((r) => ({
    id: r.id,
    challengeId: r.challengeId,
    mpesaNo: r.mpesaNo,
    submitUrl: r.submitUrl,
    platform: r.platform,
    status: r.status as SubmissionInfo['status'],
    rejectReason: r.rejectReason,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function approveSubmission(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.challengeSubmission.update({ where: { id }, data: { status: 'APPROVED', rejectReason: null } })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not approve submission.' }
  }
}

export async function rejectSubmission(id: string, reason: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  if (!reason.trim()) return { success: false, error: 'Provide a rejection reason.' }
  try {
    await db.challengeSubmission.update({ where: { id }, data: { status: 'REJECTED', rejectReason: reason.trim() } })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not reject submission.' }
  }
}

export async function seedKenyaCounties(): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const names = [
    'Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita-Taveta',
    'Garissa', 'Wajir', 'Mandera', 'Marsabit', 'Isiolo', 'Meru',
    'Tharaka-Nithi', 'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua',
    'Nyeri', 'Kirinyaga', "Murang'a", 'Kiambu', 'Turkana', 'West Pokot',
    'Samburu', 'Trans Nzoia', 'Uasin Gishu', 'Elgeyo-Marakwet', 'Nandi',
    'Baringo', 'Laikipia', 'Nakuru', 'Narok', 'Kajiado', 'Kericho', 'Bomet',
    'Kakamega', 'Vihiga', 'Bungoma', 'Busia', 'Siaya', 'Kisumu', 'Homa Bay',
    'Migori', 'Kisii', 'Nyamira', 'Nairobi',
  ]
  try {
    const kenya = await db.country.upsert({
      where: { name: 'Kenya' }, update: {}, create: { name: 'Kenya' },
    })
    await Promise.all(
      names.map((name) =>
        db.county.upsert({
          where: { name },
          update: { countryId: kenya.id },
          create: { name, countryId: kenya.id },
        })
      )
    )
    // Also link any remaining unlabelled counties to Kenya
    await db.county.updateMany({ where: { countryId: null }, data: { countryId: kenya.id } })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (e) {
    console.error(e)
    return { success: false, error: 'Failed to seed Kenya counties.' }
  }
}

/* ── Need Requests (agent) ───────────────────────────────────────── */

export type NeedUpdateInfo = {
  id: string
  message: string
  createdAt: string
}

export type NeedRequestInfo = {
  id: string
  name: string
  description: string
  commMethod: string
  phone: string
  status: string
  agentComments: string | null
  requestedAmount: number | null
  trackingNumber: string | null
  clientFeedback: string | null
  updates: NeedUpdateInfo[]
  createdAt: string
}

export async function getNeedRequests(): Promise<NeedRequestInfo[]> {
  const denied = await requireAuth()
  if (denied) return []
  const rows = await db.needRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: { updates: { orderBy: { createdAt: 'asc' } } },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    commMethod: r.commMethod,
    phone: r.phone,
    status: r.status,
    agentComments: r.agentComments,
    requestedAmount: r.requestedAmount,
    trackingNumber: r.trackingNumber,
    clientFeedback: r.clientFeedback,
    updates: r.updates.map((u) => ({ id: u.id, message: u.message, createdAt: u.createdAt.toISOString() })),
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function reviewNeedRequest(
  id: string,
  agentComments: string,
  requestedAmount: number,
): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  if (!agentComments.trim()) return { success: false, error: 'Comments are required.' }
  if (!requestedAmount || requestedAmount <= 0) return { success: false, error: 'Amount must be greater than 0.' }
  try {
    await db.needRequest.update({
      where: { id },
      data: { agentComments: agentComments.trim(), requestedAmount, status: 'REVIEWED' },
    })
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not update request.' }
  }
}

export async function addNeedRequestUpdate(id: string, message: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  if (!message.trim()) return { success: false, error: 'Message cannot be empty.' }
  try {
    await db.needRequestUpdate.create({ data: { needRequestId: id, message: message.trim() } })
    // Move to IN_PROGRESS on first update after payment
    const req = await db.needRequest.findUnique({ where: { id } })
    if (req && req.status === 'PAID') {
      await db.needRequest.update({ where: { id }, data: { status: 'IN_PROGRESS' } })
    }
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not add update.' }
  }
}

export async function markNeedRequestAwaiting(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.needRequest.update({ where: { id }, data: { status: 'AWAITING_FEEDBACK' } })
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not update status.' }
  }
}

/* ── Fares / Routes ──────────────────────────────────────────────── */

export type FareInfo = {
  id: string
  routeId: string
  amount: number
  prevAmount: number | null
  transportType: string
}

export type RouteInfo = {
  id: string
  from: string
  to: string
  countyId: string | null
  countyName: string | null
  countryId: string | null
  countryName: string | null
  marketId: string | null
  marketName: string | null
  fares: FareInfo[]
}

export async function getRoutes(): Promise<RouteInfo[]> {
  try {
    const rows = await db.route.findMany({
      include: {
        fares: true,
        county: { include: { country: true } },
        market: { include: { county: { include: { country: true } } } },
      },
      orderBy: { from: 'asc' },
    })
    return rows.map((r) => ({
      id: r.id, from: r.from, to: r.to,
      countyId: r.countyId ?? r.market?.countyId ?? null,
      countyName: r.county?.name ?? r.market?.county?.name ?? null,
      countryId: r.county?.countryId ?? r.market?.county?.countryId ?? null,
      countryName: r.county?.country?.name ?? r.market?.county?.country?.name ?? null,
      marketId: r.marketId, marketName: r.market?.name ?? null,
      fares: r.fares.map((f) => ({ id: f.id, routeId: f.routeId, amount: f.amount, prevAmount: f.prevAmount, transportType: f.transportType })),
    }))
  } catch { return [] }
}

export async function createRoute(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const from = String(formData.get('from') ?? '').trim()
  const to = String(formData.get('to') ?? '').trim()
  const marketId = String(formData.get('marketId') ?? '').trim() || null
  const countyId = String(formData.get('countyId') ?? '').trim() || null
  if (!from || !to) return { success: false, error: 'From and To are required.' }
  let effectiveCountyId = countyId
  if (!effectiveCountyId && marketId) {
    const mkt = await db.market.findUnique({ where: { id: marketId }, select: { countyId: true } })
    effectiveCountyId = mkt?.countyId ?? null
  }
  const scopeDenied = await requireAgentScope(effectiveCountyId)
  if (scopeDenied) return scopeDenied
  try {
    await db.route.create({ data: { from, to, marketId, countyId } })
    revalidatePath('/market'); revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Route already exists or could not be created.' } }
}

export async function deleteRoute(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.route.delete({ where: { id } })
    revalidatePath('/market'); revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not delete route.' } }
}

export async function upsertFare(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const routeId = String(formData.get('routeId') ?? '').trim()
  const transportType = String(formData.get('transportType') ?? 'psv').trim()
  const amount = parseInt(String(formData.get('amount') ?? '0'))
  if (!routeId) return { success: false, error: 'Route is required.' }
  if (!amount || amount < 1) return { success: false, error: 'Fare amount must be a positive number.' }
  const route = await db.route.findUnique({
    where: { id: routeId },
    select: { countyId: true, market: { select: { countyId: true } } },
  })
  const routeCountyId = route?.countyId ?? route?.market?.countyId ?? null
  const scopeDenied = await requireAgentScope(routeCountyId)
  if (scopeDenied) return scopeDenied
  try {
    const existing = await db.fare.findUnique({ where: { routeId_transportType: { routeId, transportType } } })
    await db.fare.upsert({
      where: { routeId_transportType: { routeId, transportType } },
      create: { routeId, transportType, amount },
      update: { prevAmount: existing?.amount ?? null, amount },
    })
    revalidatePath('/market'); revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not save fare.' } }
}

export async function deleteFare(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const fare = await db.fare.findUnique({
    where: { id },
    select: { route: { select: { countyId: true, market: { select: { countyId: true } } } } },
  })
  const routeCountyId = fare?.route?.countyId ?? fare?.route?.market?.countyId ?? null
  const scopeDenied = await requireAgentScope(routeCountyId)
  if (scopeDenied) return scopeDenied
  try {
    await db.fare.delete({ where: { id } })
    revalidatePath('/market'); revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not delete fare.' } }
}

export async function reclaimAdminAccess(): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { success: false, error: 'Not signed in.' }
  try {
    const record = await db.allowedEmail.findUnique({ where: { email } })
    if (!record) return { success: false, error: 'Your email is not in the allowed list.' }
    if (record.countyId === null) return { success: false, error: 'Already a global admin.' }
    await db.allowedEmail.update({ where: { email }, data: { countyId: null } })
    revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not update admin status.' } }
}

/* ── News ────────────────────────────────────────────────────────── */

export type NewsInfo = {
  id: string; title: string; description: string
  fileUrl: string | null; eventTime: string; createdAt: string
  target: string; targetCountyIds: string[]; marketId: string | null
}

export async function getNews(): Promise<NewsInfo[]> {
  try {
    const rows = await db.news.findMany({ orderBy: { publishedAt: 'desc' } })
    return rows.map((r) => ({
      id: r.id, title: r.title, description: r.description, fileUrl: r.fileUrl,
      eventTime: r.publishedAt.toISOString(), createdAt: r.createdAt.toISOString(),
      target: r.target, targetCountyIds: parseArr(r.targetCountyIds), marketId: r.marketId,
    }))
  } catch { return [] }
}

async function uploadNewsFile(formData: FormData): Promise<string | null> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return null
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop()?.toLowerCase()
    const imageExts = ['jpg','jpeg','png','gif','webp','svg']
    const resourceType = imageExts.includes(ext ?? '') ? 'image' : 'raw'
    const result = await uploadFile(buf, { folder: 'ads/news', resourceType, filename: file.name })
    return result.url
  } catch { return null }
}

export async function createNews(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const eventTime = String(formData.get('eventTime') ?? '').trim()
  if (!title) return { success: false, error: 'Title is required.' }
  if (!description) return { success: false, error: 'Description is required.' }
  const target = String(formData.get('target') ?? 'NATIONAL').trim()
  const targetCountyIds = String(formData.get('targetCountyIds') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const marketId = String(formData.get('marketId') ?? '').trim() || null
  const fileUrl = await uploadNewsFile(formData)
  try {
    await db.news.create({ data: { title, description, category: 'general', fileUrl, publishedAt: eventTime ? new Date(eventTime) : new Date(), target, targetCountyIds: jsonArr(targetCountyIds), marketId } })
    revalidatePath('/market'); revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not create news item.' } }
}

export async function updateNews(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const id = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const eventTime = String(formData.get('eventTime') ?? '').trim()
  if (!id) return { success: false, error: 'Missing news ID.' }
  if (!title) return { success: false, error: 'Title is required.' }
  const target = String(formData.get('target') ?? 'NATIONAL').trim()
  const targetCountyIds = String(formData.get('targetCountyIds') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const marketId = String(formData.get('marketId') ?? '').trim() || null
  const newFileUrl = await uploadNewsFile(formData)
  const existingFileUrl = String(formData.get('existingFileUrl') ?? '').trim() || null
  const fileUrl = newFileUrl ?? existingFileUrl
  try {
    await db.news.update({ where: { id }, data: { title, description, fileUrl, publishedAt: eventTime ? new Date(eventTime) : undefined, target, targetCountyIds: jsonArr(targetCountyIds), marketId } })
    revalidatePath('/market'); revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not update news item.' } }
}

export async function updateAgentRoles(id: string, roles: string[], countyIds: string[]): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.allowedEmail.update({ where: { id }, data: { roles: jsonArr(roles), countyIds: jsonArr(countyIds) } })
    revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not update roles.' } }
}

export async function deleteNews(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.news.delete({ where: { id } })
    revalidatePath('/market'); revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not delete news item.' } }
}

/* ── Drop Ship Sales ─────────────────────────────────────────────── */

export type DropShipSaleInfo = {
  id: string
  dropShipItemId: string
  mpesaNumber: string
  commMethod: string
  fileUrl: string | null
  status: string
  agentNotes: string | null
  adminNotes: string | null
  createdAt: string
}

export async function getDropShipSales(dropShipItemId?: string): Promise<DropShipSaleInfo[]> {
  const denied = await requireAuth()
  if (denied) return []
  try {
    const where = dropShipItemId ? { dropShipItemId } : {}
    const rows = await db.dropShipSale.findMany({ where, orderBy: { createdAt: 'desc' } })
    return rows.map((r) => ({
      id: r.id, dropShipItemId: r.dropShipItemId, mpesaNumber: r.mpesaNumber,
      commMethod: r.commMethod, fileUrl: r.fileUrl, status: r.status,
      agentNotes: r.agentNotes, adminNotes: r.adminNotes, createdAt: r.createdAt.toISOString(),
    }))
  } catch { return [] }
}

export async function submitDropShipSale(formData: FormData): Promise<ActionResult> {
  const dropShipItemId = String(formData.get('dropShipItemId') ?? '').trim()
  const mpesaNumber = String(formData.get('mpesaNumber') ?? '').trim()
  const commMethod = String(formData.get('commMethod') ?? '').trim()
  const agentNotes = String(formData.get('agentNotes') ?? '').trim() || null
  if (!dropShipItemId) return { success: false, error: 'Product ID is required.' }
  if (!mpesaNumber || !/^(07|01)\d{8}$/.test(mpesaNumber)) return { success: false, error: 'Valid M-Pesa number required (07xxxxxxxx).' }
  if (!commMethod) return { success: false, error: 'Communication method is required.' }
  let fileUrl: string | null = null
  const file = formData.get('file') as File | null
  if (file && file.size > 0) {
    try {
      const buf = Buffer.from(await file.arrayBuffer())
      const result = await uploadFile(buf, { folder: 'ads/sales', filename: file.name })
      fileUrl = result.url
    } catch { /* proceed without file */ }
  }
  try {
    await db.dropShipSale.create({ data: { dropShipItemId, mpesaNumber, commMethod, agentNotes, fileUrl, status: 'PENDING' } })
    revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not submit sale report.' } }
}

export async function lookupDropShipSale(mpesaNumber: string): Promise<{ found: false } | { found: true; sales: DropShipSaleInfo[] }> {
  if (!/^(07|01)\d{8}$/.test(mpesaNumber)) return { found: false }
  try {
    const rows = await db.dropShipSale.findMany({ where: { mpesaNumber }, orderBy: { createdAt: 'desc' } })
    if (rows.length === 0) return { found: false }
    return {
      found: true,
      sales: rows.map((r) => ({
        id: r.id, dropShipItemId: r.dropShipItemId, mpesaNumber: r.mpesaNumber,
        commMethod: r.commMethod, fileUrl: r.fileUrl, status: r.status,
        agentNotes: r.agentNotes, adminNotes: r.adminNotes, createdAt: r.createdAt.toISOString(),
      })),
    }
  } catch { return { found: false } }
}

export async function updateDropShipSaleAdmin(id: string, status: string, adminNotes: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.dropShipSale.update({ where: { id }, data: { status, adminNotes: adminNotes.trim() || null } })
    revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not update sale.' } }
}

/* ── Agent Verification ──────────────────────────────────────────── */

export type AgentVerificationInfo = {
  id: string
  email: string
  fullName: string | null
  tel: string | null
  kraPin: string | null
  idNumber: string | null
  idFrontUrl: string | null
  idBackUrl: string | null
  selfieUrl: string | null
  verificationStatus: string
}

export async function getAgentVerifications(): Promise<AgentVerificationInfo[]> {
  const denied = await requireAuth()
  if (denied) return []
  try {
    const rows = await db.userProfile.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map((r) => ({
      id: r.id, email: r.email, fullName: r.fullName, tel: r.tel,
      kraPin: r.kraPin, idNumber: r.idNumber,
      idFrontUrl: r.idFrontUrl, idBackUrl: r.idBackUrl, selfieUrl: r.selfieUrl,
      verificationStatus: r.verificationStatus,
    }))
  } catch { return [] }
}

export async function submitAgentVerification(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { success: false, error: 'Not signed in.' }
  const kraPin = String(formData.get('kraPin') ?? '').trim()
  const idNumber = String(formData.get('idNumber') ?? '').trim()
  const idFrontUrl = String(formData.get('idFrontUrl') ?? '').trim() || null
  const idBackUrl = String(formData.get('idBackUrl') ?? '').trim() || null
  const selfieUrl = String(formData.get('selfieUrl') ?? '').trim() || null
  if (!kraPin) return { success: false, error: 'KRA PIN is required.' }
  if (!idNumber) return { success: false, error: 'ID number is required.' }
  if (!idFrontUrl || !idBackUrl || !selfieUrl) return { success: false, error: 'All three photos (ID front, ID back, selfie) are required.' }
  try {
    await db.userProfile.upsert({
      where: { email },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: { kraPin, idNumber, idFrontUrl, idBackUrl, selfieUrl, verificationStatus: 'PENDING' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: { email, kraPin, idNumber, idFrontUrl, idBackUrl, selfieUrl, verificationStatus: 'PENDING' } as any,
    })
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not submit verification.' }
  }
}

export async function updateVerificationStatus(email: string, status: 'VERIFIED' | 'REJECTED'): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.userProfile.update({
      where: { email },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { verificationStatus: status } as any,
    })
    revalidatePath('/dashboard')
    return { success: true }
  } catch {
    return { success: false, error: 'Could not update verification status.' }
  }
}
