import { z } from "zod"
import { EventStatus } from "@prisma/client"

const complimentaryCodeSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(50, "Code must be at most 50 characters")
    .transform((v) => v.toUpperCase()),
  maxUses: z.coerce.number().int().positive("Max uses must be a positive number"),
  usedCount: z.coerce.number().int().min(0).default(0),
})

export type ComplimentaryCodeFormValue = z.infer<typeof complimentaryCodeSchema>

const couponCodeSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(50, "Code must be at most 50 characters")
    .transform((v) => v.toUpperCase()),
  discount: z.coerce.number().positive("Discount must be a positive number"),
})

export type CouponCodeFormValue = z.infer<typeof couponCodeSchema>

const baseEventSchema = z.object({
  name: z
    .string()
    .min(2, "Event name must be at least 2 characters")
    .max(200, "Event name must be at most 200 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(200, "Slug must be at most 200 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(5000, "Description must be at most 5000 characters"),
  bannerImageUrl: z.string().url("Banner image URL is required"),
  bannerImageId: z.string().min(1, "Banner image ID is required"),
  venue: z
    .string()
    .min(2, "Venue must be at least 2 characters")
    .max(500, "Venue must be at most 500 characters"),
  venueLink: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url("Must be a valid URL").optional().nullable()
  ),
  date: z.coerce.date({ required_error: "Event date is required" }),
  startTime: z
    .string()
    .min(1, "Start time is required")
    .regex(/^\d{1,2}:\d{2}\s?(AM|PM)$/i, "Invalid time format"),
  endTime: z
    .string()
    .min(1, "End time is required")
    .regex(/^\d{1,2}:\d{2}\s?(AM|PM)$/i, "Invalid time format"),
  isFree: z.boolean().default(true),
  amount: z.coerce.number().positive("Amount must be positive").optional().nullable(),
  earlyBirdAmount: z.coerce.number().positive("Early bird amount must be positive").optional().nullable(),
  isEarlyBird: z.boolean().default(false),
  status: z.nativeEnum(EventStatus).default(EventStatus.ANNOUNCED),
  capacity: z.coerce.number().int().positive("Capacity must be a positive integer").optional().nullable(),
  featured: z.boolean().default(false),
  gstEnabled: z.boolean().default(false),
  platformFeeEnabled: z.boolean().default(true),
  couponCodes: z.array(couponCodeSchema).optional(),
  complimentaryCodes: z.array(complimentaryCodeSchema).optional(),
})

export const createEventSchema = baseEventSchema
  .refine(
    (data) => {
      if (!data.isFree && (data.amount === undefined || data.amount === null)) {
        return false
      }
      return true
    },
    {
      message: "Amount is required for paid events",
      path: ["amount"],
    }
  )
  .refine(
    (data) => {
      if (!data.date) return true
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return data.date >= today
    },
    {
      message: "Event date must be today or in the future",
      path: ["date"],
    }
  )

export const updateEventSchema = baseEventSchema
  .partial()
  .extend({ id: z.string().min(1, "Event ID is required") })
  .refine(
    (data) => {
      if (data.isFree === false && (data.amount === undefined || data.amount === null)) {
        return false
      }
      return true
    },
    {
      message: "Amount is required for paid events",
      path: ["amount"],
    }
  )

export type CreateEventFormValues = z.infer<typeof createEventSchema>
export type UpdateEventFormValues = z.infer<typeof updateEventSchema>
