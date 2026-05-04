#!/usr/bin/env node
/**
 * Pushes the Prisma schema to Turso (libSQL).
 * Use `npm run db:push` instead of `npx prisma db push`.
 *
 * Safe to run multiple times — uses IF NOT EXISTS for every statement.
 */
import 'dotenv/config'
import { createClient } from '@libsql/client'
import { execSync } from 'child_process'

if (!process.env.TURSO_DATABASE_URL) {
  console.error('❌  TURSO_DATABASE_URL is not set in .env')
  process.exit(1)
}

// Generate the full schema as SQL (no DB connection required)
let raw
try {
  raw = execSync(
    'npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script',
    { encoding: 'utf8' }
  )
} catch (e) {
  console.error(e.message)
  process.exit(1)
}

// Prisma may prepend info lines (e.g. "Loaded Prisma config...") before the SQL.
// Drop every line that comes before the first SQL line.
const lines = raw.replace(/\r\n/g, '\n').split('\n')
const firstSqlLine = lines.findIndex(l =>
  l.trim().startsWith('--') || /^(CREATE|DROP|ALTER|INSERT|PRAGMA)/i.test(l.trim())
)
const sql = firstSqlLine === -1 ? '' : lines.slice(firstSqlLine).join('\n')

if (!sql.trim()) {
  console.error('❌  migrate diff produced no SQL. Check prisma.config.ts and schema.prisma.')
  process.exit(1)
}

// Make every statement idempotent so re-runs are safe
const idempotentSql = sql
  .replace(/CREATE TABLE (?!IF NOT EXISTS)/g, 'CREATE TABLE IF NOT EXISTS ')
  .replace(/CREATE UNIQUE INDEX (?!IF NOT EXISTS)/g, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
  .replace(/CREATE INDEX (?!IF NOT EXISTS)/g, 'CREATE INDEX IF NOT EXISTS ')

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

// Split on statement boundaries — each statement ends with ;
const statements = idempotentSql
  .split(/;\s*\n/)
  .map(s => {
    // Strip leading SQL comment lines (e.g. "-- CreateTable") to get the real statement
    const ls = s.trim().split('\n')
    const first = ls.findIndex(l => !l.trim().startsWith('--'))
    return first === -1 ? '' : ls.slice(first).join('\n').trim()
  })
  .filter(s => s.length > 0 && !s.startsWith('/*'))

console.log(`\nApplying ${statements.length} statements to Turso...\n`)

let applied = 0
let skipped = 0

for (const stmt of statements) {
  try {
    await client.execute(stmt)
    applied++
  } catch (e) {
    const msg = String(e.message ?? e).split('\n')[0]
    console.warn(`  ⚠  Skipped: ${msg}`)
    skipped++
  }
}

await client.close()
console.log(`\n✅  Done — ${applied} applied, ${skipped} skipped\n`)
