import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "../../auth.config"
import { prisma } from "@/lib/prisma"
import { logActivity } from "@/lib/activity-logger"

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

// A cost-12 bcrypt hash (the cost admin passwords are hashed with) of a random
// string nobody knows. Unknown and inactive usernames are compared against it,
// so they take as long to refuse as a wrong password and the response time
// does not reveal which usernames exist.
const DUMMY_PASSWORD_HASH = "$2a$12$Paxoy335DfbjJMANxWDvUeiWd3OlGYxj8s5AO6zMWLWiHg9.bZQzy"

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
        if (!admin || !admin.isActive) {
          await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
          return null
        }

        const match = await bcrypt.compare(password, admin.passwordHash)
        if (!match) return null

        await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } })

        // Logged here rather than in loginAction: auth() cannot see the session
        // cookie signIn sets during the same request.
        await logActivity({
          adminUsername: admin.username,
          adminRole: admin.role,
          action: "LOGIN",
          entity: "Admin",
          entityId: admin.id,
          description: `${admin.username} logged in`,
        })

        return { id: admin.id, name: admin.username, email: null, role: admin.role }
      },
    }),
  ],
})
