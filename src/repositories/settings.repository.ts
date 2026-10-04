import { prisma } from "@/lib/prisma"
import type { PendingImageDelete, Prisma } from "@prisma/client"

// There is meant to be one settings row. Should two first visits at once ever
// create two, every read and write takes the oldest, so they all use the same.
const OLDEST_FIRST = { id: "asc" } as const

export async function getSettings() {
  const settings = await prisma.settings.findFirst({ orderBy: OLDEST_FIRST })
  if (!settings) {
    return prisma.settings.create({
      data: { companyName: "Ulsaham Entertainments" },
    })
  }
  return settings
}

/** The settings row's id, creating the row on first use. */
async function settingsId(): Promise<string> {
  const settings = await prisma.settings.findFirst({ orderBy: OLDEST_FIRST, select: { id: true } })
  if (settings) return settings.id
  const created = await prisma.settings.create({
    data: { companyName: "Ulsaham Entertainments" },
    select: { id: true },
  })
  return created.id
}

export async function upsertSettings(data: Prisma.SettingsUpdateInput) {
  const existing = await prisma.settings.findFirst({ orderBy: OLDEST_FIRST, select: { id: true } })
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

/** Adds a partner in one atomic push, so two adds at the same moment both stay. */
export async function addBrandPartner(partner: {
  id: string
  name: string
  logoUrl: string
  logoId: string
}) {
  return prisma.settings.update({
    where: { id: await settingsId() },
    data: { brandPartners: { push: partner } },
  })
}

/**
 * Removes a partner in one atomic deleteMany, so an add at the same moment is
 * kept. Returns the partner as it was stored (its logoId is the image to
 * delete), or null when it is already gone.
 */
export async function removeBrandPartner(partnerId: string) {
  const settings = await prisma.settings.findFirst({
    orderBy: OLDEST_FIRST,
    select: { id: true, brandPartners: true },
  })
  const partner = settings?.brandPartners.find((p) => p.id === partnerId)
  if (!settings || !partner) return null
  await prisma.settings.update({
    where: { id: settings.id },
    data: { brandPartners: { deleteMany: { where: { id: partnerId } } } },
  })
  return partner
}

/** The contact details tickets print, or null when settings were never saved. */
export async function findTicketContactSettings() {
  return prisma.settings.findFirst({
    orderBy: OLDEST_FIRST,
    select: { phone: true, instagram: true },
  })
}

/** Adds images to the deletion queue in one atomic push (see scheduleImageDeletes). */
export async function queueImageDeletes(entries: PendingImageDelete[]) {
  await prisma.settings.update({
    where: { id: await settingsId() },
    data: { pendingImageDeletes: { push: entries } },
  })
}

/** The deletion queue, plus the logos brand partners use, which are never deleted. */
export async function findImageDeleteQueue(): Promise<{ pending: PendingImageDelete[]; partnerLogoIds: string[] }> {
  const settings = await prisma.settings.findFirst({
    orderBy: OLDEST_FIRST,
    select: { pendingImageDeletes: true, brandPartners: true },
  })
  return {
    pending: settings?.pendingImageDeletes ?? [],
    partnerLogoIds: (settings?.brandPartners ?? []).map((p) => p.logoId),
  }
}

/** Takes these images off the queue: their entries that were due by `dueBy`. */
export async function removeQueuedImageDeletes(publicIds: string[], dueBy: Date) {
  const settings = await prisma.settings.findFirst({ orderBy: OLDEST_FIRST, select: { id: true } })
  if (!settings) return
  await prisma.settings.update({
    where: { id: settings.id },
    data: {
      pendingImageDeletes: { deleteMany: { where: { publicId: { in: publicIds }, deleteAfter: { lte: dueBy } } } },
    },
  })
}
