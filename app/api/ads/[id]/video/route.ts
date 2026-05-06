import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const row = await db.ad.findUnique({
      where: { id },
      select: { videoData: true, videoMime: true },
    })
    if (!row?.videoData) return new Response('Not found', { status: 404 })
    return new Response(row.videoData, {
      headers: {
        'Content-Type': row.videoMime,
        'Content-Length': String(row.videoData.length),
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
