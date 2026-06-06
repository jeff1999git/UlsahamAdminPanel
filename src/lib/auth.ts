import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "../../auth.config"
import { prisma } from "@/lib/prisma"

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { username, password } = parsed.data

        const admin = await prisma.admin.findUnique({ where: { username } })
        if (!admin || !admin.isActive) return null

        const match = await bcrypt.compare(password, admin.passwordHash)
        if (!match) return null

        await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } })

        return { id: admin.id, name: admin.username, email: null, role: admin.role }
      },
    }),
  ],
})
