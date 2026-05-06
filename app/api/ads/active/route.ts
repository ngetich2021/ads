import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

function parseArr(v: unknown): string[] {
  try { return JSON.parse(String(v)) } catch { return [] }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const countyId = sp.get('countyId') ?? undefined
    const marketId = sp.get('marketId') ?? undefined
    const now = new Date()
    const rows = await db.ad.findMany({
      where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gte: now } },
      include: { package: { select: { positions: true, playsPerHour: true } } },
      orderBy: { startsAt: 'asc' },
    })
    const ads = rows
      .filter(r => {
        if (r.target === 'NATIONAL') return true
        if (r.target === 'COUNTY') return !!countyId && parseArr(r.targetCountyIds).includes(countyId)
        if (r.target === 'MARKET') return !!marketId && parseArr(r.targetMarketIds).includes(marketId)
        return true
      })
      .map(r => ({
        id: r.id,
        title: r.title,
        linkUrl: r.linkUrl,
        videoSrc: r.videoUrl ?? `/api/ads/${r.id}/video`,
        videoMime: r.videoMime,
        positions: parseArr(r.package.positions),
        playsPerHour: r.package.playsPerHour,
      }))
    return Response.json(ads)
  } catch {
    return Response.json([], { status: 200 })
  }
}
