import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getSettings } from "@/repositories/settings.repository"
import { SettingsForm } from "@/components/settings/settings-form"
import { BrandPartnersSection } from "@/components/settings/brand-partners-section"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Settings" }

export default async function SettingsPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (role !== "SUPER_ADMIN") redirect("/admin/events")

  const settings = await getSettings()

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-black">Settings</h1>
        <p className="text-sm text-black mt-1">Manage company information</p>
      </div>

      <SettingsForm
        initialValues={{
          companyName: settings.companyName,
          address: settings.address,
          email: settings.email,
          phone: settings.phone,
          facebook: settings.facebook,
          instagram: settings.instagram,
          youtube: settings.youtube,
          linkedin: settings.linkedin,
        }}
      />

      <BrandPartnersSection partners={settings.brandPartners} />
    </div>
  )
}
