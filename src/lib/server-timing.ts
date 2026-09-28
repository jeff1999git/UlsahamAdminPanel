import { prisma } from "@/lib/prisma"

/**
 * Opt-in Server-Timing for the public GET routes, to see where a request's
 * time goes: the rate-limit call, each database phase, one bare MongoDB round
 * trip ("ping"), the function region and whether this was the instance's first
 * request. Off unless SERVER_TIMING=1: the header exposes internal topology, so
 * turn it on only for a measurement window (a preview, or briefly in
 * production) and remove it afterwards.
 */
const ENABLED = process.env.SERVER_TIMING === "1"

let served = 0

export type ServerTiming = {
  /** Runs `work` and records how long it took under `name`. */
  time<T>(name: string, work: () => Promise<T>): Promise<T>
  /** Times one database round trip. Adds that round trip, so only when enabled. */
  ping(): Promise<void>
  /** The Server-Timing header to merge into the response (empty when disabled). */
  headers(): Record<string, string>
}

export const noTiming: ServerTiming = {
  time<T>(_name: string, work: () => Promise<T>) {
    return work()
  },
  async ping() {},
  headers() {
    return {}
  },
}

export function startServerTiming(): ServerTiming {
  if (!ENABLED) return noTiming

  const cold = served++ === 0
  const entries: string[] = []

  const timing: ServerTiming = {
    async time<T>(name: string, work: () => Promise<T>) {
      const start = performance.now()
      try {
        return await work()
      } finally {
        entries.push(`${name};dur=${(performance.now() - start).toFixed(1)}`)
      }
    },
    async ping() {
      await timing.time("ping", () => prisma.$runCommandRaw({ ping: 1 })).catch(() => {})
    },
    headers() {
      const meta = [`region;desc="${process.env.VERCEL_REGION ?? "local"}"`, `cold;desc="${cold ? 1 : 0}"`]
      return { "Server-Timing": [...entries, ...meta].join(", ") }
    },
  }
  return timing
}
