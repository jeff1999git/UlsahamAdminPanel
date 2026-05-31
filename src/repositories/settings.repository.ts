import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function getSettings() {
  const settings = await prisma.settings.findFirst()
  if (!settings) {
    return prisma.settings.create({
      data: { companyName: "Ulsaham Entertainments" },
    })
  }
  return settings
}

export async function upsertSettings(data: Prisma.SettingsUpdateInput) {
  const existing = await prisma.settings.findFirst()
  if (existing) {
    return prisma.settings.update({
      where: { id: existing.id },
      data,
    })
  }
  return prisma.settings.create({
    data: data as Prisma.SettingsCreateInput,
  })
}
