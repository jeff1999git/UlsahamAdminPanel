import { prisma } from "@/lib/prisma"
import type { AdminRole } from "@prisma/client"

export async function findAllAdmins() {
  return prisma.admin.findMany({
    where: { role: { in: ["ADMIN", "USER"] } },
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function findAdminById(id: string) {
  return prisma.admin.findUnique({ where: { id } })
}

export async function findAdminByUsername(username: string) {
  return prisma.admin.findUnique({ where: { username } })
}

export async function createAdminAccount(data: {
  username: string
  passwordHash: string
  role: AdminRole
}) {
  return prisma.admin.create({
    data: {
      username: data.username,
      passwordHash: data.passwordHash,
      role: data.role,
      isActive: true,
    },
  })
}

export async function toggleAdminActive(id: string, isActive: boolean) {
  return prisma.admin.update({ where: { id }, data: { isActive } })
}

export async function updateAdminPassword(id: string, passwordHash: string) {
  return prisma.admin.update({ where: { id }, data: { passwordHash } })
}

export async function deleteAdminAccount(id: string) {
  return prisma.admin.delete({ where: { id } })
}
