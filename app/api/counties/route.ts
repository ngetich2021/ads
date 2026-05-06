import { db } from '@/lib/db'

export async function GET() {
  try {
    const rows = await db.county.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        markets: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
      },
    })
    return Response.json(rows)
  } catch {
    return Response.json([], { status: 200 })
  }
}
