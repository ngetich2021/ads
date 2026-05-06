'use server'

import { db } from '@/lib/db'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { uploadFile } from '@/lib/cloudinary'
import { sendAdApprovalEmail, sendAdRejectionEmail } from '@/lib/mail'

export type ActionResult = { success: true } | { success: false; error: string }

export type AdPackageInfo = {
  id: string
  name: string
  price: number
  durationDays: number
  playsPerHour: number
  positions: string[]
  description: string
  active: boolean
}

export type AdPaymentInfo = {
  id: string
  checkoutId: string
  status: string
  mpesaRef: string | null
  amount: number | null
  phone: string | null
  createdAt: string
}

export type AdInfo = {
  id: string
  packageId: string
  packageName: string
  packagePricePerDay: number
  submitterName: string
  submitterEmail: string
  submitterPhone: string
  title: string
  description: string
  linkUrl: string | null
  videoUrl: string | null
  hasVideoData: boolean
  videoMime: string
  durationDays: number
  target: string
  targetCountyIds: string[]
  targetMarketIds: string[]
  status: string
  adminNotes: string | null
  invoiceAmount: number | null
  startsAt: string | null
  endsAt: string | null
  positions: string[]
  createdAt: string
  payments: AdPaymentInfo[]
}

export type ActiveAdInfo = {
  id: string
  title: string
  linkUrl: string | null
  videoSrc: string
  videoMime: string
  position: string
}

function parseArr(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[]
  try { return JSON.parse(String(v)) } catch { return [] }
}

async function requireAuth(): Promise<ActionResult | null> {
  const session = await auth()
  if (!session?.user) return { success: false, error: 'Authentication required.' }
  return null
}

/* ── Public Queries ──────────────────────────────────────────────── */

export async function getAdPackages(): Promise<AdPackageInfo[]> {
  try {
    const rows = await db.adPackage.findMany({
      where: { active: true },
      orderBy: { price: 'asc' },
    })
    return rows.map(r => ({
      id: r.id, name: r.name, price: r.price,
      durationDays: r.durationDays, playsPerHour: r.playsPerHour,
      positions: parseArr(r.positions), description: r.description, active: r.active,
    }))
  } catch { return [] }
}

export async function getActiveAds(position?: string, countyId?: string, marketId?: string): Promise<ActiveAdInfo[]> {
  try {
    const now = new Date()
    const rows = await db.ad.findMany({
      where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gte: now } },
      include: { package: { select: { positions: true } } },
      orderBy: { startsAt: 'asc' },
    })
    let all = rows
      .filter(r => {
        if (r.target === 'NATIONAL') return true
        if (r.target === 'COUNTY') {
          if (!countyId) return false
          return parseArr(r.targetCountyIds).includes(countyId)
        }
        if (r.target === 'MARKET') {
          if (!marketId) return false
          return parseArr(r.targetMarketIds).includes(marketId)
        }
        return true
      })
      .flatMap(r =>
        parseArr(r.package.positions).map(pos => ({
          id: r.id, title: r.title, linkUrl: r.linkUrl,
          videoSrc: r.videoUrl ?? `/api/ads/${r.id}/video`,
          videoMime: r.videoMime, position: pos,
        }))
      )
    if (position) all = all.filter(a => a.position === position)
    return all
  } catch { return [] }
}

