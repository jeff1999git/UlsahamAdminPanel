import { expect, it, vi } from "vitest"
vi.mock("@/lib/prisma", () => ({ prisma: { $runCommandRaw: vi.fn(async () => ({ ok: 1 })) } }))
import { prisma } from "@/lib/prisma"
it("probe", async () => {
  expect(await prisma.$runCommandRaw({ ping: 1 })).toEqual({ ok: 1 })
})
