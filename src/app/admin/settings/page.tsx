"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { settingsSchema, type SettingsFormValues } from "@/validators/settings.validator"
import { getSettingsAction, updateSettingsAction } from "@/actions/settings.actions"

export default function SettingsPage() {
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      companyName: "Ulsaham Entertainments",
      address: "",
      email: "",
      phone: "",
      facebook: "",
      instagram: "",
      youtube: "",
      linkedin: "",
    },
  })

  useEffect(() => {
    getSettingsAction().then((settings) => {
      if (settings) {
        form.reset({
          companyName: settings.companyName,
          address: settings.address ?? "",
          email: settings.email ?? "",
          phone: settings.phone ?? "",
          facebook: settings.facebook ?? "",
          instagram: settings.instagram ?? "",
          youtube: settings.youtube ?? "",
          linkedin: settings.linkedin ?? "",
        })
      }
    })
  }, [form])

  const isSubmitting = form.formState.isSubmitting

  async function onSubmit(values: SettingsFormValues) {
    const result = await updateSettingsAction(values)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Settings updated successfully")
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-black">Settings</h1>
        <p className="text-sm text-black mt-1">Manage company information</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company Details</CardTitle>
              <CardDescription>Basic information about your company</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ulsaham Entertainments" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Company address"
                        className="resize-none"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="info@ulsaham.com"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="9876543210"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Social Media</CardTitle>
              <CardDescription>Links to your social profiles</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(["facebook", "instagram", "youtube", "linkedin"] as const).map((platform) => (
                <FormField
                  key={platform}
                  control={form.control}
                  name={platform}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="capitalize">{platform}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={`https://${platform}.com/ulsaham`}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </CardContent>
          </Card>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Settings
          </Button>
        </form>
      </Form>
    </div>
  )
}