export async function getAdById(id: string): Promise<AdInfo | null> {
  try {
    const row = await db.ad.findUnique({
      where: { id },
      include: {
        package: { select: { id: true, name: true, positions: true, durationDays: true, price: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!row) return null
    return {
      id: row.id, packageId: row.packageId, packageName: row.package.name,
      packagePricePerDay: row.package.price,
      submitterName: row.submitterName, submitterEmail: row.submitterEmail,
      submitterPhone: row.submitterPhone, title: row.title, description: row.description,
      linkUrl: row.linkUrl,
      videoUrl: row.videoUrl, hasVideoData: !!row.videoData, videoMime: row.videoMime,
      durationDays: row.durationDays,
      target: row.target, targetCountyIds: parseArr(row.targetCountyIds),
      targetMarketIds: parseArr(row.targetMarketIds),
      status: row.status, adminNotes: row.adminNotes, invoiceAmount: row.invoiceAmount,
      startsAt: row.startsAt?.toISOString() ?? null, endsAt: row.endsAt?.toISOString() ?? null,
      positions: parseArr(row.package.positions), createdAt: row.createdAt.toISOString(),
      payments: row.payments.map(p => ({
        id: p.id, checkoutId: p.checkoutId, status: p.status,
        mpesaRef: p.mpesaRef, amount: p.amount, phone: p.phone,
        createdAt: p.createdAt.toISOString(),
      })),
    }
  } catch { return null }
}

/* ── Admin Queries ───────────────────────────────────────────────── */

export async function getAdsAdmin(): Promise<AdInfo[]> {
  const denied = await requireAuth()
  if (denied) return []
  try {
    const rows = await db.ad.findMany({
      include: {
        package: { select: { id: true, name: true, positions: true, price: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(r => ({
      id: r.id, packageId: r.packageId, packageName: r.package.name,
      packagePricePerDay: r.package.price,
      submitterName: r.submitterName, submitterEmail: r.submitterEmail,
      submitterPhone: r.submitterPhone, title: r.title, description: r.description,
      linkUrl: r.linkUrl,
      videoUrl: r.videoUrl, hasVideoData: !!r.videoData, videoMime: r.videoMime,
      durationDays: r.durationDays,
      target: r.target, targetCountyIds: parseArr(r.targetCountyIds),
      targetMarketIds: parseArr(r.targetMarketIds),
      status: r.status, adminNotes: r.adminNotes, invoiceAmount: r.invoiceAmount,
      startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null,
      positions: parseArr(r.package.positions), createdAt: r.createdAt.toISOString(),
      payments: r.payments.map(p => ({
        id: p.id, checkoutId: p.checkoutId, status: p.status,
        mpesaRef: p.mpesaRef, amount: p.amount, phone: p.phone,
        createdAt: p.createdAt.toISOString(),
      })),
    }))
  } catch { return [] }
}

export async function getAdPackagesAdmin(): Promise<AdPackageInfo[]> {
  const denied = await requireAuth()
  if (denied) return []
  try {
    const rows = await db.adPackage.findMany({ orderBy: { price: 'asc' } })
    return rows.map(r => ({
      id: r.id, name: r.name, price: r.price, durationDays: r.durationDays,
      playsPerHour: r.playsPerHour, positions: parseArr(r.positions),
      description: r.description, active: r.active,
    }))
  } catch { return [] }
}

/* ── Public Mutations ────────────────────────────────────────────── */

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/avi']

export async function submitAd(formData: FormData): Promise<ActionResult & { adId?: string }> {
  const name = String(formData.get('submitterName') ?? '').trim()
  const email = String(formData.get('submitterEmail') ?? '').trim()
  const phone = String(formData.get('submitterPhone') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const packageId = String(formData.get('packageId') ?? '').trim()
  const linkUrl = String(formData.get('linkUrl') ?? '').trim() || null
  const target = String(formData.get('target') ?? 'NATIONAL')
  const targetCountyIds = formData.getAll('targetCountyIds').map(String).filter(Boolean)
  const targetMarketIds = formData.getAll('targetMarketIds').map(String).filter(Boolean)
  const chosenDays = parseInt(String(formData.get('durationDays') ?? '0'))

  if (!name) return { success: false, error: 'Your name is required.' }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'A valid email is required.' }
  if (!phone || !/^(07|01|\+254)\d{7,9}$/.test(phone.replace(/\s/g, ''))) return { success: false, error: 'A valid phone number is required (e.g. 0712345678).' }
  if (!title) return { success: false, error: 'Ad title is required.' }
  if (!packageId) return { success: false, error: 'Please select a package.' }
  if (target === 'COUNTY' && targetCountyIds.length === 0) return { success: false, error: 'Select at least one county for regional targeting.' }
  if (target === 'MARKET' && targetMarketIds.length === 0) return { success: false, error: 'Select at least one market for market targeting.' }

  const checkoutId = String(formData.get('checkoutId') ?? '').trim()
  if (!checkoutId) return { success: false, error: 'Payment reference missing. Please complete payment first.' }

  const pkg = await db.adPackage.findUnique({ where: { id: packageId, active: true } })
  if (!pkg) return { success: false, error: 'Selected package not found.' }

  const durationDays = Math.max(pkg.durationDays, Math.min(90, chosenDays || pkg.durationDays))
  const invoiceAmount = pkg.price * durationDays

  const file = formData.get('video')
  if (!(file instanceof File) || file.size === 0) return { success: false, error: 'A video file is required.' }
  if (!VIDEO_TYPES.includes(file.type)) return { success: false, error: 'Only video files are allowed (MP4, WebM, MOV, etc.).' }
  if (file.size > 100 * 1024 * 1024) return { success: false, error: 'Video must be under 100 MB.' }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    let videoUrl: string | null = null
    try {
      const uploaded = await uploadFile(buf, { folder: 'ads/videos', resourceType: 'auto', filename: file.name })
      videoUrl = uploaded.url
    } catch (e) {
      console.error('Cloudinary upload failed, falling back to DB:', e)
    }

    const ad = await db.ad.create({
      data: {
        packageId, submitterName: name, submitterEmail: email, submitterPhone: phone,
        title, description, linkUrl, durationDays, invoiceAmount,
        target, targetCountyIds: JSON.stringify(targetCountyIds),
        targetMarketIds: JSON.stringify(targetMarketIds),
        videoData: videoUrl ? null : buf, videoMime: file.type, videoUrl, status: 'PENDING',
      },
    })

    // Record the payment against this ad
    await db.adPayment.upsert({
      where: { checkoutId },
      create: { adId: ad.id, checkoutId, status: 'success', phone, amount: invoiceAmount },
      update: { adId: ad.id, status: 'success' },
    })

    revalidatePath('/dashboard')
    return { success: true, adId: ad.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('submitAd error:', msg)
    return { success: false, error: `Submission failed: ${msg}` }
  }
}

/* ── Admin Mutations ─────────────────────────────────────────────── */

export async function reviewAd(
  id: string, adminNotes: string, approve: boolean
): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    if (approve) {
      const existing = await db.ad.findUnique({ where: { id } })
      if (!existing) return { success: false, error: 'Ad not found.' }
      const startsAt = new Date()
      const endsAt = new Date(startsAt)
      endsAt.setDate(endsAt.getDate() + existing.durationDays)
      const ad = await db.ad.update({
        where: { id },
        data: { status: 'ACTIVE', adminNotes: adminNotes.trim() || null, startsAt, endsAt },
      })
      sendAdApprovalEmail({
        to: ad.submitterEmail, name: ad.submitterName, title: ad.title,
        adId: ad.id, invoiceAmount: ad.invoiceAmount ?? 0, adminNotes: ad.adminNotes,
      }).catch(() => {})
    } else {
      const ad = await db.ad.update({
        where: { id },
        data: { status: 'REJECTED', adminNotes: adminNotes.trim() || null },
      })
      sendAdRejectionEmail({
        to: ad.submitterEmail, name: ad.submitterName, title: ad.title, reason: ad.adminNotes,
      }).catch(() => {})
    }
    revalidatePath('/dashboard')
    revalidatePath('/market')
    return { success: true }
  } catch { return { success: false, error: 'Could not update ad.' } }
}

export async function activateAdAfterPayment(
  adId: string, checkoutId: string, phone: string, amount: number, mpesaRef?: string
): Promise<void> {
  try {
    const ad = await db.ad.findUnique({
      where: { id: adId },
      include: { package: { select: { durationDays: true } } },
    })
    if (!ad || ad.status !== 'AWAITING_PAYMENT') return
    const startsAt = new Date()
    const endsAt = new Date(startsAt)
    endsAt.setDate(endsAt.getDate() + ad.package.durationDays)
    await db.ad.update({ where: { id: adId }, data: { status: 'ACTIVE', startsAt, endsAt } })
    await db.adPayment.upsert({
      where: { checkoutId },
      create: { adId, checkoutId, status: 'success', phone, amount, mpesaRef: mpesaRef ?? null },
      update: { status: 'success', mpesaRef: mpesaRef ?? null },
    })
    revalidatePath('/market')
    revalidatePath('/dashboard')
  } catch { /* best-effort */ }
}

export async function deactivateAd(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.ad.update({ where: { id }, data: { status: 'EXPIRED' } })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not deactivate ad.' } }
}

export async function deleteAd(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.ad.delete({ where: { id } })
    revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not delete ad.' } }
}

/* ── Package Management ──────────────────────────────────────────── */

export async function seedDefaultPackages(): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const defaults = [
    { name: 'Bronze', price: 200, durationDays: 3, playsPerHour: 2, positions: '["banner"]', description: 'Banner only — KSh 200/day, min 3 days.' },
    { name: 'Silver', price: 400, durationDays: 3, playsPerHour: 4, positions: '["banner","sidebar"]', description: 'Banner + sidebar — KSh 400/day, min 3 days.' },
    { name: 'Gold', price: 700, durationDays: 5, playsPerHour: 8, positions: '["banner","sidebar","sticky"]', description: 'All positions — KSh 700/day, min 5 days.' },
    { name: 'Premium', price: 1000, durationDays: 7, playsPerHour: 12, positions: '["banner","sidebar","sticky"]', description: 'All positions, max frequency — KSh 1,000/day, min 7 days.' },
  ]
  try {
    for (const pkg of defaults) {
      await db.adPackage.upsert({ where: { name: pkg.name }, update: {}, create: pkg })
    }
    revalidatePath('/dashboard')
    revalidatePath('/ads/submit')
    return { success: true }
  } catch { return { success: false, error: 'Could not seed packages.' } }
}

export async function createAdPackage(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const name = String(formData.get('name') ?? '').trim()
  const price = parseInt(String(formData.get('price') ?? '0'))
  const durationDays = parseInt(String(formData.get('durationDays') ?? '7'))
  const playsPerHour = parseInt(String(formData.get('playsPerHour') ?? '2'))
  const positions = formData.getAll('positions').map(String).filter(Boolean)
  const description = String(formData.get('description') ?? '').trim()
  if (!name) return { success: false, error: 'Package name is required.' }
  if (price < 1) return { success: false, error: 'Price must be greater than 0.' }
  if (positions.length === 0) return { success: false, error: 'Select at least one ad position.' }
  try {
    await db.adPackage.create({
      data: { name, price, durationDays, playsPerHour, positions: JSON.stringify(positions), description },
    })
    revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Package name already exists or could not be created.' } }
}

export async function updateAdPackage(formData: FormData): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  const id = String(formData.get('id') ?? '').trim()
  const price = parseInt(String(formData.get('price') ?? '0'))
  const durationDays = parseInt(String(formData.get('durationDays') ?? '7'))
  const playsPerHour = parseInt(String(formData.get('playsPerHour') ?? '2'))
  const positions = formData.getAll('positions').map(String).filter(Boolean)
  const description = String(formData.get('description') ?? '').trim()
  const active = formData.get('active') === '1'
  if (!id) return { success: false, error: 'Invalid package ID.' }
  if (positions.length === 0) return { success: false, error: 'Select at least one ad position.' }
  try {
    await db.adPackage.update({
      where: { id },
      data: { price, durationDays, playsPerHour, positions: JSON.stringify(positions), description, active },
    })
    revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Could not update package.' } }
}

export async function deleteAdPackage(id: string): Promise<ActionResult> {
  const denied = await requireAuth()
  if (denied) return denied
  try {
    await db.adPackage.delete({ where: { id } })
    revalidatePath('/dashboard')
    return { success: true }
  } catch { return { success: false, error: 'Cannot delete package (it may have ads attached).' } }
}

export async function extendAd(
  adId: string, additionalDays: number, checkoutId: string, phone: string, amount: number, mpesaRef?: string
): Promise<ActionResult> {
  if (additionalDays < 1 || additionalDays > 90) return { success: false, error: 'Invalid extension duration.' }
  try {
    const ad = await db.ad.findUnique({ where: { id: adId } })
    if (!ad) return { success: false, error: 'Ad not found.' }
    if (ad.status !== 'ACTIVE' && ad.status !== 'EXPIRED') return { success: false, error: 'Only active or expired ads can be extended.' }
    const base = ad.endsAt && ad.endsAt > new Date() ? ad.endsAt : new Date()
    const newEndsAt = new Date(base)
    newEndsAt.setDate(newEndsAt.getDate() + additionalDays)
    await db.ad.update({
      where: { id: adId },
      data: { endsAt: newEndsAt, status: 'ACTIVE', ...(!ad.startsAt ? { startsAt: new Date() } : {}) },
    })
    await db.adPayment.upsert({
      where: { checkoutId },
      create: { adId, checkoutId, status: 'success', phone, amount, mpesaRef: mpesaRef ?? null },
      update: { status: 'success', mpesaRef: mpesaRef ?? null },
    })
    revalidatePath('/market')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (e) {
    return { success: false, error: `Extension failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}
