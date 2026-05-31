import { z } from "zod"

export const settingsSchema = z.object({
  companyName: z
    .string()
    .min(2, "Company name must be at least 2 characters")
    .max(200, "Company name must be at most 200 characters")
    .default("Ulsaham Entertainments"),
  address: z.string().max(500).optional().nullable().or(z.literal("")),
  email: z.string().email("Invalid email address").optional().nullable().or(z.literal("")),
  phone: z
    .string()
    .regex(/^\d{10,15}$/, "Phone must be 10-15 digits")
    .optional()
    .nullable()
    .or(z.literal("")),
  facebook: z.string().url("Invalid URL").optional().nullable().or(z.literal("")),
  instagram: z.string().url("Invalid URL").optional().nullable().or(z.literal("")),
  youtube: z.string().url("Invalid URL").optional().nullable().or(z.literal("")),
  linkedin: z.string().url("Invalid URL").optional().nullable().or(z.literal("")),
})

export type SettingsFormValues = z.infer<typeof settingsSchema>
