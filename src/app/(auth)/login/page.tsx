import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "@/components/auth/login-form"
import { APP_NAME } from "@/constants"

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#014421] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/brand_logo_440.avif"
            alt={APP_NAME}
            width={220}
            height={110}
            style={{ height: "auto" }}
            className="rounded-2xl shadow-lg"
            priority
          />
          <p className="text-white/70 text-sm">Admin Panel</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-center">Sign In</CardTitle>
            <CardDescription className="text-center">
              Enter your admin credentials to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>

        <p className="text-center text-white/50 text-xs">
          Unauthorized access is prohibited.
        </p>
      </div>
    </div>
  )
}
