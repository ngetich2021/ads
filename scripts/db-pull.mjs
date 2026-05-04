/**
 * Syncs all data from Turso → local.db so `prisma studio` can display it.
 * Run: npm run db:pull
 */
import { config } from 'dotenv'
config()
import { createClient } from '@libsql/client'
import { execSync } from 'child_process'
import { unlinkSync, existsSync } from 'fs'

const TABLES = [
  'Country','County','Market','Item','MarketPrice',
  'Route','Fare','AllowedEmail','UserProfile',
  'DropShipItem','DropShipSale','News',
  'Challenge','MpesaPayment','NeedRequest','NeedRequestUpdate','ChallengeSubmission',
]

// Always start fresh so schema stays in sync with schema.prisma
if (existsSync('local.db')) {
  try { unlinkSync('local.db') }
  catch { /* file busy (Studio open?) — will drop/recreate tables below */ }
}

// Build local.db schema from current schema.prisma
const raw = execSync(
  'npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script',
  { encoding: 'utf8' }
)
const lines = raw.replace(/\r\n/g, '\n').split('\n')
const first = lines.findIndex(l => l.trim().startsWith('--') || /^(CREATE|DROP|ALTER)/i.test(l.trim()))
const sql = first === -1 ? '' : lines.slice(first).join('\n')
const statements = sql
  .split(/;\s*\n/)
  .map(s => { const ls = s.trim().split('\n'); const f = ls.findIndex(l => !l.trim().startsWith('--')); return f === -1 ? '' : ls.slice(f).join('\n').trim() })
  .filter(s => s.length > 0)
  .map(s => s)

const local = createClient({ url: 'file:local.db' })
await local.execute('PRAGMA foreign_keys = OFF')
// Drop all tables in reverse order to satisfy FK constraints, then recreate
for (const t of [...TABLES].reverse()) {
  try { await local.execute(`DROP TABLE IF EXISTS "${t}"`) } catch {}
}
for (const stmt of statements) {
  try { await local.execute(stmt) } catch (e) {
    process.stderr.write(`Schema stmt failed: ${e.message.split('\n')[0]}\n`)
  }
}

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

let total = 0

for (const table of TABLES) {
  let rows
  try {
    const res = await turso.execute(`SELECT * FROM "${table}"`)
    rows = res.rows
    if (!rows || rows.length === 0) continue
    const cols = res.columns
    await local.execute(`DELETE FROM "${table}"`)
    for (const row of rows) {
      const placeholders = cols.map(() => '?').join(', ')
      const values = cols.map(c => {
        const v = row[c]
        // BigInt → number
        return typeof v === 'bigint' ? Number(v) : v
      })
      await local.execute({ sql: `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`, args: values })
      total++
    }
    process.stdout.write(`  ${table}: ${rows.length} rows\n`)
  } catch (e) {
    process.stdout.write(`  ${table}: skipped (${e.message.split('\n')[0]})\n`)
  }
}

await local.execute('PRAGMA foreign_keys = ON')
await turso.close()
await local.close()
console.log(`\nDone — ${total} rows synced to local.db. Run: npx prisma studio\n`)
