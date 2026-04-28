import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'

function mpesaCharge(amount: number): number {
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
  return 108
}

function organizerCost(w: number): number {
  const f = Math.ceil(w * 1.15)
  return f + mpesaCharge(f)
}

type RangeEntry = { count: number; amount: number }
type PlatformConfig = { platform: string; targetCount: number; ranges: RangeEntry[] }

const PLATFORM_LABELS: Record<string, string> = {
  x: 'X (Twitter)', tiktok: 'TikTok', ig: 'Instagram', instagram: 'Instagram',
  fb: 'Facebook', facebook: 'Facebook',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const challenge = await db.challenge.findUnique({
    where: { id },
    include: {
      submissions: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!challenge) return new Response('Not found', { status: 404 })

  const platformConfigs = challenge.ranges as PlatformConfig[]

  const wb = XLSX.utils.book_new()

  // Sheet 1: All participants
  const allRows = challenge.submissions.map((s, idx) => ({
    '#': idx + 1,
    Platform: PLATFORM_LABELS[s.platform.toLowerCase()] ?? s.platform.toUpperCase(),
    'M-Pesa Account': s.mpesaNo,
    'Submission URL': s.submitUrl,
    Status: s.status,
    'Reject Reason': s.rejectReason ?? '',
    'Submitted At': new Date(s.createdAt).toLocaleString('en-KE'),
  }))
  const wsAll = XLSX.utils.json_to_sheet(allRows)
  wsAll['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 16 }, { wch: 50 }, { wch: 10 }, { wch: 25 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsAll, 'All Participants')

  // Sheet 2: Winners by platform (approved, ranked, with prize)
  const approvedRows: Record<string, unknown>[] = []
  for (const config of platformConfigs) {
    const label = PLATFORM_LABELS[config.platform.toLowerCase()] ?? config.platform.toUpperCase()
    const group = challenge.submissions
      .filter(s => s.platform.toLowerCase() === config.platform.toLowerCase() && s.status === 'APPROVED')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    group.forEach((s, idx) => {
      const rank = idx + 1
      let prize = 0
      let slot = 0
      for (const r of config.ranges) {
        if (rank <= slot + r.count) { prize = r.amount; break }
        slot += r.count
      }
      approvedRows.push({
        Platform: label,
        Position: rank,
        'M-Pesa Account': s.mpesaNo,
        'Prize Amount (KSh)': prize || '',
        'Cost to Organizer (KSh)': prize ? organizerCost(prize) : '',
        'Submission URL': s.submitUrl,
        'Submitted At': new Date(s.createdAt).toLocaleString('en-KE'),
      })
    })
  }
  const wsWinners = XLSX.utils.json_to_sheet(approvedRows)
  wsWinners['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 50 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsWinners, 'Winners & Prizes')

  // Sheet 3: Payment schedule
  const payRows: Record<string, unknown>[] = []
  for (const config of platformConfigs) {
    const label = PLATFORM_LABELS[config.platform.toLowerCase()] ?? config.platform.toUpperCase()
    let slot = 0
    for (const r of config.ranges) {
      const from = slot + 1
      slot += r.count
      const to = slot
      const posRange = r.count === 1 ? `#${from}` : `#${from}–#${to}`
      const withFee = Math.ceil(r.amount * 1.15)
      payRows.push({
        Platform: label,
        'Position Range': posRange,
        'Winners': r.count,
        'Prize Each (KSh)': r.amount,
        'Platform Fee 15% (KSh)': withFee - r.amount,
        'M-Pesa Charge (KSh)': mpesaCharge(withFee),
        'Cost Each (KSh)': organizerCost(r.amount),
        'Subtotal (KSh)': organizerCost(r.amount) * r.count,
      })
    }
  }
  const wsPay = XLSX.utils.json_to_sheet(payRows)
  wsPay['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsPay, 'Payment Schedule')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="challenge-participants-${id}.xlsx"`,
    },
  })
}
