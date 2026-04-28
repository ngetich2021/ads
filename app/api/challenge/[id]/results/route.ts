import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

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
  if (amount <= 50000) return 108
  if (amount <= 250000) return 108
  return 300
}

function organizerCost(winnerAmount: number): number {
  const withFee = Math.ceil(winnerAmount * 1.15)
  return withFee + mpesaCharge(withFee)
}

function fmtDT(d: Date) {
  return d.toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

type RangeEntry = { count: number; amount: number }
type PlatformConfig = { platform: string; targetCount: number; ranges: RangeEntry[] }

const PLATFORM_LABELS: Record<string, string> = {
  x: 'X (Twitter)', tiktok: 'TikTok', ig: 'Instagram', instagram: 'Instagram',
  fb: 'Facebook', facebook: 'Facebook', youtube: 'YouTube',
}
const platformLabel = (p: string) => PLATFORM_LABELS[p.toLowerCase()] ?? p.toUpperCase()

const medalEmoji = (rank: number) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const challenge = await db.challenge.findUnique({
    where: { id },
    include: {
      submissions: {
        where: { status: 'APPROVED' },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!challenge) return new Response('Not found', { status: 404 })

  const platformConfigs = challenge.ranges as PlatformConfig[]
  const approved = challenge.submissions

  type WinnerRow = typeof approved[number] & { rank: number; prize: number }
  const platformSections: Array<{
    config: PlatformConfig
    winners: WinnerRow[]
    totalPrizes: number
    platformFee: number
    mpesaFees: number
    subtotal: number
  }> = []

  let grandPrizes = 0
  let grandFees = 0
  let grandMpesa = 0
  let grandTotal = 0

  for (const config of platformConfigs) {
    const group = approved
      .filter(s => s.platform.toLowerCase() === config.platform.toLowerCase())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    const winners: WinnerRow[] = group.map((s, idx) => {
      const rank = idx + 1
      let prize = 0
      let slot = 0
      for (const r of config.ranges) {
        if (rank <= slot + r.count) { prize = r.amount; break }
        slot += r.count
      }
      return { ...s, rank, prize }
    })

    const totalPrizes = config.ranges.reduce((s, r) => s + r.amount * r.count, 0)
    const platformFee = config.ranges.reduce((s, r) => s + Math.ceil(r.amount * 0.15) * r.count, 0)
    const mpesaFees = config.ranges.reduce((s, r) => {
      const withFee = Math.ceil(r.amount * 1.15)
      return s + mpesaCharge(withFee) * r.count
    }, 0)
    const subtotal = config.ranges.reduce((s, r) => s + organizerCost(r.amount) * r.count, 0)

    grandPrizes += totalPrizes
    grandFees += platformFee
    grandMpesa += mpesaFees
    grandTotal += subtotal

    platformSections.push({ config, winners, totalPrizes, platformFee, mpesaFees, subtotal })
  }

  const renderWinnersTable = (winners: WinnerRow[]) => {
    if (winners.length === 0) return '<p class="empty">No approved submissions yet.</p>'
    return `
      <table>
        <thead>
          <tr>
            <th>Position</th>
            <th>M-Pesa Account</th>
            <th>Prize Amount</th>
            <th>Cost to Organizer</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          ${winners.map(w => `
            <tr class="${w.rank <= 3 ? 'top3' : ''}">
              <td class="pos">${medalEmoji(w.rank)}</td>
              <td class="mpesa">${w.mpesaNo}</td>
              <td class="prize">${w.prize ? `KSh ${w.prize.toLocaleString()}` : '—'}</td>
              <td class="cost">${w.prize ? `KSh ${organizerCost(w.prize).toLocaleString()}` : '—'}</td>
              <td class="time">${fmtDT(w.createdAt)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`
  }

  const renderDistribution = (s: typeof platformSections[0]) => `
    <div class="dist-grid">
      <div class="dist-item prizes">
        <div class="dist-label">🏆 Winner Prizes</div>
        <div class="dist-value">KSh ${s.totalPrizes.toLocaleString()}</div>
        <div class="dist-sub">Paid directly to winners</div>
      </div>
      <div class="dist-item fee">
        <div class="dist-label">📊 Platform Fee (15%)</div>
        <div class="dist-value">KSh ${s.platformFee.toLocaleString()}</div>
        <div class="dist-sub">Competition management</div>
      </div>
      <div class="dist-item mpesa">
        <div class="dist-label">📱 M-Pesa Charges</div>
        <div class="dist-value">KSh ${s.mpesaFees.toLocaleString()}</div>
        <div class="dist-sub">Transaction fees</div>
      </div>
      <div class="dist-item total">
        <div class="dist-label">💳 Your Total</div>
        <div class="dist-value">KSh ${s.subtotal.toLocaleString()}</div>
        <div class="dist-sub">Total charge</div>
      </div>
    </div>`

  const renderPlatformSections = () =>
    platformSections.map(({ config, winners, ...dist }) => `
      <div class="platform-section">
        <div class="platform-header">
          <span class="platform-badge">${platformLabel(config.platform)}</span>
          <span class="platform-meta">Target: ${config.targetCount.toLocaleString()} &nbsp;·&nbsp; Approved: <strong>${winners.length}</strong></span>
        </div>

        <p class="section-title">Prize Distribution</p>
        ${renderDistribution({ config, winners, ...dist })}

        <p class="section-title">Prize Ranges</p>
        <table class="ranges-table">
          <thead><tr><th>Position Range</th><th>Winners</th><th>Prize Each</th><th>Cost Each</th><th>Subtotal</th></tr></thead>
          <tbody>
            ${(() => {
              let slot = 0
              return config.ranges.map(r => {
                const from = slot + 1
                slot += r.count
                const to = slot
                const label = r.count === 1 ? `#${from}` : `#${from}–#${to}`
                return `<tr>
                  <td class="pos-range">${label}</td>
                  <td class="center">${r.count}</td>
                  <td class="prize">KSh ${r.amount.toLocaleString()}</td>
                  <td class="cost">KSh ${organizerCost(r.amount).toLocaleString()}</td>
                  <td class="bold">KSh ${(organizerCost(r.amount) * r.count).toLocaleString()}</td>
                </tr>`
              }).join('')
            })()}
          </tbody>
        </table>

        <p class="section-title">Winners List</p>
        ${renderWinnersTable(winners)}
      </div>`).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Challenge Results — ${challenge.description}</title>
  <style>
    @page { size: A4; margin: 20mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f2f8; color: #1a1a2e; }
    @media print { body { background: white; } .no-print { display: none; } }

    .page { max-width: 860px; margin: 24px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 32px rgba(0,0,0,0.10); }

    /* Header */
    .header { background: linear-gradient(135deg, #3730a3 0%, #7c3aed 100%); color: white; padding: 2rem 2.5rem; }
    .header-badge { display: inline-block; background: rgba(255,255,255,0.2); border-radius: 20px; padding: 0.3rem 0.875rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 0.875rem; }
    .header h1 { font-size: 1.6rem; font-weight: 900; line-height: 1.25; }
    .header-sub { margin-top: 0.4rem; font-size: 0.85rem; opacity: 0.8; }
    .header-meta { margin-top: 1.25rem; display: flex; flex-wrap: wrap; gap: 1.5rem; }
    .header-meta-item label { display: block; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em; opacity: 0.65; text-transform: uppercase; margin-bottom: 0.2rem; }
    .header-meta-item span { font-size: 0.875rem; font-weight: 700; }

    /* Summary strip */
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); background: #f8f7ff; border-bottom: 1px solid #e5e5ff; }
    .summary-item { padding: 1rem 1.25rem; border-right: 1px solid #e5e5ff; }
    .summary-item:last-child { border-right: none; }
    .summary-item label { display: block; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b6b8a; margin-bottom: 0.3rem; }
    .summary-item span { font-size: 1.15rem; font-weight: 900; color: #3730a3; }

    /* Body */
    .body { padding: 2rem 2.5rem; }

    /* Grand total */
    .grand-total { background: linear-gradient(135deg, #7c3aed, #4338ca); border-radius: 14px; padding: 1.25rem 1.75rem; color: white; display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; }
    .grand-total-breakdown { display: flex; gap: 2rem; }
    .grand-total-item label { display: block; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em; opacity: 0.75; margin-bottom: 0.2rem; }
    .grand-total-item span { font-size: 0.9rem; font-weight: 700; }
    .grand-total-amount { font-size: 2rem; font-weight: 900; }

    /* Platform section */
    .platform-section { border: 1px solid #e5e5ff; border-radius: 14px; padding: 1.5rem; margin-bottom: 2rem; page-break-inside: avoid; }
    .platform-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    .platform-badge { background: #eef2ff; color: #4338ca; font-weight: 800; font-size: 0.875rem; border-radius: 8px; padding: 0.4rem 1rem; }
    .platform-meta { font-size: 0.82rem; color: #6b6b8a; }

    .section-title { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #6b6b8a; margin-bottom: 0.75rem; margin-top: 1.25rem; }

    /* Distribution grid */
    .dist-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
    .dist-item { border-radius: 10px; padding: 0.875rem 1rem; }
    .dist-item.prizes { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .dist-item.fee { background: #eff6ff; border: 1px solid #bfdbfe; }
    .dist-item.mpesa { background: #fefce8; border: 1px solid #fde68a; }
    .dist-item.total { background: #f5f3ff; border: 1px solid #ddd6fe; }
    .dist-label { font-size: 0.68rem; font-weight: 700; color: #374151; margin-bottom: 0.3rem; }
    .dist-value { font-size: 1.05rem; font-weight: 900; color: #1a1a2e; }
    .dist-sub { font-size: 0.62rem; color: #9ca3af; margin-top: 0.2rem; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.82rem; }
    thead th { background: #f1f0ff; color: #4338ca; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.6rem 0.875rem; text-align: left; }
    tbody tr { border-bottom: 1px solid #f0f0f8; }
    tbody tr.top3 { background: #fffbeb; }
    tbody tr:hover { background: #fafafe; }
    td { padding: 0.7rem 0.875rem; vertical-align: middle; }

    .pos { font-size: 1.1rem; width: 60px; }
    .mpesa { font-family: monospace; font-weight: 700; color: #374151; font-size: 0.875rem; }
    .prize { font-weight: 800; color: #059669; }
    .cost { font-weight: 600; color: #7c3aed; }
    .bold { font-weight: 800; }
    .center { text-align: center; }
    .time { font-size: 0.75rem; color: #9ca3af; white-space: nowrap; }
    .pos-range { font-family: monospace; font-weight: 700; color: #4338ca; }
    .ranges-table thead th { background: #f8f8ff; }

    .empty { text-align: center; padding: 2rem; color: #9ca3af; font-style: italic; }

    /* Print button */
    .no-print { text-align: center; padding: 1.5rem; }
    .print-btn { background: linear-gradient(135deg, #7c3aed, #4338ca); color: white; border: none; border-radius: 10px; padding: 0.75rem 2rem; font-size: 0.9rem; font-weight: 700; cursor: pointer; }
    .print-btn:hover { opacity: 0.9; }

    /* Footer */
    .footer { border-top: 1px solid #f0f0f8; padding: 1rem 2.5rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: #9ca3af; }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-badge">🏆 Official Challenge Results</div>
    <h1>${challenge.description}</h1>
    <p class="header-sub">Organized by <strong>${challenge.orgName}</strong></p>
    <div class="header-meta">
      <div class="header-meta-item"><label>Closing Time</label><span>${fmtDT(challenge.closingTime)}</span></div>
      <div class="header-meta-item"><label>Payment Deadline</label><span>${fmtDT(challenge.paymentTime)}</span></div>
      <div class="header-meta-item"><label>M-Pesa Account</label><span>${challenge.mpesaNo}</span></div>
      <div class="header-meta-item"><label>Generated</label><span>${fmtDT(new Date())}</span></div>
    </div>
  </div>

  <div class="summary">
    <div class="summary-item"><label>Total Participants</label><span>${challenge.targetCount.toLocaleString()}</span></div>
    <div class="summary-item"><label>Approved</label><span>${approved.length}</span></div>
    <div class="summary-item"><label>Platforms</label><span>${platformSections.length}</span></div>
    <div class="summary-item"><label>Grand Total</label><span>KSh ${grandTotal.toLocaleString()}</span></div>
  </div>

  <div class="body">
    <div class="grand-total">
      <div>
        <div style="font-size:0.72rem;font-weight:700;opacity:0.75;letter-spacing:0.06em;margin-bottom:0.4rem;">GRAND TOTAL BREAKDOWN</div>
        <div class="grand-total-breakdown">
          <div class="grand-total-item"><label>Winner Prizes</label><span>KSh ${grandPrizes.toLocaleString()}</span></div>
          <div class="grand-total-item"><label>Platform Fee (15%)</label><span>KSh ${grandFees.toLocaleString()}</span></div>
          <div class="grand-total-item"><label>M-Pesa Charges</label><span>KSh ${grandMpesa.toLocaleString()}</span></div>
        </div>
      </div>
      <div class="grand-total-amount">KSh ${grandTotal.toLocaleString()}</div>
    </div>

    ${renderPlatformSections()}
  </div>

  <div class="no-print">
    <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>

  <div class="footer">
    <span>Kwenik Market Prices · Challenge ID: ${challenge.id}</span>
    <span>Auto-generated · ${fmtDT(new Date())}</span>
  </div>
</div>
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="challenge-results-${id}.html"`,
    },
  })
}
