"use client"

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
import { settingsSchema, type SettingsFormValues } from "@/validators/settings.validator"
import { updateSettingsAction } from "@/actions/settings.actions"

interface SettingsFormProps {
  initialValues: {
    companyName: string
    address?: string | null
    email?: string | null
    phone?: string | null
    facebook?: string | null
    instagram?: string | null
    youtube?: string | null
    linkedin?: string | null
  }
}

export function SettingsForm({ initialValues }: SettingsFormProps) {
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      companyName: initialValues.companyName,
      address: initialValues.address ?? "",
      email: initialValues.email ?? "",
      phone: initialValues.phone ?? "",
      facebook: initialValues.facebook ?? "",
      instagram: initialValues.instagram ?? "",
      youtube: initialValues.youtube ?? "",
      linkedin: initialValues.linkedin ?? "",
    },
  })

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
  )
}
