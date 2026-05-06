#!/usr/bin/env node
/**
 * Runs ALTER TABLE migrations that db-push.mjs cannot handle
 * (it only generates CREATE TABLE IF NOT EXISTS, not ADD COLUMN).
 * Safe to re-run — each statement is attempted independently and
 * "duplicate column" errors are silently ignored.
 */
import 'dotenv/config'
import { createClient } from '@libsql/client'

if (!process.env.TURSO_DATABASE_URL) {
  console.error('❌  TURSO_DATABASE_URL is not set in .env')
  process.exit(1)
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const migrations = [
  `ALTER TABLE "Ad" ADD COLUMN "durationDays" INTEGER NOT NULL DEFAULT 7`,
  `ALTER TABLE "Ad" ADD COLUMN "target" TEXT NOT NULL DEFAULT 'NATIONAL'`,
  `ALTER TABLE "Ad" ADD COLUMN "targetCountyIds" TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE "Ad" ADD COLUMN "targetMarketIds" TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE "Ad" ADD COLUMN "linkUrl" TEXT`,
]

console.log(`\nRunning ${migrations.length} column migrations...\n`)

let applied = 0
let skipped = 0

for (const sql of migrations) {
  try {
    await client.execute(sql)
    console.log(`  ✅  ${sql.slice(0, 60)}`)
    applied++
  } catch (e) {
    const msg = String(e.message ?? e).split('\n')[0]
    if (msg.toLowerCase().includes('duplicate column') || msg.toLowerCase().includes('already exists')) {
      console.log(`  ⏭  Already exists: ${sql.slice(0, 60)}`)
    } else {
      console.warn(`  ⚠  Failed: ${msg}`)
    }
    skipped++
  }
}

await client.close()
console.log(`\n✅  Done — ${applied} applied, ${skipped} skipped\n`)
