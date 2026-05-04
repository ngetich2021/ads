import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // URL used by Prisma CLI only (generate, migrate diff).
  // Runtime uses the PrismaLibSql adapter in lib/db.ts — this file is not involved at runtime.
  datasource: {
    url: 'file:./local.db',
  },
})
