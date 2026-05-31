import { config } from "dotenv"
config({ path: ".env.local" })

import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting database seed...")

  const superAdminUsername = process.env.SUPER_ADMIN_USERNAME
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD

  if (!superAdminUsername || !superAdminPassword) {
    throw new Error(
      "Missing required environment variables: SUPER_ADMIN_USERNAME, SUPER_ADMIN_PASSWORD"
    )
  }

  const BCRYPT_ROUNDS = 12

  const superAdminHash = await bcrypt.hash(superAdminPassword, BCRYPT_ROUNDS)
  const superAdmin = await prisma.admin.upsert({
    where: { username: superAdminUsername },
    update: {
      passwordHash: superAdminHash,
      role: "SUPER_ADMIN",
      isActive: true,
    },
    create: {
      username: superAdminUsername,
      passwordHash: superAdminHash,
      role: "SUPER_ADMIN",
      isActive: true,
    },
  })
  console.log(`✅ Super Admin upserted: ${superAdmin.username}`)

  const existingSettings = await prisma.settings.findFirst()
  if (!existingSettings) {
    await prisma.settings.create({
      data: {
        companyName: "Ulsaham Entertainments",
      },
    })
    console.log("✅ Default settings created")
  } else {
    console.log("ℹ️  Settings already exist, skipping")
  }

  console.log("\n🎉 Seed completed successfully!")
  console.log(`   Super Admin: ${superAdminUsername}`)
  console.log("   Additional admins can be created from the Admin Management page.")
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
