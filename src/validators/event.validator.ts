import { z } from "zod"
import { EventStatus } from "@prisma/client"

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
  status: z.nativeEnum(EventStatus).default(EventStatus.ANNOUNCED),
  capacity: z.coerce.number().int().positive("Capacity must be a positive integer").optional().nullable(),
  featured: z.boolean().default(false),
})

export const createEventSchema = baseEventSchema.refine(
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
