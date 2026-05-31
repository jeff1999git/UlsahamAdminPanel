import type { AdminRole } from "@prisma/client"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      username: string
      role: AdminRole
    } & DefaultSession["user"]
  }

  interface User {
    role: AdminRole
  }
}

export type AdminSession = {
  id: string
  username: string
  role: AdminRole
}
