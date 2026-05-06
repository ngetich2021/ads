import { db } from '@/lib/db'

function parseArr(v: unknown): string[] {
  try { return JSON.parse(String(v)) } catch { return [] }
}

export async function GET() {
  try {
    const rows = await db.adPackage.findMany({
      where: { active: true },
      orderBy: { price: 'asc' },
    })
    return Response.json(rows.map(r => ({
      id: r.id, name: r.name, price: r.price,
      durationDays: r.durationDays, playsPerHour: r.playsPerHour,
      positions: parseArr(r.positions), description: r.description, active: r.active,
    })))
  } catch (e) {
    console.error('packages fetch error', e)
    return Response.json([], { status: 200 })
  }
}
