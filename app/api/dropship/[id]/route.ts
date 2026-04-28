import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return new Response('Not found', { status: 404 })

  const row = await db.dropShipItem.findUnique({
    where: { id },
    select: { fileName: true, fileData: true, fileMime: true },
  })

  if (!row || !row.fileData) return new Response('Not found', { status: 404 })

  const encoded = encodeURIComponent(row.fileName)
  return new Response(row.fileData, {
    headers: {
      'Content-Type': row.fileMime,
      'Content-Disposition': `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      'Content-Length': String(row.fileData.length),
    },
  })
}
