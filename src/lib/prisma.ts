import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

// Start connecting as soon as a route loads, so the engine start and MongoDB
// handshake overlap the rate-limit call instead of waiting for the first
// query. Never during `next build`, which loads route modules but must not
// reach the database. A failed early connect is retried by the first query.
if (process.env.NEXT_PHASE !== "phase-production-build") {
  prisma.$connect().catch(() => {})
}
